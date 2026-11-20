"""Construit version-monofichier.html : tout le site dans un seul fichier.

Three.js, les scripts, la feuille de style et les images sont intégrés, si bien que le
fichier s'ouvre d'un double-clic, sans serveur. Seule la police Jost (Google Fonts) et
le plan Google Maps restent chargés depuis Internet. Python 3, sans dépendance :

    python3 build_monofichier.py
"""
from __future__ import annotations
import base64
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent
MIME = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml'}


def data_uri(path: pathlib.Path, mime: str) -> str:
    return f'data:{mime};base64,' + base64.b64encode(path.read_bytes()).decode('ascii')


def image_uri(rel: str) -> str:
    path = ROOT / rel
    # versions allégées des photos quand elles existent
    small = path.with_name(path.stem + '-sm' + path.suffix)
    if small.exists():
        path = small
    return data_uri(path, MIME[path.suffix.lower()])


def build() -> pathlib.Path:
    html = (ROOT / 'index.html').read_text(encoding='utf-8')

    # 1. feuille de style
    css = (ROOT / 'css/styles.css').read_text(encoding='utf-8')
    html = html.replace('<link rel="stylesheet" href="css/styles.css">', '<style>\n' + css + '\n</style>')

    # 2. images : srcset retiré, src remplacé par une donnée intégrée
    html = re.sub(r'\s(?:srcset|sizes)="[^"]*"', '', html)
    cache: dict[str, str] = {}

    def repl(m: re.Match) -> str:
        rel = m.group(2)
        if rel not in cache:
            cache[rel] = image_uri(rel)
        return f'{m.group(1)}="{cache[rel]}"'
    html = re.sub(r'(src|href|content)="(assets/img/[^"]+\.(?:png|jpe?g))"', repl, html)

    # 3. modules : roof.js fusionné dans app.js, Three.js en import map intégrée
    roof = (ROOT / 'js/roof.js').read_text(encoding='utf-8')
    roof = re.sub(r"^import \* as THREE from 'three';\n", '', roof, flags=re.M)
    roof = re.sub(r'^export ', '', roof, flags=re.M)
    app = (ROOT / 'js/app.js').read_text(encoding='utf-8')
    scoped = 'const { createRoof } = (() => {\n' + roof + '\nreturn { createRoof };\n})();\n'
    app = app.replace("import { createRoof } from './roof.js';\n", scoped)
    if '</script' in app:
        raise SystemExit('un script contient une balise fermante')
    three = data_uri(ROOT / 'vendor/three.module.js', 'text/javascript')
    html = re.sub(r'<script type="importmap">.*?</script>',
                  lambda m: '<script type="importmap">' + json.dumps({'imports': {'three': three}}) + '</script>',
                  html, flags=re.S)
    logo = cache.get('assets/img/logo-mark.png') or image_uri('assets/img/logo-mark.png')
    html = html.replace('<script type="module" src="js/app.js"></script>',
                        '<script>window.PED_CONFIG = { logo: "' + logo + '" };</script>\n'
                        '<script type="module">\n' + app + '\n</script>')

    out = ROOT / 'version-monofichier.html'
    out.write_text(html, encoding='utf-8')
    return out


if __name__ == '__main__':
    path = build()
    print(f'{path.name} : {path.stat().st_size / 1e6:.2f} Mo')
