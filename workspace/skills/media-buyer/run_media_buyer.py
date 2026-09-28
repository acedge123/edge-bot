#!/usr/bin/env python3
"""Media Buyer report generator (pacing-aware).

This is a reference implementation for the `media-buyer` skill.

It calls a Supabase-backed pacing API (PACING_URL) with x-api-key (AGENT_API_KEY)
then generates a human-readable report + recommendation.

NOTE: The exact JSON schemas for `/get-pacing-data` and platform metrics vary by backend.
This script is defensive, but you will likely need to adapt `normalize_*` functions
once you see real responses.

Usage:
  PACING_URL=... AGENT_API_KEY=... python skills/media-buyer/run_media_buyer.py \
    --platform meta --scenario "Scenario Name" --campaign "Campaign Name"

For live runs that write to Agent Vault, do not rely on implicit subprocess env inheritance.
Pass Vault env vars on the same command line, for example:
  AGENT_VAULT_URL=<value> AGENT_EDGE_KEY=<value> \
  python skills/media-buyer/run_media_buyer.py --platform meta --scenario "Scenario Name" --campaign "Campaign Name"

Or use explicit flags:
  python skills/media-buyer/run_media_buyer.py ... --vault-url <value> --vault-key <value>

Explicit runner modes:
  --entity-level campaign   campaign-level reporting only
  --entity-level ad         ad-level reporting with required structure joins
"""

from __future__ import annotations

import argparse
import collections
import datetime as dt
import json
import os
import sys
import textwrap
import urllib.error
from typing import Any, Dict, List, Optional, Tuple

import urllib.request


def post_json(url: str, api_key: str, payload: Dict[str, Any], timeout_s: int = 60) -> Dict[str, Any]:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout_s) as resp:
        raw = resp.read().decode("utf-8")
    try:
        return json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        return {"_raw": raw}


def post_json_or_none(url: str, api_key: str, payload: Dict[str, Any], timeout_s: int = 60) -> Optional[Dict[str, Any]]:
    try:
        return post_json(url, api_key, payload, timeout_s=timeout_s)
    except Exception:
        return None


