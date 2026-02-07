#!/usr/bin/env python3
"""
Folder Opener Service - Local HTTP server to open folders in Finder/Explorer
Runs on host (not in Docker) to enable workspace folder opening from Docker backend
"""
import http.server
import json
import os
import platform
import subprocess
import urllib.parse
from http import HTTPStatus

PORT = 9876

class FolderOpenerHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Suppress default logging
        pass

    def send_json(self, status, data):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def do_OPTIONS(self):
        self.send_json(HTTPStatus.OK, {"status": "ok"})

    def do_POST(self):
        if self.path.startswith('/open'):
            # Get path from query string
            parsed = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed.query)
            folder_path = params.get('path', [None])[0]

            if not folder_path:
                # Try to get from body
                content_length = int(self.headers.get('Content-Length', 0))
                if content_length:
                    body = json.loads(self.rfile.read(content_length))
                    folder_path = body.get('path')

            if not folder_path:
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Missing 'path' parameter"})
                return

            # Validate path exists
            if not os.path.exists(folder_path):
                self.send_json(HTTPStatus.NOT_FOUND, {"error": f"Path not found: {folder_path}"})
                return

            # Open folder based on OS
            os_name = platform.system()
            try:
                if os_name == "Darwin":  # macOS
                    subprocess.run(["open", folder_path], check=True)
                elif os_name == "Linux":
                    subprocess.run(["xdg-open", folder_path], check=True)
                elif os_name == "Windows":
                    subprocess.run(["explorer", folder_path], check=True)
                else:
                    self.send_json(HTTPStatus.BAD_REQUEST, {"error": f"Unsupported OS: {os_name}"})
                    return

                print(f"✓ Opened: {folder_path}")
                self.send_json(HTTPStatus.OK, {
                    "success": True,
                    "path": folder_path,
                    "os": os_name
                })
            except subprocess.CalledProcessError as e:
                self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(e)})
        else:
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "Unknown endpoint"})

def main():
    print(f"🗂️  Folder Opener Service starting on http://localhost:{PORT}")
    print(f"   POST /open?path=/path/to/folder → Opens in {platform.system()} file explorer")
    print()
    
    with http.server.HTTPServer(('127.0.0.1', PORT), FolderOpenerHandler) as server:
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\n✓ Folder Opener Service stopped")

if __name__ == "__main__":
    main()
