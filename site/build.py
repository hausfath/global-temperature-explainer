"""Inline fonts.css, data.json and app.js into a single self-contained index.html."""
import os
D = os.path.dirname(__file__)
tpl = open(os.path.join(D, "index.template.html")).read()
fonts = open(os.path.join(D, "fonts.css")).read()
data = open(os.path.join(D, "data.json")).read()
app = open(os.path.join(D, "app.js")).read()

out = (tpl
       .replace("/*__FONTS_CSS__*/", fonts)
       .replace("/*__DATA_JSON__*/", data)
       .replace("/*__APP_JS__*/", app))

path = os.path.join(D, "index.html")
open(path, "w").write(out)
print("wrote", path, round(len(out)/1024, 1), "KB")

# Also emit to /docs for GitHub Pages (served from main branch, /docs folder).
docs = os.path.join(D, "..", "docs")
os.makedirs(docs, exist_ok=True)
open(os.path.join(docs, "index.html"), "w").write(out)
open(os.path.join(docs, ".nojekyll"), "w").write("")  # serve files as-is
print("wrote", os.path.join(docs, "index.html"))
