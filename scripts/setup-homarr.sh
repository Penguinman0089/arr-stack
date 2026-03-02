#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# setup-homarr.sh — Populate Homarr dashboard with all arr-stack services
# ═══════════════════════════════════════════════════════════════════════════
#
# Prerequisites:
#   1. Homarr must be running: docker compose -f docker-compose.utilities.yml up -d homarr
#   2. Open http://<NAS_IP>:7575 and create your admin account
#   3. Go to Manage > Users > (your user) > API tokens > Create token
#   4. Copy the API token
#
# Usage:
#   ./scripts/setup-homarr.sh <NAS_IP> <API_TOKEN>
#
# Example:
#   ./scripts/setup-homarr.sh 192.168.1.100 eyJhbGciOi...
#
# What this does:
#   - Creates all 17 service apps (with icons, URLs, and ping endpoints)
#   - You then drag them onto your board layout in the Homarr UI
#
# If API endpoints have changed, check Homarr's Swagger docs:
#   http://<NAS_IP>:7575/swagger-ui
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Colour

# ── Args ──────────────────────────────────────────────────────────────────
NAS_IP="${1:?Usage: $0 <NAS_IP> <API_TOKEN>}"
API_TOKEN="${2:?Usage: $0 <NAS_IP> <API_TOKEN>}"
HOMARR_URL="http://${NAS_IP}:7575"
ICON_BASE="https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons@master/svg"

# ── Helpers ───────────────────────────────────────────────────────────────

check_homarr() {
    echo -e "${BLUE}Checking Homarr is reachable at ${HOMARR_URL}...${NC}"
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${HOMARR_URL}" 2>/dev/null || echo "000")
    if [[ "${HTTP_CODE}" == "000" ]]; then
        echo -e "${RED}✗ Cannot reach Homarr at ${HOMARR_URL}${NC}"
        echo "  Make sure Homarr is running and the NAS IP is correct."
        exit 1
    fi
    echo -e "${GREEN}✓ Homarr is reachable (HTTP ${HTTP_CODE})${NC}"
}

