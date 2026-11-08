"""Carimba a versão de cada arquivo no index.html (import map com hash do conteúdo).

Assim o navegador nunca mistura um módulo antigo do cache com um novo depois de uma atualização.
Rode antes de publicar:  python tools/versao.py
"""
import hashlib
import json
import pathlib
import re

root = pathlib.Path(__file__).resolve().parent.parent
index = root / 'index.html'


def h(path):
    return hashlib.md5(path.read_bytes()).hexdigest()[:8]


imports = {f'./src/{p.name}': f'./src/{p.name}?v={h(p)}' for p in sorted((root / 'src').glob('*.js'))}
block = '<script type="importmap">\n' + json.dumps({'imports': imports}, indent=2) + '\n</script>'

html = index.read_text(encoding='utf-8')
html = re.sub(r'<script type="importmap">.*?</script>\n?', '', html, flags=re.S)
html = html.replace('<script type="module"', block + '\n  <script type="module"', 1)
html = re.sub(r'src="src/main\.js(\?v=\w+)?"', f'src="src/main.js?v={h(root / "src" / "main.js")}"', html)
html = re.sub(r'href="style\.css(\?v=\w+)?"', f'href="style.css?v={h(root / "style.css")}"', html)
index.write_text(html, encoding='utf-8')
print(f'{len(imports)} módulos carimbados')
