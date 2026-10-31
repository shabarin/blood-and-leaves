"""Small static server with guaranteed JavaScript MIME types (Windows registry can map .js to text/plain)."""
import http.server
import os
import socketserver
import sys

# Render (and other PaaS) inject the port through $PORT and require binding to 0.0.0.0.
# A CLI argument still works for local runs: `python serve.py 8081`.
PORT = int(os.environ.get('PORT') or (sys.argv[1] if len(sys.argv) > 1 else 8080))
HOST = os.environ.get('HOST', '0.0.0.0')


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.css': 'text/css',
        '.html': 'text/html; charset=utf-8',
        '.json': 'application/json',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.ico': 'image/x-icon',
    }

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True


with Server((HOST, PORT), Handler) as httpd:
    print(f'Serving on http://{HOST}:{PORT}')
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
