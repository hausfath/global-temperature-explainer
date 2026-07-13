"""Generate all JSON datasets for the interactive site from GHCN-M v4 land data.

Every number the website shows is computed here from the real station data so the
whole thing is reproducible. Outputs one compact JSON: ../site/data.json
"""
import json, os
import numpy as np
import ghcn_lib as g

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "site")
os.makedirs(OUT_DIR, exist_ok=True)
rng = np.random.default_rng(42)

def r(x, n=3):
    if x is None: return None
    if isinstance(x, (list, tuple, np.ndarray)):
        return [r(v, n) for v in x]
    if x is None or (isinstance(x, float) and not np.isfinite(x)): return None
    return round(float(x), n)

print("loading GHCN ...")
meta = g.load_inventory()
ids, years, data = g.load_data(1850, 2025)
lats = np.array([meta[s][0] for s in ids])
lons = np.array([meta[s][1] for s in ids])
elev = np.array([meta[s][2] for s in ids])
names = np.array([meta[s][3] for s in ids])
yr_list = years.tolist()
anom, clim, has_base = g.compute_anomalies(data, years, 1961, 1990)
ann_abs = g.annual_from_monthly(data)
ann_anom = g.annual_from_monthly(anom)
print("stations:", len(ids), "with baseline:", int(has_base.sum()))

OUT = {"years": yr_list, "baseline": "1961-1990"}

def haversine(la1, lo1, la2, lo2):
    la1, lo1, la2, lo2 = map(np.deg2rad, [la1, lo1, la2, lo2])
    dla = la2 - la1; dlo = lo2 - lo1
    a = np.sin(dla/2)**2 + np.cos(la1)*np.cos(la2)*np.sin(dlo/2)**2
    return 6371.0 * 2 * np.arcsin(np.sqrt(a))

# ---------------------------------------------------------------------------
# HEADLINE: gridded global land anomaly (area-weighted), the reproduced record
# ---------------------------------------------------------------------------
print("headline record ...")
bi = has_base
gm = g.grid_global_mean(ann_anom[bi], lats[bi], lons[bi])
OUT["headline"] = {"gridded": r(gm.tolist(), 3)}

