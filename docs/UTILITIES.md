# Optional Utilities

> Return to [Setup Guide](SETUP.md)

Deploy additional utilities for monitoring and NAS optimization:

```bash
docker compose -f docker-compose.utilities.yml up -d
```

| Service | Description | Access |
|---------|-------------|--------|
| **Homarr** | Service dashboard — quick links to every app | http://homarr.lan |
| **Tautulli** | Plex monitoring, analytics, and notifications | http://tautulli.lan |
| **Tailscale** | VPN/remote access with exit node and subnet routes | https://login.tailscale.com/admin |
| **Uptime Kuma** | Service monitoring dashboard | http://uptime.lan |
| **Beszel** | System metrics (CPU, RAM, disk, containers) | http://beszel.lan |
| **duc** | Disk usage analyzer (treemap UI) | http://duc.lan |
| **deunhealth** | Auto-restarts services when VPN recovers | Internal |
| **qbit-scheduler** | Pauses torrents overnight for disk spin-down | Internal |
| **Diun** | Docker image update notifications | Internal |
| **Configarr** | Syncs TRaSH Guides quality profiles to Sonarr/Radarr | Run manually |

> **Want Docker log viewing?** [Dozzle](https://dozzle.dev/) is a lightweight web UI for viewing container logs in real-time. Not included in the stack, but easy to add if you want it.

## Homarr Setup

Homarr is a service dashboard that gives you quick-access links to every app in your stack. After first launch, open http://NAS_IP:7575 (or http://homarr.lan) and create an admin account.

**Auto-populate your dashboard with all services:**

```bash
# 1. In the Homarr UI, go to: Management > Tools > API > click "Authentication" tab > create an API key
# 2. Copy the full key (format: <id>.<token>)
# 3. Run the setup script:
./scripts/setup-homarr.sh <NAS_IP> <API_KEY>
```

This creates apps for all 17 services (Plex, Sonarr, Radarr, Pi-hole, etc.) with correct URLs, icons, and health-check ping URLs. After running the script:

1. Click the **pencil icon** (edit mode) on your board
2. Click **+ Add item** > **App**
3. Select each app and drag it onto your board
4. Arrange into groups (Media, Downloads, Management, etc.)
5. Click **Save**

> **Tip:** The setup script is idempotent-safe — running it again just creates duplicates, which you can delete from Manage > Apps.

## Tautulli Setup

Tautulli monitors Plex activity, viewing history, and usage statistics. After first launch, open http://NAS_IP:8181 (or http://tautulli.lan) and follow the setup wizard to connect it to your Plex server.

**Quick setup:**
1. Enter your Plex server: `http://plex:32400` (container-to-container)
2. Sign in with your Plex account
3. Select your Plex server from the list
4. Configure notification agents (optional — Discord, email, etc.)

## Tailscale Setup

Tailscale provides VPN/remote access to your NAS and Docker services from anywhere. It's configured as an exit node with subnet routes to both the Docker network (172.20.0.0/24) and your LAN (192.168.1.0/24).

**1. Set your auth key in `.env`:**
```bash
TAILSCALE_AUTHKEY=tskey-auth-xxxxx
TAILSCALE_HOSTNAME=ugreen-nas
```

Get an auth key from https://login.tailscale.com/admin/settings/keys — use a **reusable** key if you want the container to re-register after restarts.

**2. Start the container:**
```bash
docker compose -f docker-compose.utilities.yml up -d tailscale
```

**3. Approve the routes in Tailscale admin:**
Open https://login.tailscale.com/admin/machines, find your NAS, and:
- Enable **Exit node**
- Approve **subnet routes** (172.20.0.0/24, 192.168.1.0/24)

Once approved, any Tailscale-connected device can access your services by IP (e.g., 172.20.0.4:32400 for Plex) even when away from home.

## Uptime Kuma Setup

Uptime Kuma monitors service health. After first launch, open http://NAS_IP:3001 (or http://uptime.lan) and create an admin account.

**Adding monitors**: Uptime Kuma has no API — configure monitors through the web UI or directly via SQLite:

```bash
# Query existing monitors
docker exec uptime-kuma sqlite3 /app/data/kuma.db "SELECT id, name, url FROM monitor ORDER BY name"

# Add a monitor (MUST include user_id=1 or it won't appear in the UI)
docker exec uptime-kuma sqlite3 /app/data/kuma.db \
  "INSERT INTO monitor (name, type, url, interval, accepted_statuscodes_json, active, maxretries, user_id) \
   VALUES ('ServiceName', 'http', 'http://url:port', 60, '[\"200-299\"]', 1, 3, 1);"

# Rename a monitor
docker exec uptime-kuma sqlite3 /app/data/kuma.db "UPDATE monitor SET name='NewName' WHERE id=ID"

# Restart to pick up DB changes
docker restart uptime-kuma
```

**Recommended monitors** (matching what the pre-commit check expects):

| Monitor | Type | URL | Notes |
|---------|------|-----|-------|
| Bazarr | HTTP | `http://bazarr:6767/ping` | Has own IP |
| Beszel | HTTP | `http://172.20.0.15:8090` | Use static IP |
| duc | HTTP | `http://duc:80` | Has own IP |
| FlareSolverr | HTTP | `http://172.20.0.3:8191` | Via Gluetun |
| Plex | HTTP | `http://plex:32400/identity` | Has own IP |
| Pi-hole | HTTP | `http://pihole:80/admin` | Has own IP |
| Prowlarr | HTTP | `http://gluetun:9696/ping` | Via Gluetun |
| qBittorrent | HTTP | `http://gluetun:8085` | Via Gluetun |
| Radarr | HTTP | `http://gluetun:7878/ping` | Via Gluetun |
| Overseerr | HTTP | `http://overseerr:5055/api/v1/status` | Has own IP |
| Sonarr | HTTP | `http://gluetun:8989/ping` | Via Gluetun |
| Traefik | HTTP | `http://traefik:80/ping` | Has own IP |

> **Why `gluetun` not `sonarr`?** Services sharing Gluetun's network (`network_mode: service:gluetun`) don't get their own Docker DNS entries. Use the `gluetun` hostname or its static IP `172.20.0.3` to reach them.

> **Optional extras**: You can also add monitors for external URLs (e.g., `https://plex.yourdomain.com`), Home Assistant, or other devices — these won't trigger pre-commit warnings.

## Beszel Setup

Beszel has two components: the hub (web UI) and the agent (metrics collector). The agent needs a key from the hub.

**First deploy (hub only):**
```bash
docker compose -f docker-compose.utilities.yml up -d beszel
```

**Get the agent key:**
1. Open http://NAS_IP:8090 (or http://beszel.lan)
2. Create an admin account
3. Click "Add System" → copy the `KEY` value

**Add to `.env`:**
```bash
BESZEL_KEY=ssh-ed25519 AAAA...your-key-here
```

**Deploy the agent:**
```bash
docker compose -f docker-compose.utilities.yml up -d beszel-agent
```

## qbit-scheduler Setup

Pauses torrents overnight so NAS disks can spin down (quieter, less power).

**Configure in `.env`:**
```bash
QBIT_USER=admin
QBIT_PASSWORD=your_qbittorrent_password
QBIT_PAUSE_HOUR=20    # Optional: hour to pause (default 20 = 8pm)
QBIT_RESUME_HOUR=6    # Optional: hour to resume (default 6 = 6am)
```

**Manual control:**
```bash
docker exec qbit-scheduler /app/pause-resume.sh pause   # Stop all torrents
docker exec qbit-scheduler /app/pause-resume.sh resume  # Start all torrents
```

**View logs:**
```bash
docker logs qbit-scheduler
```

## Configarr Setup

Configarr syncs [TRaSH Guides](https://trash-guides.info/) quality profiles and custom formats to Sonarr and Radarr. It runs once and exits — no persistent service, no web UI.

**1. Copy the example config:**
```bash
cp configarr/config.yml.example configarr/config.yml
```

**2. Add API keys to `.env`:**
```bash
SONARR_API_KEY=your_sonarr_api_key
RADARR_API_KEY=your_radarr_api_key
```
Find these in Sonarr/Radarr → Settings → General → API Key.

**3. Edit `configarr/config.yml`** — uncomment the template set you want (e.g., `sonarr-v4-quality-profile-web-1080p`). Browse available templates at the [recyclarr config-templates repo](https://github.com/recyclarr/config-templates).

**4. Preview changes (dry run):**
```bash
docker compose -f docker-compose.utilities.yml run --rm -e DRY_RUN=true configarr
```

**5. Apply changes:**
```bash
docker compose -f docker-compose.utilities.yml run --rm configarr
```

> **Tip:** Run with `DRY_RUN=true` first every time to preview what Configarr will change before it touches your Sonarr/Radarr settings.

---

**Back to:** [Setup Guide](SETUP.md)
