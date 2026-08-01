"""
Camera Listen — AAC in, MP3 out, on demand.

The sofa panel's fullscreen camera view has a Listen control. The cameras emit
AAC; ESPHome decodes WAV/MP3/FLAC/OPUS and nothing else. This is the piece in
between: one ffmpeg per listener, spawned on request and killed the moment the
listener goes away.

    GET /listen/<camera>.mp3     the stream
    GET /healthz                 liveness, and the camera list

*** ON DEMAND, DELIBERATELY. *** Four cameras nobody is listening to cost
nothing, there is no persistent transcode to supervise, and the panel opens at
most one stream — only while a camera is fullscreen and only while Listen is
unmuted. The alternative, a warm process per camera, buys ~2s of start-up
latency for four idle ffmpegs; see the README before choosing it.
"""

import asyncio
import logging
import os
import signal

from aiohttp import web

LOG = logging.getLogger("camera-listen")

# *** THE SOURCE IS go2rtc, NOT THE NVR, AND THAT IS THE WHOLE DESIGN. ***
# This started out dialling the NVR directly, which meant this service needed
# the NVR password and needed to know that RTSP paths are Preview_{ch+1:02d}
# with single digits zero-padded — a rule this project has already got wrong
# once and retracted.
#
# go2rtc on the Home Assistant host already holds both. It has the streams
# defined and verified, it owns the credentials, and it can reach the camera
# VLAN. So this asks go2rtc instead, over its RTSP listener:
#
#   SOURCE_BASE=rtsp://<green>:8554     CAMERAS=cam1:doorcam_sub,...
#
# Three things fall away with that: no password here, no channel arithmetic,
# and no second place to update when a camera moves. It also happens to be the
# only version that works — the NAS cannot reach the camera VLAN at all, which
# is what killed the direct design in deployment.
def parse_cameras(raw: str) -> dict[str, str]:
    """"cam1:doorcam_sub,cam2:loungecam_sub" -> {"cam1": "doorcam_sub", ...}"""
    out = {}
    for pair in filter(None, (p.strip() for p in raw.split(","))):
        name, _, stream = pair.partition(":")
        if not name or not stream:
            raise ValueError(f"CAMERAS entry {pair!r} is not name:go2rtc_stream")
        out[name] = stream
    return out


CAMERAS = parse_cameras(os.environ.get("CAMERAS", ""))
SOURCE_BASE = os.environ.get("SOURCE_BASE", "").rstrip("/")
TOKEN = os.environ.get("LISTEN_TOKEN", "")
BITRATE = os.environ.get("BITRATE", "32k")
# Seconds to wait for the first audio before giving up on a camera.
CONNECT_TIMEOUT = int(os.environ.get("CONNECT_TIMEOUT", "10"))


def rtsp_url(stream: str) -> str:
    # go2rtc's own RTSP listener. Its `default_query: video&audio` means the
    # audio track is there without asking. Point CAMERAS at the SUB streams:
    # they carry the same microphone as the main stream and a fraction of the
    # video this is about to discard anyway.
    return f"{SOURCE_BASE}/{stream}"


