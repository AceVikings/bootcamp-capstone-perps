# ─── Stage 1: cargo-chef planner ─────────────────────────────────────────────
# cargo-chef pre-computes the dependency tree so we can cache it separately
# from the application source.  This means a source-only change won't
# re-compile every crate from scratch.
FROM rust:1.88-slim-bookworm AS chef
RUN cargo install cargo-chef --locked
WORKDIR /app

# ─── Stage 2: dependency recipe ──────────────────────────────────────────────
FROM chef AS planner
COPY . .
RUN cargo chef prepare --recipe-path recipe.json

# ─── Stage 3: build ──────────────────────────────────────────────────────────
FROM chef AS builder

# OS deps needed for native TLS (sqlx uses openssl by default)
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Cook (compile) dependencies only — this layer is cached as long as
# Cargo.toml / Cargo.lock don't change.
COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json

# Now copy source and do the final build
COPY . .
RUN cargo build --release --bin fractal-api --bin fractal-indexer

# ─── Stage 4: minimal runtime image ──────────────────────────────────────────
FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

# Copy both binaries so the same image can run either service
COPY --from=builder /app/target/release/fractal-api      /usr/local/bin/fractal-api
COPY --from=builder /app/target/release/fractal-indexer  /usr/local/bin/fractal-indexer

# Default to the API binary; override CMD in docker-compose for the indexer
CMD ["/usr/local/bin/fractal-api"]
