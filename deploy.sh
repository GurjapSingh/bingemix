#!/usr/bin/env bash
#
# Deploy Bingemix to the home server and bring it up via docker compose.
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

echo "==> Deploying on ${REMOTE}"
ssh "${REMOTE}" "
  set -e
  cd '${REMOTE_DIR}'
  ${DOCKER_COMPOSE_CMD} down 2>/dev/null || true
  elapsed=0
  while [ \"\$(${DOCKER_COMPOSE_CMD} ps -q 2>/dev/null | wc -l)\" -gt 0 ] && [ \"\$elapsed\" -lt 10 ]; do
    sleep 1
    elapsed=\$((elapsed + 1))
  done
  echo '==> Bringing the stack up'
  ${DOCKER_COMPOSE_CMD} up -d --build
  echo '==> Done. Container status:'
  ${DOCKER_COMPOSE_CMD} ps
"
