# Camera Listen

AAC in, MP3 out, on demand — the piece that makes page 3's Listen control real.

The cameras emit **AAC**. ESPHome decodes **WAV, MP3, FLAC, OPUS** and nothing
else. This service sits between them: one `ffmpeg` per listener, spawned on
request and killed the moment the listener goes away.

```
GET /listen/<camera>.mp3[?t=<token>]     the stream
GET /healthz                              liveness, and the camera list
```

## Run it

From the repo root on the NAS:

```bash
cp camera-listen/env.example camera-listen/.env    # fill in; gitignored
docker compose -f docker-compose.camera-listen.yml up -d --build
curl -s localhost:8083/healthz
```

Deploys branch-first, per this repo's CLAUDE.md — never SCP.

## Why the NAS and not the Green

Home Assistant OS has nowhere to hang a long-lived process: `shell_command` is
one-shot, and the ffmpeg that exists lives *inside* the core container, which is
replaced on every core update. The NAS already runs Docker, already holds the
NVR credentials for Frigate, and is already on the camera VLAN.

## The two things this got wrong first, both now tested

**An unreachable camera leaked an ffmpeg.** aiohttp only notices a client
disconnect when the handler tries to *write*. A camera that produces no bytes
means no write ever happens, so the disconnect went unnoticed, the cleanup never
ran, and an orphaned ffmpeg sat holding an RTSP session the NVR counts against
its client limit. The read is now polled on a 1s timeout so the loop wakes and
checks the client whether or not there is audio, and `-rw_timeout` stops ffmpeg
waiting for ever underneath it. **Found by pointing it at a blackholed address —
which is what a camera being rebooted looks like.**

**Killing the process was not enough.** ffmpeg spawns children; a bare
`terminate()` can leave one holding the session. It kills the process *group*,
then escalates to SIGKILL after 5s.

## RTSP paths are not the API channel numbers

The rule is `Preview_{channel+1:02d}_{main|sub}` — and **single digits are
zero-padded**. API channel 1 becomes `02`, not `1`. Probing with `1` returns 404
and reads exactly like "this camera has no RTSP", which is how that was once
concluded and later retracted. All four cameras have RTSP.

`CAMERAS` therefore takes the RTSP numbers directly rather than computing them:
the arithmetic is the part that was got wrong, so it is stated once, in `.env`,
where it can be read.

## What is proven, and what is not

Tested locally in the container:

- `/healthz` reports its cameras, and 503s when its config is incomplete
- unknown camera → 404; missing or wrong token → 403
- `libmp3lame` present and encoding
- client disconnects mid-silence → **no orphaned ffmpeg**
- no audio within `CONNECT_TIMEOUT` → gives up, logs why, reaps the process

**Not yet proven: real audio from a real camera.** The NVR is on the camera VLAN
and unreachable from the development Mac. The end-to-end test is one command on
a host that can reach it:

```bash
ffplay "http://<nas>:8083/listen/cam1.mp3?t=<token>"
```

If that gives audio from the front door, this service is done.

## The panel end is blocked, and not on this

Playing an HTTP stream needs `media_player: platform: speaker`, which lives in
`packages/voice.yaml` — currently stubbed out because including it boot-loops
the panel. See `docs/voice-memory.md`. **Listen and voice are blocked on the
same component**, so this service will sit finished and unused until that is
solved. Wiring it up afterwards is two service calls in `toggle_cam_listen`.

## Costs, stated up front

- **Start-up is ffmpeg launch plus RTSP connect, roughly 1–3s.** Fine for the
  hallway; poor for the doorbell, where the screen wakes on a ring and
  immediacy is the entire point. If that bites, keep the doorbell's process
  warm and accept one idle ffmpeg rather than four.
- **The NVR password reaches another host.** It is already on the NAS for
  Frigate, so no new secret — but `scripts/sync-nvr-password.sh` propagates
  three copies today and would need a fourth.
