# + remote access — Cloudflared path

> Return to [Setup Guide](SETUP.md) · For private full-LAN access, see [Tailscale](TAILSCALE.md) instead (or alongside)

Watch and request media from anywhere via `plex.yourdomain.com` and `seerr.yourdomain.com`.

**Requirements:**
- Buy a new, external domain name (~$10/year) — [Cloudflare Registrar](https://www.cloudflare.com/products/registrar/) is simplest
- Cloudflare account (free tier)
- **Traefik must already be running.** Cloudflared forwards traffic to `http://traefik:80` — without it you'll see Cloudflare error 1016 / "no such host" in the tunnel logs. Complete [+ local DNS](LOCAL-DNS.md) first, or run `docker compose -f docker-compose.traefik.yml up -d` and verify it's healthy before continuing.

## Cloudflare Tunnel Setup

Cloudflare Tunnel lets you access services from outside your home without opening ports on your router. We use CLI commands (faster than clicking through the web dashboard).

**1. Login to Cloudflare (run on NAS via SSH):**

```bash
cd $NAS_STACK_DIR
mkdir -p cloudflared
docker run --rm --user 0:0 --cap-drop ALL --cap-add DAC_OVERRIDE -e HOME=/home/nonroot -v ./cloudflared:/home/nonroot/.cloudflared cloudflare/cloudflared tunnel login
```

> **`-e HOME=/home/nonroot` is required**, even running as root — otherwise `cert.pem` is written to root's default home (`/root/.cloudflared/cert.pem`) instead of the mounted volume, and is lost the moment the (`--rm`) container exits.

> **Note:** `--user 0:0 --cap-add DAC_OVERRIDE` is required here — the image's own `/home/nonroot` directory is baked in as owner-only (`700`, owned by UID 65532), so any other UID gets `permission denied` just entering it (regardless of the *host* folder's permissions), and root alone isn't enough once `--cap-drop ALL` strips the `DAC_OVERRIDE` capability root normally relies on to cross that directory. See [Cloudflare Tunnel: Error 1033](TROUBLESHOOTING.md#cloudflare-tunnel-error-1033-cloudflared-crash-looping-on-permission-denied) for details. `cloudflared` itself runs the same way (root + `cap_drop: ALL` + `cap_add: DAC_OVERRIDE`, so no other privileges are gained) — see [docker-compose.cloudflared.yml](../docker-compose.cloudflared.yml).

This prints a URL. Open it in your browser, select your domain, and authorize. **Leave the container running** until you've clicked authorize — the cert is delivered to it via callback and saved into `cloudflared/cert.pem`. If you Ctrl+C before authorizing, no cert is written and step 2 will fail with `No file cert.pem in [...]`.

**2. Create the tunnel:**

```bash
docker run --rm --user 0:0 --cap-drop ALL --cap-add DAC_OVERRIDE -e HOME=/home/nonroot -v ./cloudflared:/home/nonroot/.cloudflared cloudflare/cloudflared tunnel create nas-tunnel
```

Note the tunnel ID (e.g., `6271ac25-f8ea-4cd3-b269-ad9778c61272`).

**3. Rename credentials and create config:**

```bash
# Rename the tunnel credentials file (idempotent — safe to re-run)
find cloudflared -maxdepth 1 -name '*.json' -not -name 'credentials.json' \
    -exec mv {} cloudflared/credentials.json \;

# Create config (replace TUNNEL_ID and DOMAIN)
tee cloudflared/config.yml > /dev/null << 'EOF'
tunnel: YOUR_TUNNEL_ID
credentials-file: /home/nonroot/.cloudflared/credentials.json

ingress:
  - hostname: "*.yourdomain.com"
    service: http://traefik:80
  - hostname: yourdomain.com
    service: http://traefik:80
  - service: http_status:404
EOF
```

**4. Add DNS routes:**

```bash
docker run --rm --user 0:0 --cap-drop ALL --cap-add DAC_OVERRIDE -e HOME=/home/nonroot -v ./cloudflared:/home/nonroot/.cloudflared cloudflare/cloudflared tunnel route dns nas-tunnel "*.yourdomain.com"
docker run --rm --user 0:0 --cap-drop ALL --cap-add DAC_OVERRIDE -e HOME=/home/nonroot -v ./cloudflared:/home/nonroot/.cloudflared cloudflare/cloudflared tunnel route dns nas-tunnel yourdomain.com
```

