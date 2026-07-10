# Does a "global temperature" even exist? — interactive explainer

**▶ Live page: https://hausfath.github.io/global-temperature-explainer/**

An interactive, public-facing walkthrough of how thousands of individual land
thermometers become one global temperature record — built to answer the recurring
"global mean temperature is physically meaningless" argument (e.g. this
[self-published paper](https://papers.jcohler.com/gmst/)). Every chart is computed
from the real GHCN-M v4 land station data, not illustrative. See
[METHODOLOGY.md](METHODOLOGY.md) for the full method.

## What it covers
1. The skeptic's case, stated fairly (and where it's half-right).
2. The naive attempt — averaging raw absolute readings — and why it wobbles.
3. The fix: **anomalies** (five real Colorado stations collapse onto one curve).
4. Why anomalies travel ~1,000 km (correlation-vs-distance, ~1M station pairs).
5. Where the tiny error bars come from (within-cell spread + law of large numbers).
6. The "which average?" objection tested — mean/median/trimmed *and*
   arithmetic/harmonic/RMS/geometric on a fixed 1900-panel all agree.
7. Sparse-sampling: rebuild the record from as few as 20 stations.
8. The payoff: a from-scratch global land record + station map + how reanalysis
   (ERA5) recovers the *absolute* temperature (~14–15C).
9. "Do the adjustments create the trend?" — raw (qcu) vs homogenized (qcf) global
   land record. Raw warms ~1.9C since 1850–1900; adjustments *add* ~0.4C (they
   don't create it).
10. Point-by-point answers to the specific claims.

## Structure
```
scripts/
  ghcn_lib.py      GHCN parser, anomaly + area-weighted gridding helpers
  gen_data.py      computes every dataset -> site/data.json
site/
  index.template.html   editable source (HTML/CSS + tokens)
  app.js                charts + interactions (hand-rolled SVG, no dependencies)
  fonts.css             Fraunces + Newsreader, inlined as base64 (offline-safe)
  data.json             computed data (committed, so you can rebuild without the raw data)
  build.py              inlines fonts + data + app.js -> index.html + docs/index.html
  index.html            the self-contained page (host this anywhere)
docs/index.html    the built page served by GitHub Pages
ghcn_m/            raw GHCN-M v4 data — NOT in the repo (too large); see METHODOLOGY.md
```

## View / rebuild
The page is fully self-contained — just open `site/index.html`, or serve the folder:

```bash
python3 -m http.server -d site 8000   # then visit http://localhost:8000
```

To recompute everything from the raw station data (download instructions in
[METHODOLOGY.md](METHODOLOGY.md)):

```bash
cd scripts && python3 gen_data.py     # GHCN -> site/data.json   (needs raw data)
cd ../site && python3 build.py         # -> site/index.html and docs/index.html
```

Requires Python 3 with `numpy`. `index.html` is ~340 KB with every asset inlined,
so it works offline, on any static host, or embedded via iframe.

## Method in brief
- Anomalies are computed vs each station's own 1961–1990 monthly climatology.
- The global mean bins stations into 5°×5° cells and area-weights by cos(latitude);
  years covered by fewer than 8 occupied cells are left blank (you can't estimate a
  global mean from a couple of local stations).
- The adjustments section builds the record from both raw (`qcu`) and homogenized
  (`qcf`) GHCN with the identical method; total warming is measured from a 20-year
  LOWESS smooth relative to 1850–1900.
- Deliberately simplified (no spatial interpolation, uncertainty model, or ocean
  data) yet lands on the published NOAA/NASA/Berkeley/Met Office records. Full
  details and caveats in [METHODOLOGY.md](METHODOLOGY.md).

## License & credits
Code released under the MIT License (see `LICENSE`). Temperature data courtesy of
[NOAA GHCN-M v4](https://www.ncei.noaa.gov/pub/data/ghcn/v4/) (US Government, public
domain). Built for [The Climate Brink](https://www.theclimatebrink.com).
