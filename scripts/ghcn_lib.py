"""Shared library for parsing GHCN-M v4 monthly land temperature data.

The .dat file is fixed-width. Each line:
  ID(11) YEAR(4) ELEMENT(4) then 12 monthly fields of 8 chars each:
    VALUE(5) DMFLAG(1) QCFLAG(1) DSFLAG(1)
  VALUE is an integer in hundredths of degrees C; -9999 = missing.

The .inv file (station metadata):
  ID(11) LAT(9) LON(10) ELEV(7) NAME(...)
"""
import os
import numpy as np

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "ghcn_m")


def _find_files(variant="qcf"):
    """Locate the .dat/.inv for a variant: 'qcf' (adjusted) or 'qcu' (raw)."""
    for root, _dirs, files in os.walk(DATA_DIR):
        dat = inv = None
        for f in files:
            if f.endswith(variant + ".dat"):
                dat = os.path.join(root, f)
            elif f.endswith(variant + ".inv"):
                inv = os.path.join(root, f)
        if dat and inv:
            return dat, inv
    raise FileNotFoundError("GHCN %s .dat/.inv not found under %s" % (variant, DATA_DIR))


def load_inventory(variant="qcf"):
    """Return dict: id -> (lat, lon, elev, name)."""
    _dat, inv = _find_files(variant)
    meta = {}
    with open(inv, "r") as fh:
        for line in fh:
            sid = line[0:11]
            lat = float(line[12:20])
            lon = float(line[21:30])
            elev = float(line[31:37])
            name = line[38:68].strip()
            meta[sid] = (lat, lon, elev, name)
    return meta


def load_data(first_year=1850, last_year=2025, variant="qcf"):
    """Load monthly values into arrays.

    variant: 'qcf' (quality-controlled, homogenized) or 'qcu' (raw, unadjusted).

    Returns:
      ids: (S,) array of station id strings
      years: (Y,) array of years
      data: (S, Y, 12) float array in degrees C, NaN for missing
    """
    dat, _inv = _find_files(variant)
    years = np.arange(first_year, last_year + 1)
    yidx = {y: i for i, y in enumerate(years)}
    # first pass: collect station ids present in the window
    rows = {}  # sid -> (Y,12) array
    with open(dat, "r") as fh:
        for line in fh:
            year = int(line[11:15])
            if year < first_year or year > last_year:
                continue
            sid = line[0:11]
            arr = rows.get(sid)
            if arr is None:
                arr = np.full((len(years), 12), np.nan, dtype=np.float32)
                rows[sid] = arr
            base = 19
            yi = yidx[year]
            for m in range(12):
                s = base + m * 8
                val = line[s:s + 5]
                v = int(val)
                if v != -9999:
                    arr[yi, m] = v / 100.0
    ids = np.array(sorted(rows.keys()))
    data = np.stack([rows[s] for s in ids], axis=0)
    return ids, years, data


def compute_anomalies(data, years, base_start=1961, base_end=1990, min_months=15):
    """Convert absolute temps to anomalies vs each station's own monthly climatology.

    For each station and each calendar month, subtract the mean over the
    baseline period. Returns (anomalies, climatology, has_baseline_mask).
    A station's month needs >= min_months//... valid years in baseline to be usable.
    """
    S, Y, M = data.shape
    bmask = (years >= base_start) & (years <= base_end)
    base = data[:, bmask, :]  # (S, Yb, 12)
    # require at least this many valid years per calendar month in baseline
    min_years = 15
    clim = np.nanmean(base, axis=1)  # (S, 12)
    valid_counts = np.sum(np.isfinite(base), axis=1)  # (S, 12)
    clim[valid_counts < min_years] = np.nan
    anom = data - clim[:, None, :]
    # a station is usable if it has a full-ish climatology
    has_base = np.sum(np.isfinite(clim), axis=1) >= 12
    return anom, clim, has_base


def annual_from_monthly(monthly, min_months=6):
    """Collapse (..., 12) monthly to (...) annual mean, requiring min_months valid."""
    valid = np.sum(np.isfinite(monthly), axis=-1)
    ann = np.nanmean(monthly, axis=-1)
    ann[valid < min_months] = np.nan
    return ann


def grid_global_mean(anom_annual, lats, lons, cell_deg=5.0, min_cells=8):
    """Area-weighted global mean of annual station anomalies.

    Bins stations into equal-lat/lon cells, averages stations within each cell,
    then area-weights cells by cos(latitude). anom_annual: (S, Y). Returns (Y,).

    Years covered by fewer than ``min_cells`` occupied grid cells are returned as
    NaN: you cannot estimate a global mean from a handful of local stations, and
    including them produces spurious spikes.
    """
    S, Y = anom_annual.shape
    nlat = int(180 / cell_deg)
    nlon = int(360 / cell_deg)
    lat_idx = np.clip(((lats + 90) / cell_deg).astype(int), 0, nlat - 1)
    lon_idx = np.clip(((lons % 360) / cell_deg).astype(int), 0, nlon - 1)
    cell_id = lat_idx * nlon + lon_idx
    # cell center latitudes for weights
    cell_lat_centers = (np.arange(nlat) + 0.5) * cell_deg - 90
    cell_w = np.cos(np.deg2rad(cell_lat_centers))  # (nlat,)

    out = np.full(Y, np.nan)
    for yi in range(Y):
        col = anom_annual[:, yi]
        finite = np.isfinite(col)
        if finite.sum() == 0:
            continue
        # mean per cell
        cell_sum = np.zeros(nlat * nlon)
        cell_cnt = np.zeros(nlat * nlon)
        np.add.at(cell_sum, cell_id[finite], col[finite])
        np.add.at(cell_cnt, cell_id[finite], 1.0)
        has = cell_cnt > 0
        if has.sum() < min_cells:
            continue
        cell_mean = np.full(nlat * nlon, np.nan)
        cell_mean[has] = cell_sum[has] / cell_cnt[has]
        # area weight
        weights = np.repeat(cell_w, nlon)  # (nlat*nlon,)
        wsel = has
        num = np.nansum(cell_mean[wsel] * weights[wsel])
        den = np.nansum(weights[wsel])
        if den > 0:
            out[yi] = num / den
    return out