add_app() {
    local name="$1"
    local description="$2"
    local href="$3"
    local ping_url="$4"
    local icon_name="$5"

    local icon_url="${ICON_BASE}/${icon_name}.svg"

    # Build JSON payload
    local payload
    if [[ -n "${ping_url}" ]]; then
        payload=$(cat <<EOF
{
    "name": "${name}",
    "description": "${description}",
    "href": "${href}",
    "pingUrl": "${ping_url}",
    "iconUrl": "${icon_url}"
}
EOF
)
    else
        payload=$(cat <<EOF
{
    "name": "${name}",
    "description": "${description}",
    "href": "${href}",
    "iconUrl": "${icon_url}"
}
EOF
)
    fi

    local response
    local http_code
    response=$(curl -s -w "\n%{http_code}" \
        -X POST "${HOMARR_URL}/api/apps" \
        -H "Authorization: Bearer ${API_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "${payload}" 2>/dev/null)

    http_code=$(echo "${response}" | tail -1)
    local body
    body=$(echo "${response}" | sed '$d')

    if [[ "${http_code}" =~ ^2[0-9][0-9]$ ]]; then
        echo -e "  ${GREEN}✓${NC} ${name}"
    else
        echo -e "  ${RED}✗${NC} ${name} (HTTP ${http_code})"
        if [[ -n "${body}" ]]; then
            echo -e "    ${YELLOW}${body}${NC}" | head -2
        fi
        FAILURES=$((FAILURES + 1))
    fi
}

# ── Main ──────────────────────────────────────────────────────────────────

FAILURES=0

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         Homarr Dashboard Setup Script            ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════╝${NC}"
echo ""

check_homarr

# ── Media ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}▸ Media${NC}"

add_app \
    "Plex" \
    "Media server — stream movies, TV, and music" \
    "http://${NAS_IP}:32400/web" \
    "http://${NAS_IP}:32400/identity" \
    "plex"

add_app \
    "Overseerr" \
    "Request movies and TV shows" \
    "http://${NAS_IP}:5055" \
    "http://${NAS_IP}:5055/api/v1/status" \
    "overseerr"

add_app \
    "Tautulli" \
    "Plex monitoring, analytics, and notifications" \
    "http://${NAS_IP}:8181" \
    "http://${NAS_IP}:8181/status" \
    "tautulli"

# ── Downloads ─────────────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}▸ Downloads${NC}"

add_app \
    "qBittorrent" \
    "Torrent client (routed through VPN)" \
    "http://${NAS_IP}:8085" \
    "http://${NAS_IP}:8085/api/v2/app/version" \
    "qbittorrent"

add_app \
    "SABnzbd" \
    "Usenet download client (routed through VPN)" \
    "http://${NAS_IP}:8080" \
    "http://${NAS_IP}:8080" \
    "sabnzbd"

# ── Media Management ─────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}▸ Media Management${NC}"

add_app \
    "Sonarr" \
    "TV show management and automation" \
    "http://${NAS_IP}:8989" \
    "http://${NAS_IP}:8989/ping" \
    "sonarr"

add_app \
    "Radarr" \
    "Movie management and automation" \
    "http://${NAS_IP}:7878" \
    "http://${NAS_IP}:7878/ping" \
    "radarr"

add_app \
    "Prowlarr" \
    "Indexer manager for Sonarr and Radarr" \
    "http://${NAS_IP}:9696" \
    "http://${NAS_IP}:9696/ping" \
    "prowlarr"

add_app \
    "Bazarr" \
    "Automatic subtitle downloads for Sonarr and Radarr" \
    "http://${NAS_IP}:6767" \
    "http://${NAS_IP}:6767" \
    "bazarr"

# ── Infrastructure ────────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}▸ Infrastructure${NC}"

add_app \
    "Pi-hole" \
    "Local DNS server and ad blocker" \
    "http://${NAS_IP}:8081/admin" \
    "http://${NAS_IP}:8081/admin" \
    "pi-hole"

add_app \
    "Traefik" \
    "Reverse proxy dashboard — routes *.lan domains" \
    "http://${NAS_IP}:8082" \
    "http://${NAS_IP}:8082/api/rawdata" \
    "traefik"

# ── Monitoring ────────────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}▸ Monitoring${NC}"

add_app \
    "Uptime Kuma" \
    "Service uptime monitoring with alerts" \
    "http://${NAS_IP}:3001" \
    "http://${NAS_IP}:3001" \
    "uptime-kuma"

add_app \
    "Beszel" \
    "Lightweight server resource monitoring" \
    "http://${NAS_IP}:8090" \
    "http://${NAS_IP}:8090" \
    "beszel"

# ── Utilities ─────────────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}▸ Utilities${NC}"

add_app \
    "DUC (DuckDNS)" \
    "Dynamic DNS updater — keeps your domain pointing home" \
    "http://${NAS_IP}:8838" \
    "http://${NAS_IP}:8838" \
    "duckdns"

add_app \
    "Homarr" \
    "This dashboard — quick links to all services" \
    "http://${NAS_IP}:7575" \
    "http://${NAS_IP}:7575" \
    "homarr"

# ── External Services ─────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}▸ External Services${NC}"

add_app \
    "Tailscale" \
    "VPN/remote access — manage devices and routes" \
    "https://login.tailscale.com/admin/machines" \
    "" \
    "tailscale"

add_app \
    "Cloudflare Tunnel" \
    "External access tunnel — manage DNS and tunnels" \
    "https://dash.cloudflare.com" \
    "" \
    "cloudflare"

# ── Summary ───────────────────────────────────────────────────────────────
echo ""
if [[ ${FAILURES} -eq 0 ]]; then
    echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  ✓ All apps created successfully!${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "Next steps:"
    echo -e "  1. Open ${BLUE}${HOMARR_URL}${NC}"
    echo -e "  2. Click the ${YELLOW}pencil icon${NC} (edit mode) on your board"
    echo -e "  3. Click ${YELLOW}+ Add item${NC} > ${YELLOW}App${NC}"
    echo -e "  4. Select each app and arrange them on your board"
    echo -e "  5. Optionally add ${YELLOW}widgets${NC} (clock, calendar, etc.)"
    echo -e "  6. Click ${YELLOW}Save${NC} when done"
else
    echo -e "${YELLOW}═══════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}  ⚠ Completed with ${FAILURES} failure(s)${NC}"
    echo -e "${YELLOW}═══════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "Troubleshooting:"
    echo -e "  • Check API token is valid: Settings > API in Homarr UI"
    echo -e "  • Check Swagger docs: ${BLUE}${HOMARR_URL}/swagger-ui${NC}"
    echo -e "  • If you get 409 Conflict, the app already exists"
fi

echo ""
