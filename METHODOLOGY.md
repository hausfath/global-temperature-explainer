# Methodology

Every figure on the page is computed from raw [GHCN-M v4][ghcn] land station data by
`scripts/gen_data.py`, which writes `site/data.json`. `site/build.py` then inlines the
data, fonts, and JavaScript into a single self-contained `site/index.html`. Nothing on
the page is illustrative or hand-drawn — the numbers are all reproducible from the
source data with the steps below.

[ghcn]: https://www.ncei.noaa.gov/pub/data/ghcn/v4/

## Data

- **Source:** NOAA GHCN-M v4 monthly mean temperature (`tavg`), the same raw station
  records NOAA, NASA GISS, Berkeley Earth, and the UK Met Office start from.
- **Two variants are used:**
  - `qcf` — quality-controlled **and homogenized** (the adjusted product). Used for
    everything except the raw-vs-adjusted comparison.
  - `qcu` — quality-controlled but **unadjusted** (raw). Used alongside `qcf` in the
    homogenization section.
- **Version in the published build:** `v4.0.1` dated `2026-07-08` (~28,000 stations).

### Getting the data (it is not in the repo)

The `.dat` files are ~165 MB each — over GitHub's 100 MB limit — so `ghcn_m/` is
gitignored. To regenerate `data.json` yourself, download and extract both variants:

```bash
mkdir -p ghcn_m && cd ghcn_m
curl -O https://www.ncei.noaa.gov/pub/data/ghcn/v4/ghcnm.tavg.latest.qcf.tar.gz
curl -O https://www.ncei.noaa.gov/pub/data/ghcn/v4/ghcnm.tavg.latest.qcu.tar.gz
tar -xzf ghcnm.tavg.latest.qcf.tar.gz
tar -xzf ghcnm.tavg.latest.qcu.tar.gz
```

`ghcn_lib._find_files(variant)` locates the `.dat`/`.inv` for `qcf` or `qcu`
automatically under `ghcn_m/`. (The `site/data.json` checked into the repo was built
from the version above, so you can rebuild and host the page **without** the raw data.)

## Core method

### 1. Absolute temperatures → anomalies
Each station's monthly value is converted to an **anomaly** relative to *that station's
own* 1961–1990 mean for the same calendar month (`compute_anomalies`). A calendar month
needs ≥15 valid years in the baseline to be usable; a station needs a full 12-month
climatology. Working in anomalies removes each site's fixed offset (elevation, latitude,
coastal vs. inland), which is what makes the records spatially coherent and comparable.

### 2. Monthly → annual
Monthly anomalies are averaged to an annual anomaly, requiring ≥6 valid months in a year
(`annual_from_monthly`).

### 3. Area-weighted global mean (`grid_global_mean`)
Stations are binned into 5°×5° latitude/longitude cells. Each cell's anomaly is the mean
of its stations; the global anomaly is the cell average **weighted by cos(latitude)** so
that densely sampled regions don't dominate and each cell contributes in proportion to
its true surface area.

A year is only reported if it is covered by at least **`min_cells`** occupied cells
(default 8; 5 for the sparse-sampling draws). Estimating a global mean from one or two
lone stations is meaningless and produces spurious spikes, so those years are left blank.

## Per-section computations

| Section | What is computed |
|---|---|
| **Naive average** | The plain arithmetic mean of every station's *absolute* annual temperature per year — deliberately the wrong method, to show how the changing station mix (not climate) drives it. |
| **Absolute vs. anomaly** | Five real Colorado stations spanning ~12 °C of absolute temperature (elevation), shown as absolute temperature and as anomalies. |
| **Correlation vs. distance** | For ~2,500 stations with complete 1951–2010 records, the Pearson correlation of annual anomalies for every station pair (~1.16 million pairs), binned by great-circle distance (200 km bins). The mean absolute-temperature difference per bin is shown for contrast. |
| **Precision / law of large numbers** | Within-cell standard deviation of absolute temperature vs. anomaly (the precision driver), and the empirical spread of station anomalies used to illustrate σ/√N. |
| **Which average?** (a) | The global anomaly computed four ways: area-weighted grid, plain unweighted mean, median, and 10 % trimmed mean. |
| **Which average?** (b) | The four Hölder means — arithmetic, harmonic, root-mean-square, geometric — applied to **absolute kelvin** on a **fixed panel** of stations with unbroken records since 1900. Holding the panel fixed makes averaging absolutes fair (the station-mix problem only bites when the set changes), isolating the pure effect of the mean choice. |
| **Sparse sampling** | The full global record rebuilt from random subsets of N ∈ {1000, 300, 100, 50, 20} stations, two draws each (`min_cells=5`). |
| **Reconstruction** | The headline area-weighted global land anomaly, 1850–present. |
| **Adjustments** | See below. |

## Raw vs. homogenized comparison

The global land record is built with the identical method from both `qcu` (raw) and
`qcf` (homogenized) data. The trend difference quantifies how much the corrections move
the answer.

**Total warming** in the summary cards is the change from the 1850–1900 baseline to the
present, estimated from a **LOWESS smooth** rather than noisy individual years:

- A tricube **local-linear** regression is fit at each year (`lowess_linear`), with a
  **20-year bandwidth** (half-width; points beyond 20 years get zero weight). This
  removes sub-decadal noise (ENSO, volcanic dips) while preserving the multidecadal
  trend, and behaves sensibly at the endpoints via the local *linear* fit.
- Warming = (smoothed value at the latest year) − (mean of the smooth over 1850–1900).

Result from the published build: raw ≈ **+1.9 °C**, homogenized ≈ **+2.2 °C** — so the
adjustments *add* ≈ 0.4 °C rather than creating the trend. Even with zero corrections the
raw thermometers warm unmistakably. Note that on land the adjustments slightly *increase*
the trend (time-of-observation drift and the shift to MMTS sensors had artificially
flattened the raw record), whereas in the *full global* record the largest single
adjustment is to ocean data and it *reduces* the long-term trend.

## Known simplifications

This is a deliberately simplified reconstruction meant to be transparent and runnable on
a laptop. Relative to the operational products it **omits**:

- **Spatial interpolation / infilling** of unsampled regions (kriging in Berkeley Earth,
  land-ocean interpolation in GISTEMP). Cells with no stations simply don't contribute.
- **Formal uncertainty quantification** (measurement, sampling, and coverage terms).
- **Ocean data.** This is **land only**; sea-surface temperature is a separate problem.
- Any adjustment beyond NOAA's upstream homogenization (which is already applied to the
  `qcf` data used throughout, except in the raw-vs-adjusted comparison).

Because the early record (especially before ~1900) is sparse and geographically biased,
the *absolute* total-warming figures carry more uncertainty than the recent record; the
robust result in the adjustments section is the raw-vs-adjusted *difference*, since both
use the identical early data. Despite these simplifications the reconstruction lands on
the published NOAA/NASA/Berkeley/Met Office records to within a few hundredths of a
degree over the well-sampled period.

## Reproduce

```bash
cd scripts && python3 gen_data.py     # GHCN → site/data.json  (needs the raw data)
cd ../site && python3 build.py         # → site/index.html and docs/index.html
```

Requires Python 3 with `numpy`. `site/index.html` is fully self-contained (~340 KB, all
assets inlined) and can be opened directly or hosted on any static server.
