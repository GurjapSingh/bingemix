#!/usr/bin/env bash
#
# Deploy plex-show-mixer to the home server and bring it up via docker compose.
#
# Usage:
#   ./deploy.sh
#
# Override defaults via env vars, e.g.:
#   REMOTE_USER=gurjapsingh ./deploy.sh

set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-10.0.0.81}"
REMOTE_USER="${REMOTE_USER:-jaap}"
REMOTE_DIR="${REMOTE_DIR:-/mnt/data/data/arr/plex-show-mixer}"
DOCKER_COMPOSE_CMD="${DOCKER_COMPOSE_CMD:-docker compose}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE="${REMOTE_USER}@${REMOTE_HOST}"

echo "==> Ensuring remote directory exists: ${REMOTE}:${REMOTE_DIR}"
ssh "${REMOTE}" "mkdir -p '${REMOTE_DIR}'"

echo "==> Syncing project files to ${REMOTE}:${REMOTE_DIR}"
rsync -avz --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude 'data' \
  --exclude '.DS_Store' \
  --exclude '.idea' \
  --exclude '.claude' \
  --exclude '*.log' \
  --exclude 'deploy.sh' \
  "${SCRIPT_DIR}/" "${REMOTE}:${REMOTE_DIR}/"

# Excluded files aren't removed by --delete if they were copied up before
# they were excluded; prune any stale copy of this script from prior runs.
ssh "${REMOTE}" "rm -f '${REMOTE_DIR}/deploy.sh'"

echo "==> Bringing the stack up on ${REMOTE}"
ssh "${REMOTE}" "cd '${REMOTE_DIR}' && ${DOCKER_COMPOSE_CMD} up -d --build"

echo "==> Done. Container status:"
ssh "${REMOTE}" "cd '${REMOTE_DIR}' && ${DOCKER_COMPOSE_CMD} ps"
