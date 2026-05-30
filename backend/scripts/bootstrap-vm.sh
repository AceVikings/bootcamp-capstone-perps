#!/usr/bin/env bash
# bootstrap-vm.sh
# Run ONCE on a fresh GCP VM to set up Docker, the deploy directory, the
# .env file, and start the persistent infrastructure containers.
#
# Usage:
#   1. SSH into the VM
#   2. Copy this script: scp scripts/bootstrap-vm.sh user@VM_IP:/tmp/
#   3. Run: sudo bash /tmp/bootstrap-vm.sh
#   4. Then edit /opt/fractal/.env with real secret values
#   5. Run: cd /opt/fractal && docker compose up -d postgres redis

set -euo pipefail

# ─── Docker ──────────────────────────────────────────────────────────────────
echo "=== Installing Docker ==="
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi

# Allow the current non-root user to run Docker
if [ -n "${SUDO_USER:-}" ]; then
  usermod -aG docker "$SUDO_USER"
  echo "Added $SUDO_USER to docker group (re-login required)"
fi

# ─── gcloud CLI (needed on the VM for `gcloud auth configure-docker`) ────────
echo "=== Installing gcloud CLI ==="
if ! command -v gcloud &> /dev/null; then
  curl -fsSL https://sdk.cloud.google.com | bash -s -- --disable-prompts
  source "$HOME/.bashrc" 2>/dev/null || true
fi

# ─── Deploy directory ────────────────────────────────────────────────────────
echo "=== Creating /opt/fractal ==="
mkdir -p /opt/fractal
cd /opt/fractal

# ─── .env template (fill in real values after bootstrapping) ─────────────────
if [ ! -f .env ]; then
  cat > .env << 'EOF'
# ── Populated by CI/CD on every deploy ──────────────────────────────────────
REGISTRY=us-docker.pkg.dev
GCP_PROJECT_ID=REPLACE_ME
IMAGE_TAG=latest

# ── Postgres ─────────────────────────────────────────────────────────────────
POSTGRES_USER=tpp
POSTGRES_PASSWORD=REPLACE_ME
POSTGRES_DB=tpp_protocol
DATABASE_URL=postgres://tpp:REPLACE_ME@postgres:5432/tpp_protocol
DATABASE__POOL_SIZE=10

# ── App config ───────────────────────────────────────────────────────────────
API_PORT=8080
API_HOST=0.0.0.0
CORS_ALLOWED_ORIGINS=*

# ── Solana ───────────────────────────────────────────────────────────────────
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_WS_URL=wss://api.devnet.solana.com
PROGRAM_ID=REPLACE_ME
COLLATERAL_MINT=REPLACE_ME

# ── Indexer ──────────────────────────────────────────────────────────────────
INDEXER_START_SLOT=0
EOF
  echo "Created /opt/fractal/.env — fill in REPLACE_ME values before starting services"
fi

chmod 600 /opt/fractal/.env

# ─── Start infra containers (do this AFTER editing .env) ─────────────────────
echo ""
echo "=== Bootstrap complete ==="
echo ""
echo "Next steps:"
echo "  1. Edit /opt/fractal/.env and replace every REPLACE_ME value"
echo "  2. Copy docker-compose.yml:  scp backend/docker-compose.yml user@VM:/opt/fractal/"
echo "  3. Start infra (one-time):   cd /opt/fractal && docker compose up -d postgres redis"
echo "  4. Verify:                   docker compose ps"
echo ""
echo "The CI/CD pipeline will handle all subsequent app deployments."
echo "IMPORTANT: never run 'docker compose down -v' — that destroys your data volumes."
