#!/usr/bin/env bash
# Local no-cache dev server. Usage: ./run.sh [port]   (default 8000)
#
# Serves the game directory over http:// — ES modules, fetch and relative paths
# all behave differently under file://, so never open index.html directly.
set -euo pipefail
cd "$(dirname "$0")"
exec python3 -c '
import http.server, socketserver, socket, sys, threading, webbrowser

# Bind adaptively: a server left running on the default port would otherwise
# crash the launch with "Address already in use". Take the first free port and
# say so when it is not the one that was asked for.
requested = int(sys.argv[1])
port = next(
    p for p in range(requested, requested + 20)
    if socket.socket().connect_ex(("127.0.0.1", p)) != 0
)
if port != requested:
    print(f"port {requested} is busy -> using {port}")

# python http.server sends no Cache-Control, so a browser will serve stale JS on
# reload and you debug code that is not running.
class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        super().end_headers()

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", port), Handler) as httpd:
    url = f"http://localhost:{port}"
    print(f"serving {url} (Ctrl-C to stop)")
    threading.Timer(0.5, webbrowser.open, [url]).start()
    httpd.serve_forever()
' "${1:-8000}"
