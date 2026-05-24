"""
Macro market signal tools.
In-memory + file cache to survive server restarts and stay within Alpha Vantage 25 req/day.
"""
import os, json, time, io, hashlib
import httpx
import yfinance as yf
import pandas as pd
import numpy as np
from pathlib import Path

FRED_KEY = os.getenv("FRED_API_KEY", "")
AV_KEY   = os.getenv("ALPHA_VANTAGE_KEY", "")
CACHE_DIR = Path("/tmp/portfolio_macro_cache")
CACHE_DIR.mkdir(exist_ok=True)

_mem: dict = {}   # key -> (data, expires_at)

def _get(key: str):
    if key in _mem:
        d, exp = _mem[key]
        if time.time() < exp:
            return d
    p = CACHE_DIR / f"{key}.json"
    if p.exists():
        meta = json.loads(p.read_text())
        if time.time() < meta["expires"]:
            _mem[key] = (meta["data"], meta["expires"])
            return meta["data"]
    return None

def _set(key: str, data, ttl: int):
    exp = time.time() + ttl
    _mem[key] = (data, exp)
    p = CACHE_DIR / f"{key}.json"
    p.write_text(json.dumps({"expires": exp, "data": data}))

def _fred(series_id: str, limit: int = 36) -> list[dict]:
    resp = httpx.get(
        "https://api.stlouisfed.org/fred/series/observations",
        params={"series_id": series_id, "api_key": FRED_KEY,
                "file_type": "json", "limit": limit, "sort_order": "desc"},
        timeout=12)
    obs = resp.json().get("observations", [])
    return [{"date": o["date"], "value": float(o["value"])}
            for o in obs if o["value"] not in (".", "")]

def _av(function: str, **kwargs) -> list[dict]:
    params = {"function": function, "apikey": AV_KEY, **kwargs}
    resp = httpx.get("https://www.alphavantage.co/query", params=params, timeout=15)
    data = resp.json().get("data", [])
    return [{"date": d["date"], "value": float(d["value"])} for d in data
            if d.get("value") not in (".", "", None)]


# ─── Section 1: Scorecard ────────────────────────────────────────────────────

def get_scorecard() -> dict:
    KEY = "scorecard"
    if (c := _get(KEY)):
        return c

    syms = {"vix": "^VIX", "t10y": "^TNX", "t2y": "^IRX", "dxy": "DX-Y.NYB", "oil": "CL=F"}
    out = {}
    for k, sym in syms.items():
        h = yf.Ticker(sym).history(period="20d")
        if not h.empty:
            vals = h["Close"].dropna()
            price = float(vals.iloc[-1])
            prev  = float(vals.iloc[-2]) if len(vals) > 1 else price
            chg   = round((price - prev) / prev * 100, 2) if prev else 0
            # 3-month trend
            trend_val = float(vals.iloc[0]) if len(vals) >= 20 else price
            trend = round((price - trend_val) / trend_val * 100, 1) if trend_val else 0
            out[k] = {"value": round(price, 2), "change_pct": chg, "trend_1m": trend}

    if "t10y" in out and "t2y" in out:
        spread = round(out["t10y"]["value"] - out["t2y"]["value"], 2)
        out["yield_curve"] = {"value": spread}

    _set(KEY, out, 900)   # 15 min
    return out


# ─── Section 2: Valuation ────────────────────────────────────────────────────

