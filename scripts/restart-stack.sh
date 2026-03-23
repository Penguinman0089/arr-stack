#!/bin/bash
#
# Safe stack restart - NEVER uses 'down' which kills Pi-hole DNS
#
# Usage:
#   ./scripts/restart-stack.sh                 # Restart all compose files
#   ./scripts/restart-stack.sh --pull          # Pull latest images, then restart all
#   ./scripts/restart-stack.sh arr             # Restart arr-stack only
#   ./scripts/restart-stack.sh traefik         # Restart traefik only
#   ./scripts/restart-stack.sh utilities       # Restart utilities only
#   ./scripts/restart-stack.sh --pull arr      # Pull + restart arr-stack only
#

set -euo pipefail
cd "$(dirname "$0")/.."

PULL_IMAGES=false
TARGET="all"

for arg in "$@"; do
    case "$arg" in
        --pull)
            PULL_IMAGES=true
            ;;
        arr|arr-stack|traefik|cloudflared|tunnel|utilities|utils|all)
            TARGET="$arg"
            ;;
        *)
            echo "Usage: $0 [--pull] [arr|traefik|cloudflared|utilities|all]"
            exit 1
            ;;
    esac
done

check_docker_access() {
    if ! docker info >/dev/null 2>&1; then
        echo "❌ Cannot access Docker. Run with sudo or add your user to the docker group."
        exit 1
    fi
}

pull_compose() {
    local file="$1"
    local name="$2"
    if [[ "$PULL_IMAGES" == true ]]; then
        echo "⬇️  Pulling latest images for $name..."
        docker compose -f "$file" pull
        echo "✅ $name images pulled"
    fi
}

restart_compose() {
    local file="$1"
    local name="$2"
    pull_compose "$file" "$name"
    echo "♻️  Restarting $name..."
    docker compose -f "$file" up -d --force-recreate
    echo "✅ $name restarted"
}

check_docker_access

case "$TARGET" in
    arr|arr-stack)
        restart_compose docker-compose.arr-stack.yml "arr-stack"
        ;;
    traefik)
        restart_compose docker-compose.traefik.yml "traefik"
        ;;
    cloudflared|tunnel)
        restart_compose docker-compose.cloudflared.yml "cloudflared"
        ;;
    utilities|utils)
        restart_compose docker-compose.utilities.yml "utilities"
        ;;
    all)
        restart_compose docker-compose.arr-stack.yml "arr-stack"
        restart_compose docker-compose.traefik.yml "traefik"
        restart_compose docker-compose.cloudflared.yml "cloudflared"
        restart_compose docker-compose.utilities.yml "utilities"
        echo ""
        if [[ "$PULL_IMAGES" == true ]]; then
            echo "✅ All stacks pulled and restarted"
        else
            echo "✅ All stacks restarted"
        fi
        ;;
    *)
        echo "Usage: $0 [--pull] [arr|traefik|cloudflared|utilities|all]"
        exit 1
        ;;
esac
