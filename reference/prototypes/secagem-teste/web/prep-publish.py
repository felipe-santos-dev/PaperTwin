"""Converte dist/index.html no formato de página do Artifact (sem doctype/html/head/body)."""
import re, shutil, pathlib
d = pathlib.Path("dist"); out = pathlib.Path("publish")
shutil.rmtree(out, ignore_errors=True); shutil.copytree(d, out, ignore=shutil.ignore_patterns("mini"))
h = (out / "index.html").read_text()
h = re.sub(r"<!doctype html>\s*", "", h, flags=re.I)
h = re.sub(r"</?(html|body)[^>]*>\s*", "", h, flags=re.I)
h = re.sub(r"</?head>\s*", "", h, flags=re.I)
h = re.sub(r'<meta charset="utf-8">\s*', "", h)
h = re.sub(r'<meta name="viewport"[^>]*>\s*', "", h)
(out / "index.html").write_text(h.strip() + "\n")
print(h[:300])