def maybe_post_router_run_artifact(
    run_artifact: Dict[str, Any],
    vault_url: Optional[str] = None,
    vault_key: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Best-effort remote sink for router runs.

    Uses Agent Vault when configured. This is append-only and should never block
    the primary report path.
    """
    vault_url = vault_url or os.getenv("AGENT_VAULT_URL")
    vault_key = vault_key or os.getenv("AGENT_EDGE_KEY")
    if not vault_url or not vault_key:
        return {"_skipped": "missing_vault_config"}

    payload = {
        "learning": json.dumps(run_artifact, sort_keys=True, separators=(",", ":")),
        "kind": "ops",
        "source": "media-buyer-router-run",
        "tags": ["router-run", "media-buyer", "eval-artifact"],
        "confidence": 0.99,
    }
    try:
        return post_json(f"{vault_url.rstrip('/')}/learnings", vault_key, payload, timeout_s=30)
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8", errors="replace")
        except Exception:
            body = ""
        return {"_error": f"HTTP {getattr(e, 'code', 'unknown')}", "_body": body}
    except Exception as e:
        return {"_error": str(e)}


def pct(n: float) -> str:
    return f"{n:.1f}%"


def money(n: Optional[float]) -> str:
    if n is None:
        return "—"
    return f"${n:,.2f}"


def num(n: Optional[float]) -> str:
    if n is None:
        return "—"
    if abs(n - int(n)) < 1e-9:
        return f"{int(n):,}"
    return f"{n:,.2f}"


def safe_div(a: Optional[float], b: Optional[float]) -> Optional[float]:
    if a is None or b is None or b == 0:
        return None
    return a / b


def is_weekend_la(now_utc: Optional[dt.datetime] = None) -> bool:
    # Avoid timezone deps; approximate by using UTC offset from env if provided.
    # Preferred: treat "weekend" as America/Los_Angeles based on system local time.
    # In OpenClaw runtime, system tz is UTC, so we compute with a fixed offset if given.
    # Best practice: adjust this once you decide how to handle DST.
    now_utc = now_utc or dt.datetime.now(dt.timezone.utc)
    # Default to PT offset from environment; -8 for PST, -7 for PDT.
    offset_hours = int(os.getenv("PT_OFFSET_HOURS", "-7"))
    now_pt = now_utc + dt.timedelta(hours=offset_hours)
    return now_pt.weekday() >= 5


def normalize_pacing(pacing_resp: Dict[str, Any], campaign_name: str) -> Dict[str, Any]:
    """Extract a minimal pacing view.

    Expected logical fields (adapt as needed):
      - targetCpl
      - plannedSpendToDate
      - actualSpendToDate
      - pacingPct
    """
    # Try a few common nesting patterns.
    data = pacing_resp.get("data") if isinstance(pacing_resp.get("data"), dict) else pacing_resp

    target_cpl = data.get("targetCpl") or data.get("target_cpl")
    planned_spend = data.get("plannedSpendToDate") or data.get("planned_spend_to_date")
    actual_spend = data.get("actualSpendToDate") or data.get("actual_spend_to_date")

    pacing_block = data.get("pacing") if isinstance(data.get("pacing"), dict) else {}
    spend_block = pacing_block.get("spend") if isinstance(pacing_block.get("spend"), dict) else {}
    if planned_spend is None:
        planned_spend = spend_block.get("planned_mtd") or spend_block.get("plannedSpendToDate")
    if actual_spend is None:
        actual_spend = spend_block.get("actual_mtd") or spend_block.get("actualSpendToDate")
    if target_cpl is None:
        eff = data.get("efficiency") if isinstance(data.get("efficiency"), dict) else {}
        cpl_block = eff.get("cpl") if isinstance(eff.get("cpl"), dict) else {}
        target_cpl = cpl_block.get("planned") or cpl_block.get("target")

    # Try per-campaign rows
    rows = data.get("campaigns") or data.get("rows") or []
    if isinstance(rows, list):
        row = next((r for r in rows if str(r.get("campaignName") or r.get("campaign") or "").lower() == campaign_name.lower()), None)
    else:
        row = None

    if isinstance(row, dict):
        planned_spend = planned_spend or row.get("plannedSpendToDate") or row.get("planned_spend_to_date") or row.get("plannedSpend")
        actual_spend = actual_spend or row.get("actualSpendToDate") or row.get("actual_spend_to_date") or row.get("actualSpend")
        target_cpl = target_cpl or row.get("targetCpl") or row.get("target_cpl")

    pacing_pct = None
    if planned_spend is not None and actual_spend is not None:
        pacing_pct = safe_div(float(actual_spend), float(planned_spend))
        pacing_pct = None if pacing_pct is None else pacing_pct * 100.0

    return {
        "targetCpl": float(target_cpl) if target_cpl is not None else None,
        "plannedSpendToDate": float(planned_spend) if planned_spend is not None else None,
        "actualSpendToDate": float(actual_spend) if actual_spend is not None else None,
        "pacingPct": pacing_pct,
    }


def normalize_metrics(metrics_resp: Dict[str, Any]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Return (last24h, last7d) dicts.

    This assumes the backend gives either:
      {"last24h": {...}, "last7d": {...}, "trend7d": [...]}
    or a single dict with those keys under `data`.
    """
    data = metrics_resp.get("data") if isinstance(metrics_resp.get("data"), dict) else metrics_resp
    last24h = data.get("last24h") or data.get("last_24h") or {}
    last7d = data.get("last7d") or data.get("last_7d") or {}
    return last24h if isinstance(last24h, dict) else {}, last7d if isinstance(last7d, dict) else {}


def pick_first(d: Dict[str, Any], *keys: str) -> Any:
    for k in keys:
        if d.get(k) is not None:
            return d.get(k)
    return None


def normalize_ad_performance(ad_perf_resp: Dict[str, Any]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Convert live Meta ad-performance into router windows."""
    data = ad_perf_resp.get("data") if isinstance(ad_perf_resp.get("data"), dict) else ad_perf_resp
    if not isinstance(data, dict):
        return {}, {}

    last24h = {
        "spend": pick_first(data, "spend", "amount_spent", "total_spend"),
        "impressions": pick_first(data, "impressions"),
        "clicks": pick_first(data, "clicks", "link_clicks"),
        "leads": pick_first(data, "leads", "conversions", "results"),
        "frequency": pick_first(data, "frequency"),
        "roas": pick_first(data, "roas"),
    }

    if any(v is not None for v in last24h.values()):
        return last24h, dict(last24h)
    return {}, {}


def iter_nested_dicts(obj: Any) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    if isinstance(obj, dict):
        out.append(obj)
        for v in obj.values():
            out.extend(iter_nested_dicts(v))
    elif isinstance(obj, list):
        for item in obj:
            out.extend(iter_nested_dicts(item))
    return out


def extract_structure_rows(structure_resp: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]], Dict[str, Any]]:
    data = structure_resp.get("data") if isinstance(structure_resp.get("data"), dict) else structure_resp
    if not isinstance(data, dict):
        return [], [], [], {}

    summary = data.get("summary") if isinstance(data.get("summary"), dict) else {}
    campaigns: List[Dict[str, Any]] = []
    adsets: List[Dict[str, Any]] = []
    ads: List[Dict[str, Any]] = []

    for node in iter_nested_dicts(data):
        if not isinstance(node, dict):
            continue
        name = str(pick_first(node, "name", "campaign_name", "adset_name", "ad_name") or "")
        if pick_first(node, "campaign_id", "campaignId") is not None or (node.get("objective") is not None and name):
            campaigns.append(node)
        if pick_first(node, "adset_id", "adSetId", "ad_set_id") is not None:
            adsets.append(node)
        if pick_first(node, "ad_id", "adId") is not None or (node.get("creative_type") is not None and pick_first(node, "cta", "call_to_action") is not None):
            ads.append(node)

    def dedupe(rows: List[Dict[str, Any]], *id_keys: str) -> List[Dict[str, Any]]:
        seen = set()
        out_rows = []
        for row in rows:
            key = tuple(row.get(k) for k in id_keys) or tuple()
            if not any(key):
                key = (id(row),)
            if key in seen:
                continue
            seen.add(key)
            out_rows.append(row)
        return out_rows

    return dedupe(campaigns, "campaign_id", "campaignId", "name"), dedupe(adsets, "adset_id", "adSetId", "name"), dedupe(ads, "ad_id", "adId", "name"), summary


def extract_performance_rows(resp: Dict[str, Any]) -> List[Dict[str, Any]]:
    candidates: List[Dict[str, Any]] = []
    data = resp.get("data") if isinstance(resp.get("data"), (dict, list)) else resp
    if isinstance(data, list):
        for item in data:
            if isinstance(item, dict):
                candidates.append(item)
    elif isinstance(data, dict):
        for key in ("rows", "data", "results", "ads", "adsets", "items"):
            value = data.get(key)
            if isinstance(value, list):
                candidates.extend([item for item in value if isinstance(item, dict)])
        if not candidates and any(data.get(k) is not None for k in ("ad_id", "adId", "campaign_id", "campaignId", "spend")):
            candidates.append(data)
    return candidates


def to_float(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except Exception:
        return None


def merge_row_metrics(row: Dict[str, Any]) -> Dict[str, Any]:
    spend = to_float(pick_first(row, "spend", "amount_spent", "total_spend"))
    impressions = to_float(pick_first(row, "impressions"))
    clicks = to_float(pick_first(row, "clicks", "link_clicks", "unique_link_clicks"))
    leads = to_float(pick_first(row, "leads", "results", "conversions"))
    ctr = to_float(pick_first(row, "ctr"))
    cpm = to_float(pick_first(row, "cpm"))
    cpc = to_float(pick_first(row, "cpc"))
    frequency = to_float(pick_first(row, "frequency"))
    roas = to_float(pick_first(row, "roas"))
    if ctr is None:
        ctr = safe_div(clicks, impressions)
        ctr = None if ctr is None else ctr * 100.0
    if cpm is None:
        cpm = safe_div(spend, impressions)
        cpm = None if cpm is None else cpm * 1000.0
    if cpc is None:
        cpc = safe_div(spend, clicks)
    cpl = safe_div(spend, leads)
    return {
        "spend": spend,
        "impressions": impressions,
        "clicks": clicks,
        "leads": leads,
        "ctr": ctr,
        "cpm": cpm,
        "cpc": cpc,
        "cpl": cpl,
        "frequency": frequency,
        "roas": roas,
    }


def combine_meta_rows(perf_rows: List[Dict[str, Any]], structure_ads: List[Dict[str, Any]], structure_adsets: List[Dict[str, Any]], campaign_name: str) -> List[Dict[str, Any]]:
    ad_index = {}
    for ad in structure_ads:
        ad_id = pick_first(ad, "ad_id", "adId")
        if ad_id is not None:
            ad_index[str(ad_id)] = ad

    adset_index = {}
    for adset in structure_adsets:
        adset_id = pick_first(adset, "adset_id", "adSetId", "ad_set_id")
        if adset_id is not None:
            adset_index[str(adset_id)] = adset

    combined: List[Dict[str, Any]] = []
    for row in perf_rows:
        row_campaign = str(pick_first(row, "campaign_name", "campaignName", "campaign") or "")
        if campaign_name and row_campaign and row_campaign.lower() != campaign_name.lower():
            continue
        ad_id = pick_first(row, "ad_id", "adId")
        ad_meta = ad_index.get(str(ad_id)) if ad_id is not None else None
        adset_id = pick_first(row, "adset_id", "adSetId", "ad_set_id")
        if adset_id is None and isinstance(ad_meta, dict):
            adset_id = pick_first(ad_meta, "adset_id", "adSetId", "ad_set_id")
        adset_meta = adset_index.get(str(adset_id)) if adset_id is not None else None

        merged = {
            "ad_id": ad_id or pick_first(ad_meta or {}, "ad_id", "adId"),
            "ad_name": pick_first(row, "ad_name", "adName", "name") or pick_first(ad_meta or {}, "ad_name", "name"),
            "campaign_name": row_campaign or pick_first(ad_meta or {}, "campaign_name", "campaignName"),
            "adset_id": adset_id,
            "adset_name": pick_first(row, "adset_name", "adsetName") or pick_first(adset_meta or {}, "adset_name", "name"),
            "cta": pick_first(row, "cta", "call_to_action") or pick_first(ad_meta or {}, "cta", "call_to_action"),
            "primary_text": pick_first(row, "primary_text", "copy", "body") or pick_first(ad_meta or {}, "primary_text", "copy", "body"),
            "headline": pick_first(row, "headline", "title") or pick_first(ad_meta or {}, "headline", "title"),
            "creative_type": pick_first(row, "creative_type", "format") or pick_first(ad_meta or {}, "creative_type", "format"),
            "status": pick_first(row, "status", "effective_status") or pick_first(ad_meta or {}, "status", "effective_status"),
        }
        merged.update(merge_row_metrics({**(ad_meta or {}), **row}))
        combined.append(merged)
    return combined


def summarize_meta_findings(ad_rows: List[Dict[str, Any]], structure_summary: Dict[str, Any], adset_rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    findings = {
        "top_ads": [],
        "weak_ads": [],
        "cta_clusters": [],
        "copy_clusters": [],
        "fragmentation": {},
        "test_next": [],
    }
    if not ad_rows:
        return findings

    ranked = []
    for row in ad_rows:
        score = 0.0
        ctr = to_float(row.get("ctr")) or 0.0
        leads = to_float(row.get("leads")) or 0.0
        spend = to_float(row.get("spend")) or 0.0
        cpl = to_float(row.get("cpl"))
        score += ctr * 2.0 + leads * 3.0
        if cpl is not None and cpl > 0:
            score += max(0.0, 50.0 / cpl)
        if spend < 10:
            score *= 0.5
        ranked.append((score, row))
    ranked.sort(key=lambda x: x[0], reverse=True)

    def compact(row: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "ad_id": row.get("ad_id"),
            "ad_name": row.get("ad_name"),
            "adset_name": row.get("adset_name"),
            "creative_type": row.get("creative_type"),
            "cta": row.get("cta"),
            "ctr": row.get("ctr"),
            "cpl": row.get("cpl"),
            "spend": row.get("spend"),
            "leads": row.get("leads"),
        }

    findings["top_ads"] = [compact(row) for _, row in ranked[:3] if (to_float(row.get("spend")) or 0) >= 10]
    weak = []
    for _, row in sorted(ranked, key=lambda x: x[0]):
        spend = to_float(row.get("spend")) or 0.0
        ctr = to_float(row.get("ctr")) or 0.0
        leads = to_float(row.get("leads")) or 0.0
        if spend >= 25 and leads == 0 and ctr < 1.0:
            weak.append(compact(row))
    findings["weak_ads"] = weak[:3]

    cta_groups = collections.defaultdict(list)
    copy_groups = collections.defaultdict(list)
    for row in ad_rows:
        cta = str(row.get("cta") or "").strip()
        if cta:
            cta_groups[cta].append(row)
        copy_key = " ".join(str(row.get("primary_text") or "").lower().split())[:120]
        if copy_key:
            copy_groups[copy_key].append(row)

    findings["cta_clusters"] = [
        {"cta": cta, "count": len(rows), "ads": [r.get("ad_name") for r in rows[:5]]}
        for cta, rows in sorted(cta_groups.items(), key=lambda kv: len(kv[1]), reverse=True)
        if len(rows) >= 2
    ][:3]
    findings["copy_clusters"] = [
        {"copy_preview": key[:80], "count": len(rows), "ads": [r.get("ad_name") for r in rows[:5]]}
        for key, rows in sorted(copy_groups.items(), key=lambda kv: len(kv[1]), reverse=True)
        if key and len(rows) >= 2
    ][:3]

    campaign_count = to_float(structure_summary.get("total_campaigns")) or None
    adset_count = len(adset_rows) or to_float(structure_summary.get("total_ad_sets")) or 0
    ad_count = len(ad_rows) or to_float(structure_summary.get("total_ads")) or 0
    adsets_per_campaign = (adset_count / campaign_count) if campaign_count else None
    ads_per_adset = (ad_count / adset_count) if adset_count else None
    findings["fragmentation"] = {
        "campaigns": campaign_count,
        "adsets": adset_count,
        "ads": ad_count,
        "adsets_per_campaign": adsets_per_campaign,
        "ads_per_adset": ads_per_adset,
        "over_fragmented": bool((adsets_per_campaign and adsets_per_campaign > 4) or (ads_per_adset and ads_per_adset > 6)),
    }

    top_cta = findings["cta_clusters"][0]["cta"] if findings["cta_clusters"] else None
    if findings["top_ads"]:
        findings["test_next"].append(f"Make 2-3 fresh variants off the strongest ad: {findings['top_ads'][0].get('ad_name')}")
    if top_cta and findings["cta_clusters"] and findings["cta_clusters"][0]["count"] >= 3:
        findings["test_next"].append(f"CTA mix is concentrated around {top_cta}; introduce at least one materially different CTA test")
    if findings["fragmentation"].get("over_fragmented"):
        findings["test_next"].append("Collapse low-signal ad sets or trim ad counts per ad set to tighten learning")
    if findings["weak_ads"]:
        findings["test_next"].append("Cut or pause the weakest ads that have meaningful spend but no lead signal")
    return findings


def normalize_monthly_performance(perf_resp: Dict[str, Any], platform: str, scenario_id: Optional[str]) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Fallback normalizer for the scenario-level performance endpoint.

    Returns (last24h, last7d) as empty dicts when the service only exposes monthly rollups,
    but stores the latest monthly actuals in a month_to_date-shaped last7d payload so the
    report stays useful instead of failing.
    """
    data = perf_resp.get("data") if isinstance(perf_resp.get("data"), dict) else perf_resp
    channels = data.get("channels") if isinstance(data, dict) else None
    if not isinstance(channels, list):
        return {}, {}

    channel_name = "Meta" if platform == "meta" else "Google"
    channel = next((c for c in channels if str(c.get("channel_name") or "").strip().lower() == channel_name.lower()), None)
    if not isinstance(channel, dict):
        return {}, {}

    months = channel.get("months") if isinstance(channel.get("months"), list) else []
    month = None
    for m in reversed(months):
        if isinstance(m, dict) and any((m.get("actual") or {}).get(k, 0) for k in ("spend", "impressions", "clicks", "leads", "applications")):
            month = m
            break
    if month is None and months:
        month = months[-1] if isinstance(months[-1], dict) else None
    if not isinstance(month, dict):
        return {}, {}

    actual = month.get("actual") if isinstance(month.get("actual"), dict) else {}
    month_payload = {
        "spend": actual.get("spend"),
        "impressions": actual.get("impressions"),
        "clicks": actual.get("clicks"),
        "leads": actual.get("leads"),
        "applications": actual.get("applications"),
        "offers": actual.get("offers"),
        "funded": actual.get("funded"),
        "month_number": month.get("month_number"),
        "month_name": month.get("month_name"),
        "scenario_id": scenario_id,
    }
    return {}, month_payload


def compute_kpis(m: Dict[str, Any]) -> Dict[str, Any]:
    spend = float(m.get("spend") or 0.0) if m.get("spend") is not None else None
    impressions = float(m.get("impressions") or 0.0) if m.get("impressions") is not None else None
    clicks = float(m.get("clicks") or 0.0) if m.get("clicks") is not None else None
    leads = float(m.get("leads") or m.get("conversions") or 0.0) if (m.get("leads") is not None or m.get("conversions") is not None) else None
    conversions_7d = float(m.get("conversions_7d") or m.get("conversions7d") or m.get("conversions") or 0.0) if m.get("conversions") is not None else None

    ctr = safe_div(clicks, impressions)
    cpm = safe_div(spend, impressions)
    cpc = safe_div(spend, clicks)
    cpl = safe_div(spend, leads)

    # cpm is per 1000
    cpm = None if cpm is None else cpm * 1000.0

    out = {
        "spend": spend,
        "impressions": impressions,
        "clicks": clicks,
        "leads": leads,
        "ctr": None if ctr is None else ctr * 100.0,
        "cpm": cpm,
        "cpc": cpc,
        "cpl": cpl,
        "frequency": m.get("frequency"),
        "roas": m.get("roas"),
        "conversions7d": conversions_7d,
    }
    return out


def normalize_utm_efficiency(resp: Dict[str, Any]) -> Dict[str, Any]:
    data = resp.get("data") if isinstance(resp.get("data"), dict) else resp
    if not isinstance(data, dict):
        return {}
    rows = data.get("rows") if isinstance(data.get("rows"), list) else []
    benchmark = data.get("benchmark") if isinstance(data.get("benchmark"), dict) else {}
    best_rows = rows[:3]
    worst_rows = rows[-3:] if rows else []
    return {
        "benchmark": benchmark,
        "rows": rows,
        "best_rows": best_rows,
        "worst_rows": worst_rows,
        "count": data.get("count"),
        "scenario_id": data.get("scenario_id") or data.get("scenarioId"),
        "utm_dim": data.get("utm_dim") or data.get("utmDim"),
        "month_number": data.get("month_number") or data.get("monthNumber"),
    }


def bucket_pacing(pacing_pct: Optional[float]) -> str:
    if pacing_pct is None:
        return "UNKNOWN"
    if pacing_pct > 105:
        return "AHEAD"
    if pacing_pct < 95:
        return "BEHIND"
    return "ON-TRACK"


def cpl_vs_target(cpl: Optional[float], target: Optional[float]) -> str:
    if cpl is None or target is None:
        return "UNKNOWN"
    return "BELOW" if cpl <= target else "ABOVE"


def decide_action(pacing_bucket: str, cpl_bucket: str) -> str:
    if pacing_bucket == "AHEAD" and cpl_bucket == "BELOW":
        return "hold"
    if pacing_bucket == "AHEAD" and cpl_bucket == "ABOVE":
        return "prune"
    if pacing_bucket == "BEHIND" and cpl_bucket == "BELOW":
        return "scale"
    if pacing_bucket == "BEHIND" and cpl_bucket == "ABOVE":
        return "hold"
    if pacing_bucket == "ON-TRACK":
        return "hold"
    return "diagnose"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--vault-url", default=None, help="Optional explicit Agent Vault base URL override")
    ap.add_argument("--vault-key", default=None, help="Optional explicit Agent Vault bearer key override")
    ap.add_argument("--debug-outbound", action="store_true", help="Print outbound request bodies before API calls")
    ap.add_argument("--platform", required=True, choices=["meta", "google"])
    ap.add_argument("--scenario", required=True)
    ap.add_argument("--campaign", required=True)
    ap.add_argument("--entity-level", choices=["campaign", "ad"], default="campaign")
    ap.add_argument("--target-cpl", type=float, default=None)
    ap.add_argument("--month-number", type=int, default=7, help="Month number for UTM efficiency (1-12), default 7 for July")
    ap.add_argument("--channel-name", default="all", choices=["google", "meta", "all"])
    ap.add_argument("--utm-dim", default="utm_campaign", choices=["utm_campaign", "utm_content", "utm_medium", "utm_source"])
    ap.add_argument("--benchmark-channel", default="google")
    ap.add_argument("--client-id", default=None)
    ap.add_argument("--client-name", default=None)
    ap.add_argument("--emit-json", action="store_true", help="Emit router-ready normalized JSON before the human report")
    args = ap.parse_args()

    pacing_url = os.getenv("PACING_URL")
    api_key = os.getenv("AGENT_API_KEY")
    if not pacing_url or not api_key:
        print("Missing env: PACING_URL and/or AGENT_API_KEY", file=sys.stderr)
        return 2

    pacing = post_json(f"{pacing_url.rstrip('/')}/get-pacing-data", api_key, {"scenarioName": args.scenario})
    pacing_norm = normalize_pacing(pacing, args.campaign)

    scenario_id = None
    scenario_obj = pacing.get("scenario") if isinstance(pacing.get("scenario"), dict) else None
    if isinstance(scenario_obj, dict):
        scenario_id = scenario_obj.get("id")
    if scenario_id is None:
        scenarios = post_json(f"{pacing_url.rstrip('/')}/list-scenarios", api_key, {})
        for s in (scenarios.get("scenarios") or []):
            if isinstance(s, dict) and str(s.get("name") or "").lower() == args.scenario.lower():
                scenario_id = s.get("id")
                break

    target_cpl = args.target_cpl if args.target_cpl is not None else pacing_norm.get("targetCpl")

    metrics_ep = os.getenv("PLATFORM_METRICS_ENDPOINT", "/get-analytics")
    metrics_payload = {
        "platform": args.platform,
        "campaignName": args.campaign,
        "windowHours": 24,
        "windowDays": 7,
    }
    ad_payload = {"platform": args.platform, "campaignName": args.campaign, "level": "ad", "datePreset": "last_7d", "limit": 200}
    adset_payload = {"platform": args.platform, "campaignName": args.campaign, "level": "adset", "datePreset": "last_7d", "limit": 100}
    if args.debug_outbound:
        print(json.dumps({"endpoint": "get-analytics", "body": metrics_payload}, indent=2, sort_keys=True))
        if args.platform == "meta":
            print(json.dumps({"endpoint": "get-ad-performance", "body": ad_payload}, indent=2, sort_keys=True))
            print(json.dumps({"endpoint": "get-ad-performance", "body": adset_payload}, indent=2, sort_keys=True))
            if args.client_id or args.client_name:
                structure_preview: Dict[str, Any] = {}
                if args.client_id:
                    structure_preview["clientId"] = args.client_id
                if args.client_name:
                    structure_preview["clientName"] = args.client_name
                print(json.dumps({"endpoint": "get-meta-account-structure", "body": structure_preview}, indent=2, sort_keys=True))
    metrics = post_json_or_none(
        f"{pacing_url.rstrip('/')}{metrics_ep}",
        api_key,
        metrics_payload,
    )
    ad_perf = None
    adset_perf = None
    structure = None
    if args.platform == "meta" and args.entity_level == "ad" and not (args.client_id or args.client_name):
        raise SystemExit("Meta ad-level runner requires --client-id or --client-name so structure joins are deterministic")
    if args.platform == "meta" and (args.client_id or args.client_name):
        structure_payload: Dict[str, Any] = {}
        if args.client_id:
            structure_payload["clientId"] = args.client_id
        if args.client_name:
            structure_payload["clientName"] = args.client_name
        structure = post_json_or_none(
            f"{pacing_url.rstrip('/')}/get-meta-account-structure",
            api_key,
            structure_payload,
        )
    if metrics is None and scenario_id:
        metrics = post_json_or_none(
            f"{pacing_url.rstrip('/')}/get-performance-data",
            api_key,
            {"scenarioId": scenario_id},
        ) or {}

    utm_efficiency = None
    if scenario_id:
        utm_efficiency = post_json_or_none(
            f"{pacing_url.rstrip('/')}/get-utm-efficiency",
            api_key,
            {
                "scenarioId": scenario_id,
                "channelName": args.channel_name,
                "monthNumber": args.month_number,
                "utmDim": args.utm_dim,
                "benchmarkChannel": args.benchmark_channel,
            },
        )

    last24h_raw, last7d_raw = normalize_metrics(metrics or {})
    structure_campaigns: List[Dict[str, Any]] = []
    structure_adsets: List[Dict[str, Any]] = []
    structure_ads: List[Dict[str, Any]] = []
    structure_summary: Dict[str, Any] = {}
    if structure:
        structure_campaigns, structure_adsets, structure_ads, structure_summary = extract_structure_rows(structure)

    if args.platform == "meta" and args.entity_level == "ad":
        ad_perf = post_json_or_none(
            f"{pacing_url.rstrip('/')}/get-ad-performance",
            api_key,
            ad_payload,
        )
        adset_perf = post_json_or_none(
            f"{pacing_url.rstrip('/')}/get-ad-performance",
            api_key,
            adset_payload,
        )
    elif args.platform == "meta":
        adset_perf = post_json_or_none(
            f"{pacing_url.rstrip('/')}/get-ad-performance",
            api_key,
            adset_payload,
        )

    meta_ad_rows: List[Dict[str, Any]] = []
    meta_findings: Dict[str, Any] = {}
    if ad_perf:
        ad24, ad7 = normalize_ad_performance(ad_perf)
        last24h_raw = ad24 or last24h_raw
        last7d_raw = ad7 or last7d_raw
        perf_rows = extract_performance_rows(ad_perf)
        if perf_rows:
            meta_ad_rows = combine_meta_rows(perf_rows, structure_ads, structure_adsets, args.campaign)
            meta_findings = summarize_meta_findings(meta_ad_rows, structure_summary, structure_adsets)
    if not last24h_raw and not last7d_raw and scenario_id:
        last24h_raw, last7d_raw = normalize_monthly_performance(metrics or {}, args.platform, scenario_id)
    utm_eff_norm = normalize_utm_efficiency(utm_efficiency or {}) if utm_efficiency else {}
    kpi24 = compute_kpis(last24h_raw)
    kpi7 = compute_kpis(last7d_raw)

    pacing_bucket = bucket_pacing(pacing_norm.get("pacingPct"))
    cpl_for_decision = kpi24.get("cpl") if kpi24.get("cpl") is not None else kpi7.get("cpl")
    cpl_bucket = cpl_vs_target(cpl_for_decision, target_cpl)
    action = decide_action(pacing_bucket, cpl_bucket)

    learning_phase = False
    conv7 = kpi7.get("conversions7d")
    if isinstance(conv7, (int, float)):
        learning_phase = conv7 < 50

    if kpi7.get("spend") is None and isinstance(last7d_raw, dict):
        # Preserve useful month-to-date rollups from performance-only responses.
        kpi7["spend"] = last7d_raw.get("spend")
        kpi7["impressions"] = last7d_raw.get("impressions")
        kpi7["clicks"] = last7d_raw.get("clicks")
        kpi7["leads"] = last7d_raw.get("leads")
        kpi7["ctr"] = None if kpi7.get("impressions") in (None, 0) or kpi7.get("clicks") is None else (float(kpi7["clicks"]) / float(kpi7["impressions"])) * 100.0
        kpi7["cpm"] = None if kpi7.get("spend") is None or kpi7.get("impressions") in (None, 0) else (float(kpi7["spend"]) / float(kpi7["impressions"])) * 1000.0
        kpi7["cpc"] = None if kpi7.get("spend") is None or kpi7.get("clicks") in (None, 0) else float(kpi7["spend"]) / float(kpi7["clicks"])
        kpi7["cpl"] = None if kpi7.get("spend") is None or kpi7.get("leads") in (None, 0) else float(kpi7["spend"]) / float(kpi7["leads"])

    creative_fatigue = False
    freq = kpi7.get("frequency")
    try:
        creative_fatigue = (freq is not None and float(freq) > 3.5)
    except Exception:
        pass

    weekend_block = is_weekend_la()
    fragmentation_risk = bool(meta_findings.get("fragmentation", {}).get("over_fragmented"))

    normalized = {
        "entity_level": args.entity_level,
        "channel": args.platform,
        "intent_layer": "brand" if args.platform == "google" else "mixed",
        "primary_goal": "efficiency",
        "windows": {
            "last_24h": kpi24,
            "last_7d": kpi7,
            "month_to_date": {
                "spend": pacing_norm.get("actualSpendToDate") or kpi7.get("spend"),
                "planned_spend": pacing_norm.get("plannedSpendToDate"),
                "pacing_pct": pacing_norm.get("pacingPct"),
                "target_cpl": target_cpl,
            },
        },
        "utm_efficiency": utm_eff_norm,
        "derived_flags": {
            "underpacing": pacing_bucket == "BEHIND",
            "over_target_cpl": cpl_bucket == "ABOVE",
            "low_signal": bool(learning_phase),
            "fragmentation_risk": fragmentation_risk,
            "saturation_risk": bool(creative_fatigue),
            "tracking_gap": False,
            "utm_efficiency_gap": bool((utm_eff_norm.get("rows") or []) and any((r.get("efficiency_score") is None or (to_float(r.get("efficiency_score")) or 0) < 1.0) for r in (utm_eff_norm.get("rows") or [])[:5])),
        },
        "decision": {
            "recommended_action": "test_next" if meta_findings.get("test_next") else action,
            "confidence": 0.7 if meta_ad_rows else 0.6 if pacing_norm.get("pacingPct") is not None and kpi24.get("cpl") is not None else 0.3,
            "rationale": f"ad_level_rows={len(meta_ad_rows)}, pacing={pacing_bucket.lower()}, cpl={cpl_bucket.lower()}" if meta_ad_rows else f"pacing={pacing_bucket.lower()}, cpl={cpl_bucket.lower()}",
        },
    }
    if meta_findings:
        normalized["meta_exploration"] = meta_findings

    run_artifact = {
        "schema_version": "router_run.v1",
        "created_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "scenario_name": args.scenario,
        "campaign_name": args.campaign,
        "platform": args.platform,
        "entity_level": normalized["entity_level"],
        "raw_inputs": {
            "pacing": pacing,
            "metrics": metrics,
            "utm_efficiency": utm_efficiency,
            "ad_performance": ad_perf,
            "adset_performance": adset_perf,
            "structure": structure,
        },
        "normalized": normalized,
        "decision": normalized["decision"],
        "model_version": os.getenv("MEDIA_BUYER_MODEL_VERSION", "router-v1"),
        "run_type": os.getenv("MEDIA_BUYER_RUN_TYPE", "live"),
    }

    sink_result = maybe_post_router_run_artifact(run_artifact, args.vault_url, args.vault_key)

    # Guardrail blocks
    blocks = []
    if action == "scale":
        if weekend_block:
            blocks.append("Weekend rule: never scale Sat/Sun (PT)")
        if learning_phase:
            blocks.append("Learning phase: <50 conversions in last 7 days")
        if target_cpl is not None and kpi24.get("cpl") is not None:
            if kpi24["cpl"] > 1.2 * float(target_cpl):
                blocks.append("CPL > 20% above target: do not scale")

    if args.emit_json:
        print(json.dumps(normalized, indent=2, sort_keys=True))
        print("")
        if sink_result is not None:
            print(json.dumps({"router_run_sink": sink_result}, indent=2, sort_keys=True))
            print("")

    # Report
    lines = []
    lines.append(f"Media Buyer Report — {args.platform.upper()} — Campaign: {args.campaign}")
    lines.append(f"Scenario: {args.scenario}")
    lines.append("")

    lines.append("PACING")
    lines.append(f"- Spend to date: {money(pacing_norm.get('actualSpendToDate'))} / Planned-to-date: {money(pacing_norm.get('plannedSpendToDate'))}")
    lines.append(f"- Spend pacing: {pct(pacing_norm.get('pacingPct')) if pacing_norm.get('pacingPct') is not None else '—'} ({pacing_bucket})")
    lines.append(f"- Target CPL: {money(target_cpl)}")
    lines.append("")

    def fmt_kpi(title: str, k: Dict[str, Any]):
        lines.append(title)
        lines.append(f"- Spend: {money(k.get('spend'))} | Impr: {num(k.get('impressions'))} | Clicks: {num(k.get('clicks'))}")
        lines.append(f"- CTR: {num(k.get('ctr'))}% | CPM: {money(k.get('cpm'))} | CPC: {money(k.get('cpc'))}")
        lines.append(f"- Leads: {num(k.get('leads'))} | CPL: {money(k.get('cpl'))} | ROAS: {num(k.get('roas'))}")
        if k.get("frequency") is not None:
            lines.append(f"- Frequency: {num(float(k.get('frequency')))}")
        lines.append("")

    fmt_kpi("LAST 24 HOURS", kpi24)
    fmt_kpi("LAST 7 DAYS", kpi7)

    if utm_eff_norm:
        lines.append("UTM EFFICIENCY")
        bench = utm_eff_norm.get("benchmark") or {}
        lines.append(f"- Benchmark: {bench.get('channel') or args.benchmark_channel} / {bench.get('utm') or 'branded-search-exact'} | CPCE {money(bench.get('cpce'))} | Credit events {num(bench.get('credit_events'))}")
        rows = utm_eff_norm.get("rows") or []
        if rows:
            lines.append("- Top rows:")
            for r in rows[:5]:
                lines.append(
                    f"  - {r.get('channel')} | {r.get('utm')}: score {num(r.get('efficiency_score'))} | CPCE {money(r.get('cpce'))} | Spend {money(r.get('spend'))} | Credit events {num(r.get('creditEvent') or r.get('credit_events'))} | Spend matched {r.get('spendMatched') if r.get('spendMatched') is not None else r.get('spend_matched')}"
                )
        lines.append("")

    if meta_findings:
        lines.append("AD / TACTIC EXPLORATION")
        top_ads = meta_findings.get("top_ads") or []
        weak_ads = meta_findings.get("weak_ads") or []
        if top_ads:
            lines.append("- Strongest hooks / ads:")
            for ad in top_ads:
                lines.append(f"  - {ad.get('ad_name') or ad.get('ad_id')}: CTR {num(ad.get('ctr'))}% | CPL {money(ad.get('cpl'))} | Spend {money(ad.get('spend'))} | Leads {num(ad.get('leads'))}")
        if weak_ads:
            lines.append("- Weak ads to cut / review:")
            for ad in weak_ads:
                lines.append(f"  - {ad.get('ad_name') or ad.get('ad_id')}: CTR {num(ad.get('ctr'))}% | Spend {money(ad.get('spend'))} | Leads {num(ad.get('leads'))}")
        cta_clusters = meta_findings.get("cta_clusters") or []
        if cta_clusters:
            lines.append("- Duplicated CTA clusters:")
            for cluster in cta_clusters:
                lines.append(f"  - {cluster.get('cta')}: {cluster.get('count')} ads")
        copy_clusters = meta_findings.get("copy_clusters") or []
        if copy_clusters:
            lines.append("- Duplicated copy clusters:")
            for cluster in copy_clusters:
                lines.append(f"  - {cluster.get('copy_preview')}: {cluster.get('count')} ads")
        frag = meta_findings.get("fragmentation") or {}
        if frag:
            lines.append(f"- Structure: {num(frag.get('campaigns'))} campaigns | {num(frag.get('adsets'))} ad sets | {num(frag.get('ads'))} ads")
            lines.append(f"- Fragmentation: {num(frag.get('adsets_per_campaign'))} ad sets/campaign | {num(frag.get('ads_per_adset'))} ads/ad set")
            if frag.get("over_fragmented"):
                lines.append("- Over-fragmented account shape detected")
        test_next = meta_findings.get("test_next") or []
        if test_next:
            lines.append("- Test next suggestions:")
            for item in test_next[:4]:
                lines.append(f"  - {item}")
        lines.append("")

    flags = []
    if learning_phase:
        flags.append("LEARNING PHASE (<50 conversions/7d)")
    if creative_fatigue:
        flags.append("CREATIVE FATIGUE (freq>3.5)")
    if fragmentation_risk:
        flags.append("FRAGMENTATION RISK (too many ad sets or ads per ad set)")

    if flags:
        lines.append("FLAGS")
        for f in flags:
            lines.append(f"- {f}")
        lines.append("")

    lines.append("RECOMMENDATION")
    lines.append(f"- Framework action: {normalized['decision']['recommended_action'].upper()}")
    if blocks:
        lines.append("- BLOCKED by guardrails:")
        for b in blocks:
            lines.append(f"  - {b}")
        lines.append("- Next step: ALERT HUMAN for judgment.")
    else:
        if action in {"scale", "prune", "hold", "diagnose"}:
            lines.append("- RECOMMENDATIONS ONLY (no automated actions enabled yet)")
    lines.append("")

    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