def get_valuation() -> dict:
    KEY = "valuation"
    if (c := _get(KEY)):
        return c

    # CAPE from Shiller
    cape = cape_hist = None
    try:
        r = httpx.get(
            "https://posix4e.github.io/shiller_wrapper_data/data/stock_market_data.json",
            timeout=15)
        entries = [e for e in r.json().get("data", []) if e.get("cape")]
        if entries:
            cape = round(float(entries[-1]["cape"]), 1)
            # last 10 years monthly
            cape_hist = [{"date": e["date_string"][:7], "value": round(float(e["cape"]), 1)}
                         for e in entries[-120:] if e.get("cape")]
    except Exception:
        pass

    # SPY RSI + MA
    spy_h = yf.Ticker("SPY").history(period="2y")
    close = spy_h["Close"]
    delta = close.diff()
    gain  = delta.clip(lower=0).rolling(14).mean()
    loss  = (-delta.clip(upper=0)).rolling(14).mean()
    rs    = gain.iloc[-1] / loss.iloc[-1]
    spy_rsi   = round(float(100 - 100 / (1 + rs)), 1)
    spy_price = round(float(close.iloc[-1]), 2)
    spy_ma50  = round(float(close.rolling(50).mean().iloc[-1]), 2)
    spy_ma200 = round(float(close.rolling(200).mean().iloc[-1]), 2)
    spy_52wk_high = round(float(close.tail(252).max()), 2)
    spy_pct_from_high = round((spy_price - spy_52wk_high) / spy_52wk_high * 100, 1)

    # Gold / Silver
    gold   = float(yf.Ticker("GC=F").history(period="5d")["Close"].iloc[-1])
    silver = float(yf.Ticker("SI=F").history(period="5d")["Close"].iloc[-1])
    gs_ratio = round(gold / silver, 1)

    # Gold history (1Y monthly for chart)
    gh = yf.Ticker("GC=F").history(period="1y")
    gold_hist = [{"date": str(d.date()), "value": round(float(v), 0)}
                 for d, v in zip(gh.index[::5], gh["Close"][::5])]  # ~weekly

    t10 = float(yf.Ticker("^TNX").history(period="5d")["Close"].iloc[-1])
    earnings_yield = round(100 / cape, 2) if cape else None

    result = {
        "cape": cape,
        "cape_hist": cape_hist or [],
        "spy_rsi": spy_rsi,
        "spy_price": spy_price,
        "spy_ma50": spy_ma50,
        "spy_ma200": spy_ma200,
        "spy_52wk_high": spy_52wk_high,
        "spy_pct_from_high": spy_pct_from_high,
        "gold_silver_ratio": gs_ratio,
        "gold": round(gold, 0),
        "silver": round(silver, 2),
        "gold_hist": gold_hist,
        "t10y": round(t10, 2),
        "earnings_yield": earnings_yield,
    }
    _set(KEY, result, 900)
    return result


# ─── Section 3: History Patterns ─────────────────────────────────────────────

def get_history_patterns() -> dict:
    KEY = "history_patterns"
    if (c := _get(KEY)):
        return c

    # SPY monthly history
    spy_raw = yf.download("SPY", start="1993-01-01", progress=False)
    spy_close = spy_raw["Close"]
    if isinstance(spy_close, pd.DataFrame):
        spy_close = spy_close.iloc[:, 0]
    spy_m = spy_close.resample("ME").last().dropna()

    # VIX monthly from FRED
    vix_obs = _fred("VIXCLS", limit=500) if FRED_KEY else []
    if vix_obs:
        vix_s = pd.Series(
            [o["value"] for o in vix_obs],
            index=pd.to_datetime([o["date"] for o in vix_obs])
        ).sort_index()
        vix_m = vix_s.resample("ME").mean().dropna()
    else:
        vix_raw = yf.download("^VIX", start="1993-01-01", progress=False)["Close"]
        if isinstance(vix_raw, pd.DataFrame):
            vix_raw = vix_raw.iloc[:, 0]
        vix_m = vix_raw.resample("ME").mean().dropna()

    # Yield curve monthly from FRED
    yc_obs = _fred("T10Y2Y", limit=500) if FRED_KEY else []
    if yc_obs:
        yc_s = pd.Series(
            [o["value"] for o in yc_obs],
            index=pd.to_datetime([o["date"] for o in yc_obs])
        ).sort_index()
        yc_m = yc_s.resample("ME").last().dropna()
    else:
        yc_m = None

    # CAPE monthly from Shiller
    try:
        r = httpx.get(
            "https://posix4e.github.io/shiller_wrapper_data/data/stock_market_data.json",
            timeout=15)
        entries = [e for e in r.json().get("data", []) if e.get("cape")]
        cape_s = pd.Series(
            [float(e["cape"]) for e in entries],
            index=pd.to_datetime([e["date_string"] for e in entries])
        ).sort_index()
        cape_m = cape_s.resample("ME").last().dropna()
    except Exception:
        cape_m = None

    # Align
    df = pd.DataFrame({"spy": spy_m, "vix": vix_m}).dropna()
    if yc_m is not None:
        df["yc"] = yc_m
    if cape_m is not None:
        df["cape"] = cape_m
    df = df.dropna()

    # Current conditions
    cur_vix   = float(df["vix"].iloc[-1])
    cur_yc    = float(df["yc"].iloc[-1])   if "yc"   in df else 1.0
    cur_cape  = float(df["cape"].iloc[-1]) if "cape" in df else 37.0

    # Find analog months (exclude last 12 months)
    search_df = df.iloc[:-12]
    analogs = []
    for date, row in search_df.iterrows():
        vix_ok  = abs(row["vix"] - cur_vix) < 5
        yc_ok   = abs(row.get("yc",  cur_yc)   - cur_yc)   < 0.6  if "yc"   in row.index else True
        cape_ok = abs(row.get("cape", cur_cape) - cur_cape) < 6    if "cape" in row.index else True
        if not (vix_ok and yc_ok and cape_ok):
            continue
        fwd = {}
        for mo in (3, 6, 12):
            tgt  = date + pd.DateOffset(months=mo)
            idx  = df.index.searchsorted(tgt)
            if idx < len(df):
                fwd[f"r{mo}m"] = round((float(df["spy"].iloc[idx]) / float(row["spy"]) - 1) * 100, 1)
        if fwd:
            analogs.append({"date": date.strftime("%Y-%m"), "vix": round(row["vix"], 1),
                            "yc": round(row.get("yc", cur_yc), 2) if "yc" in row.index else None,
                            "cape": round(row.get("cape", cur_cape), 1) if "cape" in row.index else None,
                            **fwd})

    analogs.sort(key=lambda x: x["date"], reverse=True)

    def stats(rets):
        if not rets: return {}
        a = np.array(rets)
        return {"median": round(float(np.median(a)), 1),
                "pct_pos": int(round((a > 0).mean() * 100)),
                "best":    round(float(a.max()), 1),
                "worst":   round(float(a.min()), 1),
                "n":       len(rets)}

    # Chart: top 5 analog periods — SPY path 0→12 months (% indexed to 0)
    chart_lines = []
    for a in analogs[:5]:
        adate  = pd.to_datetime(a["date"])
        idx0   = df.index.searchsorted(adate)
        base   = float(df["spy"].iloc[idx0])
        path   = []
        for mo in range(13):
            tidx = df.index.searchsorted(adate + pd.DateOffset(months=mo))
            if tidx < len(df):
                path.append({"m": mo, "v": round((float(df["spy"].iloc[tidx]) / base - 1) * 100, 2)})
        chart_lines.append({"label": a["date"], "path": path})

    # Current trailing 12-month path (months -12 to 0)
    trail = df["spy"].tail(13)
    base_t = float(trail.iloc[0])
    cur_path = [{"m": i - 12, "v": round((float(v) / base_t - 1) * 100, 2)}
                for i, v in enumerate(trail)]

    result = {
        "current": {"vix": round(cur_vix, 1), "yc": round(cur_yc, 2), "cape": round(cur_cape, 1)},
        "analog_count": len(analogs),
        "s3m":  stats([a["r3m"]  for a in analogs if "r3m"  in a]),
        "s6m":  stats([a["r6m"]  for a in analogs if "r6m"  in a]),
        "s12m": stats([a["r12m"] for a in analogs if "r12m" in a]),
        "top10": analogs[:10],
        "chart_lines": chart_lines,
        "cur_path": cur_path,
    }
    _set(KEY, result, 3600 * 18)   # 18h
    return result


