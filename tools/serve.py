"""Static file server for local testing (no caching)."""
import http.server, socketserver, sys, os
os.chdir(sys.argv[1] if len(sys.argv) > 1 else '.')
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store'); super().end_headers()
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('127.0.0.1', int(os.environ.get('PORT', '8765'))), Handler) as s: s.serve_forever()
