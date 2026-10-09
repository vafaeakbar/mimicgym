"""Stamp a fresh version on every script and the stylesheet in index.html.

Run after editing any file, before publishing:  python3 tools/bump_version.py
Browsers cache files by URL; a new ?v= makes them fetch the new versions.
Paths are relative so the site works from any folder (e.g. /mimicgym/).
"""
import glob
import json
import os
import re
import time

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(root)
v = time.strftime("%Y%m%d%H%M%S")
files = sorted(glob.glob("js/**/*.js", recursive=True))
imports = {f"./{f}": f"./{f}?v={v}" for f in files}
block = '<script type="importmap">\n  ' + json.dumps({"imports": imports}, indent=2).replace("\n", "\n  ") + "\n  </script>"

html = open("index.html").read()
html = re.sub(r'<script type="importmap">.*?</script>', block, html, flags=re.S)
html = re.sub(r'<script type="module" src="[^"]*"></script>', '<script type="module" src="./js/app.js"></script>', html)
html = re.sub(r'href="style\.css(\?v=\d+)?"', f'href="style.css?v={v}"', html)
open("index.html", "w").write(html)
print(f"Version {v}: {len(files)} scripts")