> If either command errors with `An A, AAAA, or CNAME record with that host already exists`, Cloudflare auto-created a record for that hostname (commonly the apex) when you added the domain. Delete the existing record in Cloudflare dashboard → DNS → Records, then re-run the failing command.

## Update Traefik Config

Copy the example configs and customize with your domain:

```bash
# Copy example configs
cp traefik/traefik.yml.example traefik/traefik.yml
cp traefik/dynamic/vpn-services.yml.example traefik/dynamic/vpn-services.yml
```

Edit `traefik/dynamic/vpn-services.yml` and replace the Host rules:

```yaml
# Replace yourdomain.com with your actual domain
plex:
  rule: "Host(`plex.yourdomain.com`)"  # ← your domain
seerr:
  rule: "Host(`seerr.yourdomain.com`)"  # ← your domain
```

> **Note:** The `.yml` files are gitignored. Your customized configs won't be overwritten when you `git pull` updates.

## Deploy + remote access

```bash
# Deploy Cloudflare Tunnel
docker compose -f docker-compose.cloudflared.yml up -d

# Optional: Improve tunnel stability (increases UDP buffer for QUIC)
sudo sysctl -w net.core.rmem_max=7500000
sudo sysctl -w net.core.wmem_max=7500000
```

<details>
<summary><strong>Make sysctl settings permanent (optional)</strong></summary>

The `sysctl -w` commands above are lost on reboot. To persist them:

```bash
# Add these lines to /etc/sysctl.conf
echo "net.core.rmem_max=7500000" | sudo tee -a /etc/sysctl.conf
echo "net.core.wmem_max=7500000" | sudo tee -a /etc/sysctl.conf
```

Some NAS systems (like Ugreen) may reset `/etc/sysctl.conf` on firmware updates. If your settings disappear after an update, re-run the commands above.

</details>

<details>
<summary><strong>Using the tunnel for other services</strong></summary>

The tunnel config uses a wildcard (`*.yourdomain.com`) that routes all subdomains to Traefik. To route specific subdomains to other services, add hostname rules **before** the wildcard (rules are evaluated top-to-bottom, first match wins):

```yaml
ingress:
  # Specific routes first
  - hostname: homeassistant.yourdomain.com
    service: http://homeassistant:8123
  - hostname: blog.yourdomain.com
    service: http://192.168.1.100:80

  # Then wildcard for media stack
  - hostname: "*.yourdomain.com"
    service: http://traefik:80
  - hostname: yourdomain.com
    service: http://traefik:80
  - service: http_status:404
```

Add DNS records for the new hostnames:
```bash
docker run --rm --user 0:0 --cap-drop ALL --cap-add DAC_OVERRIDE -e HOME=/home/nonroot -v ./cloudflared:/home/nonroot/.cloudflared cloudflare/cloudflared tunnel route dns nas-tunnel homeassistant.yourdomain.com
```

**Tip:** For Docker containers on the `arr-stack` network, use the container name as hostname. For services outside Docker, use the IP address.

</details>

## Test Cloudflare Tunnel

From your phone on cellular data (not WiFi):
- Visit `https://plex.yourdomain.com`
- Check SSL certificate is valid (padlock icon)

---

## ✅ + remote access Complete!

**Congratulations!** You now have:
- Plex and Seerr accessible from anywhere via `yourdomain.com`
- HTTPS encryption for all external traffic
- No ports exposed on your router

**You're done!** The sections below are optional but recommended:
- **[Backup](SETUP.md#backup)** — Protect your configs
- **[Optional Utilities](UTILITIES.md)** — Monitoring, auto-recovery, disk usage

> **Need full network access remotely?** Cloudflare Tunnel only exposes HTTP services (Plex, Seerr). For admin UIs (Sonarr, Radarr, etc.) or `.lan` domains from anywhere — including CGNAT and hotel WiFi — add [Tailscale](TAILSCALE.md). Free for personal use, complementary to Cloudflared.

Issues? [Report on GitHub](https://github.com/Pharkie/ultimate-arr-stack/issues) or [chat on Reddit](https://www.reddit.com/user/Jeff46K4/).
