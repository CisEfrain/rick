#!/usr/bin/env bash
# Rick Voice Agent — Dev launcher (bash)
# Starts bridge + node-client together

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "Starting Rick Voice Agent dev environment..."
echo "  Server: apps/bridge"
echo "  Client: apps/node-client"
echo ""

cd "$ROOT_DIR"
npm run dev
