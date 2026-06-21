import functools
import http.server
import socketserver

PORT = 8080
DIRECTORY = "dist"


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        super().end_headers()


Handler = functools.partial(NoCacheHandler, directory=DIRECTORY)
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    httpd.allow_reuse_address = True
    print(f"serving {DIRECTORY}/ on :{PORT} with no-cache headers")
    httpd.serve_forever()