async def listen(request: web.Request) -> web.StreamResponse:
    name = request.match_info["camera"]
    if TOKEN and request.query.get("t") != TOKEN:
        raise web.HTTPForbidden(text="bad or missing token\n")
    if name not in CAMERAS:
        raise web.HTTPNotFound(text=f"unknown camera {name!r}; have {sorted(CAMERAS)}\n")

    cmd = [
        "ffmpeg",
        "-hide_banner", "-loglevel", "error",
        # TCP, not UDP. Audio dropouts over Wi-Fi are indistinguishable from a
        # silent doorstep, and this is a few kbit/s — there is nothing to gain
        # from UDP and a real failure mode to avoid.
        "-rtsp_transport", "tcp",
        # *** A CAMERA THAT NEVER ANSWERS MUST NOT HANG FOR EVER. *** Without
        # this, an unreachable NVR leaves ffmpeg blocked in connect and the
        # handler blocked on its stdout, holding a client slot the NVR counts.
        "-rw_timeout", str(CONNECT_TIMEOUT * 1_000_000),
        "-i", rtsp_url(CAMERAS[name]),
        "-vn",                      # throw the video away; we only want the mic
        "-acodec", "libmp3lame",
        "-b:a", BITRATE,
        "-ac", "1",                 # the source is a 16 kHz mono mic
        "-f", "mp3",
        "-",
    ]

    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        start_new_session=True,     # its own process group, so kill takes ffmpeg's children too
    )
    LOG.info("listen %s: ffmpeg pid %s", name, proc.pid)

    response = web.StreamResponse(
        status=200,
        headers={
            "Content-Type": "audio/mpeg",
            # No length, no ranges: this is endless. ESPHome's speaker
            # media_player sustains an endless MP3 indefinitely — proven on the
            # hardware before any of this was designed.
            "Cache-Control": "no-store",
            "Connection": "close",
        },
    )
    await response.prepare(request)

    # *** THE READ IS POLLED, NOT AWAITED INDEFINITELY, AND THAT IS THE WHOLE
    # POINT OF THIS LOOP. ***
    # aiohttp only surfaces a client disconnect when the handler tries to WRITE.
    # A camera that is unreachable produces no bytes, so a plain
    # `await proc.stdout.read()` blocks for ever, the write never happens, the
    # disconnect is never noticed and the `finally` below never runs — leaving
    # an orphaned ffmpeg holding an RTSP session the NVR counts against its
    # client limit. Caught in testing against a blackholed address, which is
    # exactly what a camera being rebooted looks like.
    #
    # So: wake every second whether or not there is audio, and check both the
    # client and the clock.
    started = asyncio.get_running_loop().time()
    got_audio = False
    try:
        while True:
            try:
                chunk = await asyncio.wait_for(proc.stdout.read(4096), timeout=1.0)
            except asyncio.TimeoutError:
                transport = request.transport
                if transport is None or transport.is_closing():
                    LOG.info("listen %s: client gone while silent", name)
                    break
                if not got_audio and \
                        asyncio.get_running_loop().time() - started > CONNECT_TIMEOUT:
                    LOG.warning("listen %s: no audio within %ss — giving up",
                                name, CONNECT_TIMEOUT)
                    break
                continue
            if not chunk:
                err = (await proc.stderr.read()).decode(errors="replace").strip()
                LOG.warning("listen %s: ffmpeg ended%s", name, f": {err}" if err else "")
                break
            got_audio = True
            await response.write(chunk)
    except (asyncio.CancelledError, ConnectionResetError):
        # The listener went away mid-stream — the normal ending, not an error.
        LOG.info("listen %s: client gone", name)
        raise
    finally:
        # *** KILL THE GROUP, NOT THE PROCESS. *** ffmpeg spawns children and a
        # bare terminate() can leave an orphan holding the RTSP session open,
        # which the NVR counts against its client limit until it times out.
        if proc.returncode is None:
            try:
                os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                await asyncio.wait_for(proc.wait(), timeout=5)
            except asyncio.TimeoutError:
                LOG.warning("listen %s: ffmpeg would not stop; SIGKILL", name)
                try:
                    os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
                except ProcessLookupError:
                    pass
        LOG.info("listen %s: stopped", name)

    return response


async def healthz(_: web.Request) -> web.Response:
    missing = [k for k, v in
               {"SOURCE_BASE": SOURCE_BASE, "CAMERAS": CAMERAS}.items() if not v]
    if missing:
        return web.json_response({"ok": False, "missing": missing}, status=503)
    return web.json_response({"ok": True, "cameras": sorted(CAMERAS)})


def main() -> None:
    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"),
                        format="%(asctime)s %(levelname)s %(name)s %(message)s")
    app = web.Application()
    app.router.add_get("/listen/{camera}.mp3", listen)
    app.router.add_get("/healthz", healthz)
    web.run_app(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8083")),
                access_log=None)


if __name__ == "__main__":
    main()