# ─── Section 4: Economic ─────────────────────────────────────────────────────

def get_economic() -> dict:
    KEY = "economic"
    if (c := _get(KEY)):
        return c

    result = {}

    # Alpha Vantage economic indicators
    av_map = {
        "fed_rate":  ("FEDERAL_FUNDS_RATE", {"interval": "monthly"}),
        "cpi":       ("CPI",                {"interval": "monthly"}),
        "unemp":     ("UNEMPLOYMENT",       {"interval": "monthly"}),
        "gdp":       ("REAL_GDP",           {"interval": "quarterly"}),
        "payroll":   ("NONFARM_PAYROLL",     {"interval": "monthly"}),
        "cons_sent": ("CONSUMER_SENTIMENT", {"interval": "monthly"}),
        "infl_exp":  ("INFLATION_EXPECTATION", {"interval": "monthly"}),
    }
    for key, (fn, kwargs) in av_map.items():
        try:
            data = _av(fn, **kwargs)[:36]
            if data:
                result[key] = {"current": data[0]["value"], "hist": data[:24]}
        except Exception as e:
            result[key] = {"error": str(e)}

    # M2 from FRED
    if FRED_KEY:
        try:
            obs = _fred("M2SL", 36)
            if obs:
                result["m2"] = {"current": obs[0]["value"], "hist": obs[:24]}
        except Exception as e:
            result["m2"] = {"error": str(e)}

    _set(KEY, result, 3600 * 6)   # 6h
    return result


# ─── Section 5: Sentiment ────────────────────────────────────────────────────

