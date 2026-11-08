"""Servidor local do Terra Boa que não deixa o navegador usar arquivo velho do cache.

Uso: python tools/servidor.py [porta]
"""
import http.server
import os
import sys

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8650
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


print(f'Terra Boa em http://127.0.0.1:{port}/')
http.server.ThreadingHTTPServer(('127.0.0.1', port), NoCache).serve_forever()