# ---------------------------------------------------------------------------
# DEMO 1: absolute vs anomaly for a regional cluster (Colorado, big elev range)
# ---------------------------------------------------------------------------
print("demo1 cluster ...")
win = (years >= 1895) & (years <= 2024)
cov = np.sum(np.isfinite(ann_abs[:, win]), axis=1)
box = (lats >= 37) & (lats <= 41) & (lons >= -109) & (lons <= -102) & (cov > 100) & has_base
cand = np.where(box)[0]
meanT = np.array([np.nanmean(ann_abs[i, win]) for i in cand])
# pick 5 stations spanning the temperature range (coldest->warmest), well covered
order = cand[np.argsort(meanT)]
pick = [order[0], order[len(order)//4], order[len(order)//2],
        order[3*len(order)//4], order[-1]]
d1 = []
for i in pick:
    d1.append({
        "name": str(names[i]).replace("_", " ").title(),
        "elev": int(elev[i]), "lat": r(lats[i], 2), "lon": r(lons[i], 2),
        "abs": r(ann_abs[i].tolist(), 2),
        "anom": r(ann_anom[i].tolist(), 2),
    })
    print("   ", names[i], "elev", int(elev[i]), "meanT", round(np.nanmean(ann_abs[i, win]), 1))
OUT["demo1"] = {"region": "Colorado, USA", "stations": d1}

# ---------------------------------------------------------------------------
# DEMO 2: naive average of ABSOLUTE temps vs average of ANOMALIES (station-mix)
# ---------------------------------------------------------------------------
print("demo2 station-mix ...")
naive_abs = np.full(len(years), np.nan)
naive_anom = np.full(len(years), np.nan)
nrep = np.zeros(len(years), dtype=int)
mean_elev = np.full(len(years), np.nan)
mean_abslat = np.full(len(years), np.nan)
for yi in range(len(years)):
    a = ann_abs[:, yi]; m = ann_anom[:, yi]
    fa = np.isfinite(a); fm = np.isfinite(m)
    if fa.sum():
        naive_abs[yi] = np.nanmean(a[fa]); mean_elev[yi] = np.nanmean(elev[fa])
        mean_abslat[yi] = np.nanmean(np.abs(lats[fa]))
    if fm.sum():
        naive_anom[yi] = np.nanmean(m[fm]); nrep[yi] = int(fm.sum())
OUT["demo2"] = {
    "naive_abs": r(naive_abs.tolist(), 2),
    "naive_anom": r(naive_anom.tolist(), 3),
    "nstations": nrep.tolist(),
    "mean_elev": r(mean_elev.tolist(), 0),
    "mean_abslat": r(mean_abslat.tolist(), 1),
}

# ---------------------------------------------------------------------------
# DEMO 3: spatial correlation of anomalies vs distance (Hansen-Lebedeff)
#   Also: absolute-temperature DIFFERENCE vs distance, to show the contrast.
# ---------------------------------------------------------------------------
print("demo3 correlation-vs-distance ...")
cp0, cp1 = 1951, 2010
cwin = (years >= cp0) & (years <= cp1)
# stations with COMPLETE anomaly record over the common period
complete = np.all(np.isfinite(ann_anom[:, cwin]), axis=1)
cidx = np.where(complete & has_base)[0]
if len(cidx) > 2500:
    cidx = rng.choice(cidx, 2500, replace=False)
A = ann_anom[np.ix_(cidx, np.where(cwin)[0])]  # (n, 60)
Am = A - A.mean(axis=1, keepdims=True)
corr = np.corrcoef(Am)                          # (n,n) anomaly correlation
la = lats[cidx]; lo = lons[cidx]
absmean = np.array([np.nanmean(ann_abs[i, cwin]) for i in cidx])
n = len(cidx)
iu, ju = np.triu_indices(n, k=1)
dist = haversine(la[iu], lo[iu], la[ju], lo[ju])
cc = corr[iu, ju]
absdiff = np.abs(absmean[iu] - absmean[ju])
edges = np.arange(0, 3001, 200.0)
mids = (edges[:-1] + edges[1:]) / 2
corr_mean = []; corr_lo = []; corr_hi = []; adiff_mean = []
for k in range(len(edges)-1):
    sel = (dist >= edges[k]) & (dist < edges[k+1])
    if sel.sum() > 30:
        corr_mean.append(float(np.mean(cc[sel])))
        corr_lo.append(float(np.percentile(cc[sel], 25)))
        corr_hi.append(float(np.percentile(cc[sel], 75)))
        adiff_mean.append(float(np.mean(absdiff[sel])))
    else:
        corr_mean.append(None); corr_lo.append(None); corr_hi.append(None); adiff_mean.append(None)
OUT["demo3"] = {
    "dist": mids.tolist(), "corr": r(corr_mean, 3),
    "corr_lo": r(corr_lo, 3), "corr_hi": r(corr_hi, 3),
    "absdiff": r(adiff_mean, 2), "period": f"{cp0}-{cp1}", "npairs": int(len(dist)),
}
print("   pairs:", len(dist), "stations:", n)

# ---------------------------------------------------------------------------
# DEMO 4: precision driver -> within-cell spread of ABS vs ANOM; + LLN numbers
# ---------------------------------------------------------------------------
print("demo4 spread / precision ...")
# For a recent year, group stations into 5-deg cells; compare SD of absolute
# annual temp vs SD of annual anomaly within cells that hold >=5 stations.
def within_cell_sd(yi):
    a = ann_abs[:, yi]; m = ann_anom[:, yi]
    f = np.isfinite(a) & np.isfinite(m)
    la = lats[f]; lo = lons[f]; av = a[f]; mv = m[f]
    li = ((la + 90)//5).astype(int); lj = ((lo % 360)//5).astype(int)
    cid = li*72 + lj
    sds_abs = []; sds_anom = []
    for c in np.unique(cid):
        s = cid == c
        if s.sum() >= 5:
            sds_abs.append(np.std(av[s])); sds_anom.append(np.std(mv[s]))
    return np.mean(sds_abs), np.mean(sds_anom), len(sds_abs)
yi2000 = yr_list.index(2000)
sd_abs, sd_anom, ncells = within_cell_sd(yi2000)
# Distribution of station anomalies within a mid-latitude region in 2000 for LLN demo
regsel = (lats >= 30) & (lats <= 60) & np.isfinite(ann_anom[:, yi2000])
sample_anoms = ann_anom[regsel, yi2000]
OUT["demo4"] = {
    "within_cell_sd_abs": r(sd_abs, 2),
    "within_cell_sd_anom": r(sd_anom, 2),
    "ncells": int(ncells),
    "lln_sigma": r(float(np.std(sample_anoms)), 3),
    "lln_year": 2000,
    "sample_anoms": r(rng.choice(sample_anoms, min(400, sample_anoms.size), replace=False).tolist(), 2),
}
print("   within-cell SD abs=%.2f anom=%.2f cells=%d sigma=%.2f" % (sd_abs, sd_anom, ncells, np.std(sample_anoms)))

# ---------------------------------------------------------------------------
# DEMO 5: averaging method robustness
#   (a) anomaly series via gridded/area-wt, unweighted mean, median, trimmed
#   (b) Essex "which mean?": arithmetic / harmonic / RMS / geometric on Kelvin
# ---------------------------------------------------------------------------
print("demo5 averaging methods ...")
def series(func):
    out = np.full(len(years), np.nan)
    for yi in range(len(years)):
        v = ann_anom[bi, yi]; v = v[np.isfinite(v)]
        if v.size > 50: out[yi] = func(v)
    return out
gridded = gm
unweighted = series(np.mean)
median = series(np.median)
def trimmed(v):
    lo, hi = np.percentile(v, [10, 90]); return np.mean(v[(v >= lo) & (v <= hi)])
trim = series(trimmed)
OUT["demo5a"] = {
    "gridded": r(gridded.tolist(), 3), "unweighted": r(unweighted.tolist(), 3),
    "median": r(median.tolist(), 3), "trimmed": r(trim.tolist(), 3),
}
# (b) Essex "which mean?" -- the four Holder means (arithmetic / harmonic / RMS /
# geometric) applied to ABSOLUTE temperatures in kelvin.  To make averaging raw
# absolutes fair (the station-mix problem from demo 2 only bites when the set of
# stations changes), we hold the panel FIXED: stations with an unbroken annual
# record 1900-2024.  That isolates the pure effect of the choice of mean.
panel_start = 1900
pw = (years >= panel_start) & (years <= 2024)
panel = np.all(np.isfinite(ann_abs[:, pw]), axis=1) & has_base
K = ann_abs[panel] + 273.15   # (Np, Y), absolute kelvin, same stations every year
print("   holder panel: %d stations, continuous %d-2024" % (panel.sum(), panel_start))
def holder(col):
    return (np.mean(col), 1.0/np.mean(1.0/col),
            np.sqrt(np.mean(col**2)), np.exp(np.mean(np.log(col))))
ar = np.full(len(years), np.nan); ha = ar.copy(); rm = ar.copy(); ge = ar.copy()
for yi in range(len(years)):
    if years[yi] < panel_start:
        continue
    ar[yi], ha[yi], rm[yi], ge[yi] = holder(K[:, yi])
def anomize(x):
    x = np.array(x, dtype=float); b = (years >= 1961) & (years <= 1990)
    return x - np.nanmean(x[b])

# The four means DEPEND on the zero point (except the arithmetic mean).  To show
# that Kelvin isn't a trick but a necessity, compute the warming each mean reports
# (mean of 1995-2024 minus mean of 1900-1929) on BOTH the everyday Celsius scale
# (arbitrary zero) and the kelvin scale (true zero).  In Celsius the ratio-scale
# means (harmonic/geometric/RMS) misbehave; in kelvin they all agree.
def _mean4(col):
    a = np.mean(col); h = 1.0/np.mean(1.0/col); q = np.sqrt(np.mean(col**2))
    g = np.exp(np.mean(np.log(col))) if np.all(col > 0) else np.nan
    return {"arithmetic": a, "harmonic": h, "rms": q, "geometric": g}
def _warming(mat):
    early = [yr_list.index(y) for y in range(1900, 1930)]
    late = [yr_list.index(y) for y in range(1995, 2025)]
    out = {}
    for k in ("arithmetic", "harmonic", "rms", "geometric"):
        e = np.nanmean([_mean4(mat[:, yi])[k] for yi in early])
        l = np.nanmean([_mean4(mat[:, yi])[k] for yi in late])
        d = l - e
        out[k] = None if not np.isfinite(d) else round(float(d), 2)
    return out
OUT["demo5b"] = {
    "arithmetic": r(anomize(ar).tolist(),3), "harmonic": r(anomize(ha).tolist(),3),
    "rms": r(anomize(rm).tolist(),3), "geometric": r(anomize(ge).tolist(),3),
    "n": int(panel.sum()), "start": panel_start,
    "warm_C": _warming(ann_abs[panel]),          # everyday Celsius (arbitrary zero)
    "warm_K": _warming(ann_abs[panel] + 273.15), # kelvin (true zero)
}
print("   warm_C:", OUT["demo5b"]["warm_C"])
print("   warm_K:", OUT["demo5b"]["warm_K"])

# ---------------------------------------------------------------------------
# DEMO 6: sparse sampling recovery -- global anomaly with N random stations
# ---------------------------------------------------------------------------
print("demo6 sparse sampling ...")
usable = np.where(bi)[0]
sparse = {}
for N in [1000, 300, 100, 50, 20]:
    draws = []
    for _ in range(2):
        sub = rng.choice(usable, min(N, usable.size), replace=False)
        s = g.grid_global_mean(ann_anom[sub], lats[sub], lons[sub], min_cells=5)
        draws.append(r(s.tolist(), 3))
    sparse[str(N)] = draws
OUT["demo6"] = {"full": r(gm.tolist(), 3), "subsets": sparse}

# ---------------------------------------------------------------------------
# DEMO 7: homogenization -- raw (qcu) vs adjusted (qcf) global land record.
# Same method for both; quantifies how much the corrections move the trend.
# ---------------------------------------------------------------------------
print("demo7 raw vs adjusted ...")
meta_u = g.load_inventory("qcu")
ids_u, years_u, data_u = g.load_data(1850, 2025, "qcu")
lats_u = np.array([meta_u[s][0] for s in ids_u])
lons_u = np.array([meta_u[s][1] for s in ids_u])
anom_u, _clim_u, hb_u = g.compute_anomalies(data_u, years_u, 1961, 1990)
ann_u = g.annual_from_monthly(anom_u)
raw_gm = g.grid_global_mean(ann_u[hb_u], lats_u[hb_u], lons_u[hb_u])
def lowess_linear(y, bw=20.0):
    """Tricube local-linear LOWESS smooth; bw = bandwidth in years (half-width).
    Returns a smoothed array aligned to `years` (NaN where input was NaN)."""
    x = years.astype(float); out = np.full(len(x), np.nan)
    m = np.isfinite(y)
    xv = x[m]; yv = np.asarray(y)[m]
    for k, xi in enumerate(xv):
        d = np.abs(xv - xi); w = np.clip(1 - (d / bw) ** 3, 0, None) ** 3
        w[d >= bw] = 0.0
        if (w > 0).sum() < 3:
            continue
        X = np.vstack([np.ones_like(xv), xv - xi]).T
        A = (X * w[:, None]).T @ X; bvec = (X * w[:, None]).T @ yv
        try:
            out[np.where(m)[0][k]] = np.linalg.solve(A, bvec)[0]
        except np.linalg.LinAlgError:
            pass
    return out
def total_warming(series, bw=20.0):
    sm = lowess_linear(np.asarray(series, dtype=float), bw)
    base_sel = (years >= 1850) & (years <= 1900)
    baseline = np.nanmean(sm[base_sel])
    fin = np.where(np.isfinite(sm))[0]
    present = sm[fin[-1]]; present_year = int(years[fin[-1]])
    return present - baseline, baseline, present, present_year, sm
w_raw, base_raw, pres_raw, pyr, sm_raw = total_warming(raw_gm)
w_adj, base_adj, pres_adj, _, sm_adj = total_warming(gm)
OUT["demo7"] = {
    "raw": r(raw_gm.tolist(), 3), "adjusted": r(gm.tolist(), 3),
    "warm_raw": r(w_raw, 2), "warm_adj": r(w_adj, 2), "warm_diff": r(w_adj - w_raw, 2),
    "present_year": pyr, "baseline_period": "1850–1900", "bandwidth": 20,
    "nstations_raw": int(hb_u.sum()),
}
print("   total warming (1850-1900 -> %d): raw %.2f, adj %.2f, diff %+.2f C"
      % (pyr, w_raw, w_adj, w_adj - w_raw))

# ---------------------------------------------------------------------------
# COVERAGE: decimated station map + station counts per year (context visual)
# ---------------------------------------------------------------------------
print("coverage ...")
ever = np.where(np.sum(np.isfinite(ann_abs), axis=1) > 0)[0]
demap = rng.choice(ever, min(4000, ever.size), replace=False)
OUT["stationmap"] = {
    "lat": r(lats[demap].tolist(), 1), "lon": r(lons[demap].tolist(), 1),
}
OUT["counts"] = {"nstations": nrep.tolist()}

# active stations on a coarse grid for a few snapshot years (coverage animation)
def coverage_grid(yi, cell=5):
    a = ann_abs[:, yi]; f = np.isfinite(a)
    li = ((lats[f]+90)//cell).astype(int); lj = ((lons[f]%360)//cell).astype(int)
    cells = sorted(set(zip(li.tolist(), lj.tolist())))
    return [[int(a_), int(b_)] for a_, b_ in cells]
OUT["coverage_snaps"] = {str(y): coverage_grid(yr_list.index(y)) for y in [1880,1920,1960,2000,2024]}

path = os.path.join(OUT_DIR, "data.json")
with open(path, "w") as fh:
    json.dump(OUT, fh, separators=(",", ":"))
print("wrote", path, "size", round(os.path.getsize(path)/1024, 1), "KB")
