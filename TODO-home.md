# TODO: When Home

## 1. ~~Fix stuck For All Mankind S05E01 download~~ DONE

Fixed remotely via Seerr — deleted request, re-requested, new download kicked off.

**Follow-up:** Check qBit for orphaned stuck torrent from the old STC release. May need manual cleanup.

## 2. Set up Tailscale for remote admin access

**Problem:** Can't manage Sonarr/qBit/Radarr when away from home. Seerr only shows status, can't fix issues.

**Ideas:**
- Install Tailscale on the NAS (runs as a Docker container)
- Gives full LAN access from phone/laptop anywhere, no port forwarding
- Zero config, no Cloudflare changes needed
- Then all .lan admin UIs accessible remotely via Tailscale IP
- Docs already reference this: `docs/REMOTE-ACCESS.md`
