#!/usr/bin/env bash
# setup-gcp-cicd.sh
# Run ONCE from a local machine that has gcloud authenticated as an owner/editor.
#
# What this script does:
#   1. Creates an Artifact Registry repository for Docker images
#   2. Creates a dedicated CI/CD service account
#   3. Grants the minimum IAM roles required by the pipeline
#   4. Sets up Workload Identity Federation so GitHub Actions can authenticate
#      WITHOUT storing any service-account JSON key
#
# Usage:
#   export PROJECT_ID=my-gcp-project
#   export GITHUB_ORG=AceVikings
#   export GITHUB_REPO=bootcamp-capstone-perps
#   bash scripts/setup-gcp-cicd.sh

set -euo pipefail

: "${PROJECT_ID:?Set PROJECT_ID}"
: "${GITHUB_ORG:?Set GITHUB_ORG}"
: "${GITHUB_REPO:?Set GITHUB_REPO}"

SA_NAME="fractal-cicd"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
POOL_ID="github-pool"
PROVIDER_ID="github-provider"
REGISTRY_LOCATION="us"
REGISTRY_REPO="fractal"

echo "=== Project: ${PROJECT_ID} ==="
gcloud config set project "${PROJECT_ID}"

# ── Numeric project number (required for WIF resource names) ─────────────────
PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format="value(projectNumber)")
echo "Project number: ${PROJECT_NUMBER}"

# ── Enable required APIs ──────────────────────────────────────────────────────
echo "=== Enabling APIs ==="
gcloud services enable \
  artifactregistry.googleapis.com \
  iamcredentials.googleapis.com \
  compute.googleapis.com \
  iam.googleapis.com \
  iap.googleapis.com

# ── Artifact Registry repository ─────────────────────────────────────────────
echo "=== Creating Artifact Registry repository ==="
gcloud artifacts repositories create "${REGISTRY_REPO}" \
  --repository-format=docker \
  --location="${REGISTRY_LOCATION}" \
  --description="Fractal backend Docker images" \
  --project="${PROJECT_ID}" 2>/dev/null || echo "Repository already exists — skipping"

# ── Service account ───────────────────────────────────────────────────────────
echo "=== Creating service account: ${SA_NAME} ==="
gcloud iam service-accounts create "${SA_NAME}" \
  --display-name="Fractal CI/CD (GitHub Actions)" \
  --project="${PROJECT_ID}" 2>/dev/null || echo "Service account already exists — skipping"

# ── IAM roles ─────────────────────────────────────────────────────────────────
echo "=== Granting IAM roles ==="

# Push Docker images to Artifact Registry
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/artifactregistry.writer" \
  --condition=None

# SSH into the VM via OS Login (no static SSH key required)
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/compute.osAdminLogin" \
  --condition=None

# Open an IAP tunnel to the VM (required for gcloud compute ssh/scp)
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/iap.tunnelResourceAccessor" \
  --condition=None

# Allow the SA to impersonate itself for token exchange (WIF requirement)
gcloud iam service-accounts add-iam-policy-binding "${SA_EMAIL}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/iam.serviceAccountTokenCreator"

# ── Workload Identity Pool ────────────────────────────────────────────────────
echo "=== Creating Workload Identity Pool: ${POOL_ID} ==="
gcloud iam workload-identity-pools create "${POOL_ID}" \
  --location="global" \
  --display-name="GitHub Actions" \
  --project="${PROJECT_ID}" 2>/dev/null || echo "Pool already exists — skipping"

# ── OIDC provider (GitHub) ────────────────────────────────────────────────────
echo "=== Creating OIDC provider: ${PROVIDER_ID} ==="
gcloud iam workload-identity-pools providers create-oidc "${PROVIDER_ID}" \
  --location="global" \
  --workload-identity-pool="${POOL_ID}" \
  --display-name="GitHub Actions OIDC" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="\
google.subject=assertion.sub,\
attribute.actor=assertion.actor,\
attribute.repository=assertion.repository,\
attribute.repository_owner=assertion.repository_owner" \
  --attribute-condition="assertion.repository_owner == '${GITHUB_ORG}'" \
  --project="${PROJECT_ID}" 2>/dev/null || echo "Provider already exists — skipping"

# ── Bind the SA to identities from this specific repo ────────────────────────
echo "=== Binding service account to WIF pool ==="
PRINCIPAL="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.repository/${GITHUB_ORG}/${GITHUB_REPO}"

gcloud iam service-accounts add-iam-policy-binding "${SA_EMAIL}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="${PRINCIPAL}" \
  --project="${PROJECT_ID}"

# ── Print the values you need to add as GitHub Variables ─────────────────────
PROVIDER_RESOURCE="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/providers/${PROVIDER_ID}"

echo ""
echo "=========================================================="
echo " Setup complete.  Add these as GitHub Actions Variables:  "
echo " (Settings → Secrets and variables → Actions → Variables) "
echo "=========================================================="
echo ""
echo "  GCP_PROJECT_ID        = ${PROJECT_ID}"
echo "  GCP_PROJECT_NUMBER    = ${PROJECT_NUMBER}"
echo "  GCP_WIF_PROVIDER      = ${PROVIDER_RESOURCE}"
echo "  GCP_SERVICE_ACCOUNT   = ${SA_EMAIL}"
echo "  GCP_INSTANCE_NAME     = <your VM name>"
echo "  GCP_ZONE              = <your VM zone, e.g. us-central1-a>"
echo ""
echo "No secrets are needed — Workload Identity Federation is keyless."
echo ""
echo "IMPORTANT: Enable OS Login on the VM (if not already):"
echo "  gcloud compute instances add-metadata <VM_NAME> --zone=<ZONE> \\"
echo "    --metadata=enable-oslogin=TRUE --metadata=enable-oslogin-2fa=FALSE"
