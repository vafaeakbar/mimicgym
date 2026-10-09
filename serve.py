"""Local dev server for MimicGYM: http://localhost:5173

Same as `python3 -m http.server`, but tells the browser not to cache, so
edits show up on a normal reload.
"""
import http.server
import os

PORT = 5173


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    with http.server.ThreadingHTTPServer(("", PORT), NoCacheHandler) as httpd:
        print(f"MimicGYM running at http://localhost:{PORT}")
        httpd.serve_forever()
