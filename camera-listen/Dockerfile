# Alpine because this is ffmpeg plus about 150 lines of Python, and the base
# image is most of the weight either way.
FROM python:3.12-alpine

RUN apk add --no-cache ffmpeg && pip install --no-cache-dir aiohttp==3.10.11

WORKDIR /app
COPY app.py .

# Not root. It reads no files, writes nothing and only needs to open a socket.
RUN adduser -D -u 10001 listen
USER listen

EXPOSE 8083

# The container is healthy when it can answer, which also proves its config is
# complete — /healthz 503s if NVR_HOST, NVR_PASS or CAMERAS is missing, so a
# half-configured deployment shows up as unhealthy rather than as silence.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8083/healthz').status==200 else 1)"

CMD ["python", "-u", "app.py"]
