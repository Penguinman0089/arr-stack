# Advanced Configuration

> Return to: [Script-Assisted Setup](APP-CONFIG-QUICK.md) · [Manual Setup](APP-CONFIG.md)

Optional tuning and advanced features. None of these are required — your stack works fine without them.

---

## Hardware Transcoding (Intel Quick Sync)

Recommended for Ugreen NAS (DXP4800+, etc.) with Intel CPUs. Enables GPU-accelerated transcoding — reduces CPU usage from ~80% to ~20%.

> **No Intel GPU?** Remove the `devices:` and `group_add:` lines (4 lines total) from the plex service in `docker-compose.arr-stack.yml`, or Plex won't start.

**1. Find your render group ID:**
```bash
# SSH to your NAS and run:
getent group render | cut -d: -f3
```

**2. Add to your `.env`:**
```bash
RENDER_GROUP_ID=105  # Use the number from step 1
```

**3. Recreate Plex:**
```bash
docker compose -f docker-compose.arr-stack.yml up -d plex
```

**4. Configure Plex:** Settings → Transcoder

**Key settings:**
- **Use hardware acceleration when available:** ✅
- **Use hardware-accelerated video encoding:** ✅
- **Maximum simultaneous video transcode:** Set based on your CPU

> **Note:** Hardware transcoding requires a **Plex Pass** subscription.

**5. Verify it's working:**

1. Play a video from a Plex client
2. Set playback quality to a lower resolution (e.g., 720p 2Mbps) to force transcoding
3. Open Plex Dashboard → check the "Now Playing" section
4. Look for **(hw)** next to the transcode indicator — this confirms hardware transcoding
5. Check CPU usage — should stay ~20-30% instead of 80%+

If you don't see "(hw)", hardware acceleration isn't working.

---

## Kodi for Fire TV (Dolby Vision / TrueHD Atmos)

**When to use Kodi instead of the Plex app:**

The Plex app works well for most content. However, it may not properly pass through advanced audio/video formats to your AV receiver. If you're experiencing:

- High CPU usage / transcoding on 4K HDR or Dolby Vision content
- Audio being converted instead of passing through TrueHD Atmos or DTS-HD
- Playback stuttering or buffering on high-bitrate files

...try **Kodi with the PlexKodiConnect add-on** instead. Kodi handles passthrough more reliably on Fire TV devices.

**Step 1: Install Kodi on Fire TV (sideload via ADB)**

Kodi isn't in the Amazon App Store. Install via ADB from your computer:

```bash
# Install ADB (Mac)
brew install android-platform-tools

# Enable on Fire TV: Settings → My Fire TV → Developer Options → ADB debugging → ON

# Connect (replace FIRETV_IP with your Fire TV's IP)
adb connect FIRETV_IP:5555
# Accept the prompt on your TV screen

# Download and install Kodi (32-bit for Fire TV)
curl -L -o /tmp/kodi.apk "https://mirrors.kodi.tv/releases/android/arm/kodi-21.3-Omega-armeabi-v7a.apk"
adb install /tmp/kodi.apk
```

**Step 2: Install PlexKodiConnect in Kodi**

Follow the [PlexKodiConnect installation guide](https://github.com/croneter/PlexKodiConnect/wiki/Installation) to add the repository and install the add-on.

**Step 3: Connect and configure**

1. In Kodi, the PlexKodiConnect add-on should discover your Plex server
2. Sign in with your Plex account
3. Select your libraries to sync

**Step 4: Enable passthrough in Kodi**

Settings → System → Audio:
- Allow passthrough: **On**
- Dolby TrueHD capable receiver: **On**
- DTS-HD capable receiver: **On**
- Passthrough output device: your AV receiver

Now 4K Dolby Vision + TrueHD Atmos content will direct play without transcoding.

---

## RAID5 Streaming Tuning

If you're using RAID5 with spinning HDDs and experience playback stuttering on large files (especially 4K remuxes), the default read-ahead buffer is too small. Apply this tuning on your NAS:

```bash
sudo bash -c '
echo 4096 > /sys/block/md1/queue/read_ahead_kb
echo 4096 > /sys/block/dm-0/queue/read_ahead_kb
echo 4096 > /sys/block/md1/md/stripe_cache_size
'
```

Add a root crontab `@reboot` job to persist across reboots (do **not** use `/etc/rc.local` — UGOS overwrites it on firmware updates). See [Troubleshooting: Plex Video Stutters](TROUBLESHOOTING.md#plex-video-stuttersfreezes-every-few-minutes) for full details.

---

## qBittorrent Tuning (TRaSH Recommended)

Tools → Options → BitTorrent:
- **Enable UPnP / NAT-PMP:** ❌ (unnecessary behind VPN, potential security risk)

Tools → Options → Speed:
- **Apply rate limit to µTP protocol:** ✅
- **Apply rate limit to peers on LAN:** ✅

Tools → Options → BitTorrent:
- **Encryption mode:** Allow encryption

> These follow [TRaSH Guides qBittorrent recommendations](https://trash-guides.info/Downloaders/qBittorrent/Basic-Setup/). Speed limits are left at unlimited since the VPN is the bottleneck.

> **Mobile access?** The default UI is poor on mobile. This stack includes [VueTorrent](https://github.com/VueTorrent/VueTorrent)—enable it at Tools → Options → Web UI → Use alternative WebUI → `/vuetorrent`.

---

## SABnzbd Hardening (TRaSH Recommended)

These settings follow [TRaSH Guides SABnzbd recommendations](https://trash-guides.info/Downloaders/SABnzbd/Basic-Setup/):

**Config (⚙️) → Sorting:**
- **Enable TV Sorting:** ❌
- **Enable Movie Sorting:** ❌
- **Enable Date Sorting:** ❌

> Sorting must be disabled — Sonarr/Radarr handle all file organization. SABnzbd sorting causes files to end up in unexpected paths.

**Config (⚙️) → Switches:**
- **Propagation delay:** `5` minutes (waits for Usenet propagation before downloading)
- **Check result of unpacking:** ✅ (only processes successfully unpacked jobs)
- **Deobfuscate final filenames:** ✅ (cleans up obfuscated filenames)

**Config (⚙️) → Special:**
- **Unwanted extensions:** Add common junk file extensions. See [TRaSH's full list](https://trash-guides.info/Downloaders/SABnzbd/Basic-Setup/#unwanted-extensions) for the recommended blacklist.

### SABnzbd hostname whitelist (.lan DNS)

If using Pi-hole local DNS, add `sabnzbd.lan` to the hostname whitelist:
- Config (⚙️) → Special → **host_whitelist** → add `sabnzbd.lan`
- Save, then restart SABnzbd container

Or via SSH:
```bash
docker exec sabnzbd sed -i 's/^host_whitelist = .*/&, sabnzbd.lan/' /config/sabnzbd.ini
docker restart sabnzbd
```