def get_sentiment() -> dict:
    KEY = "sentiment"
    if (c := _get(KEY)):
        return c

    # Compute composite fear/greed score from market data
    result = {}

    try:
        # Components: VIX, SPY RSI, SPY distance from 52wk high, Gold vs SPY 3M
        vix_val = float(yf.Ticker("^VIX").history(period="5d")["Close"].iloc[-1])

        spy_h = yf.Ticker("SPY").history(period="1y")
        close = spy_h["Close"]
        delta = close.diff()
        gain  = delta.clip(lower=0).rolling(14).mean()
        loss  = (-delta.clip(upper=0)).rolling(14).mean()
        rs    = gain.iloc[-1] / loss.iloc[-1]
        rsi_val = float(100 - 100 / (1 + rs))
        high52  = float(close.tail(252).max())
        pct_off = (float(close.iloc[-1]) - high52) / high52 * 100   # negative

        gold_3m = float(yf.Ticker("GC=F").history(period="3mo")["Close"].iloc[-1])
        gold_3m_start = float(yf.Ticker("GC=F").history(period="3mo")["Close"].iloc[0])
        spy_3m_start  = float(spy_h["Close"].iloc[-63]) if len(spy_h) >= 63 else float(spy_h["Close"].iloc[0])
        spy_3m_end    = float(spy_h["Close"].iloc[-1])
        gold_vs_spy = (gold_3m / gold_3m_start - spy_3m_end / spy_3m_start) * 100  # +ve = gold leading = fear

        # Normalize each component to 0-100 (0=fear, 100=greed)
        vix_score   = max(0, min(100, (35 - vix_val) / (35 - 10) * 100))
        rsi_score   = max(0, min(100, (rsi_val - 30) / (70 - 30) * 100))
        dist_score  = max(0, min(100, (pct_off + 15) / 15 * 100))     # 0%=100, -15%=0
        gold_score  = max(0, min(100, 50 - gold_vs_spy * 5))           # gold outperform → fear

        composite = round(vix_score * 0.35 + rsi_score * 0.30 + dist_score * 0.20 + gold_score * 0.15, 1)

        def rating(s):
            if s < 25: return "Extreme Fear"
            if s < 45: return "Fear"
            if s < 55: return "Neutral"
            if s < 75: return "Greed"
            return "Extreme Greed"

        result["composite"] = {
            "score": composite,
            "rating": rating(composite),
            "components": {
                "vix":       round(vix_score, 1),
                "momentum":  round(rsi_score, 1),
                "breadth":   round(dist_score, 1),
                "safe_haven": round(gold_score, 1),
            }
        }
    except Exception as e:
        result["composite"] = {"error": str(e)}

    # Consumer sentiment + inflation expectations history for charts (already in economic)
    # Add crypto fear/greed as additional data point
    try:
        r = httpx.get("https://api.alternative.me/fng/?limit=30", timeout=8)
        fng = r.json().get("data", [])
        result["crypto_fg"] = {
            "current_score": int(fng[0]["value"]) if fng else None,
            "current_rating": fng[0]["value_classification"] if fng else None,
            "hist": [{"date": str(pd.to_datetime(int(d["timestamp"]), unit="s").date()),
                      "value": int(d["value"])} for d in fng[:30]]
        }
    except Exception:
        result["crypto_fg"] = None

    _set(KEY, result, 3600)   # 1h
    return result


# ─── RSI + MA for individual holdings ────────────────────────────────────────

def get_signals_bulk(tickers: list[str]) -> list[dict]:
    KEY = "signals_" + hashlib.md5(",".join(sorted(tickers)).encode()).hexdigest()[:8]
    if (c := _get(KEY)):
        return c

    results = []
    for ticker in tickers:
        try:
            h = yf.Ticker(ticker).history(period="1y")
            if h.empty or len(h) < 20:
                results.append({"ticker": ticker, "error": "insufficient data"})
                continue
            cl = h["Close"]
            delta = cl.diff()
            gain  = delta.clip(lower=0).rolling(14).mean()
            loss  = (-delta.clip(upper=0)).rolling(14).mean()
            rs    = gain.iloc[-1] / loss.iloc[-1]
            rsi   = round(float(100 - 100 / (1 + rs)), 1)
            ma50  = round(float(cl.rolling(50).mean().iloc[-1]), 2) if len(cl) >= 50 else None
            ma200 = round(float(cl.rolling(200).mean().iloc[-1]), 2) if len(cl) >= 200 else None
            price = round(float(cl.iloc[-1]), 2)
            results.append({
                "ticker": ticker,
                "rsi": rsi,
                "ma50": ma50,
                "ma200": ma200,
                "price": price,
                "above_ma50":  price > ma50  if ma50  else None,
                "above_ma200": price > ma200 if ma200 else None,
                "golden_cross": ma50 > ma200 if (ma50 and ma200) else None,
            })
        except Exception as e:
            results.append({"ticker": ticker, "error": str(e)})
    _set(KEY, results, 900)   # 15 min
    return results
