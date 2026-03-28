#!/usr/bin/env python3
"""
Extract transaction-like lines from text-based bank statement PDFs into CSV.

Tested on Bank of America–style e-statements where each transaction starts
with MM/DD/YY on a line and the amount is the last currency token on that line.

Requires: pip install pdfplumber

Usage:
  python3 pdf-statements-to-csv.py /path/to/pdfs --out /path/to/csv-dir
  python3 pdf-statements-to-csv.py . --out ./csv

Limitations:
- Scanned (image-only) PDFs need OCR first (not supported here).
- Multi-line descriptions: amount must appear on the same line as the date
  (covers most BoA lines; a few wrapped edge cases may be skipped).
- Redacted PDFs with broken text encoding may garble descriptions; amounts/dates
  usually still parse if visible.
"""

from __future__ import annotations

import argparse
import csv
import re
from pathlib import Path

try:
    import pdfplumber
except ImportError:
    raise SystemExit("Install pdfplumber: pip3 install --user pdfplumber") from None

DATE_START = re.compile(r"^(\d{2}/\d{2}/\d{2})\s+")
# Last currency-like number on the line (handles -1,234.56 and 1234.56)
AMOUNT_END = re.compile(r"(-?\s*(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2})\s*$")

SKIP_SUBSTRINGS = (
    "continued on the next page",
    "page ",
    "account security",
    "how to contact",
    "important inf",
    "bank deposit accounts",
    "your checking account",
    "account summary",
    "beginning balance",
    "ending balance",
    "average ledger",
    "daily ledger balances",
    "service fees",
    "total # of",
    "subtotal for card",
    "card account #",
)


def section_from_context(line: str, prev_section: str) -> str:
    u = line.upper()
    if "DEPOSITS AND OTHER CREDITS" in u or "DEPOSITS AND OT" in u:
        return "deposits"
    if "WITHDRAWALS AND OTHER DEBITS" in u or "WITHDRAWALS AND OT" in u:
        return "withdrawals"
    if "CHECKS" in u and "DATE" in u and "CHECK #" in u.replace(" ", ""):
        return "checks"
    return prev_section


def extract_rows_from_text(text: str, source_pdf: str) -> list[dict]:
    rows: list[dict] = []
    section = "unknown"
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        section = section_from_context(line, section)
        low = line.lower()
        if any(s in low for s in SKIP_SUBSTRINGS):
            continue
        if line.startswith("Total ") or line.startswith("Total\t"):
            continue
        m = DATE_START.match(line)
        if not m:
            continue
        date = m.group(1)
        rest = line[m.end() :]
        am = AMOUNT_END.search(rest)
        if not am:
            continue
        desc = rest[: am.start()].strip()
        amt_raw = am.group(1).replace(" ", "").replace(",", "")
        try:
            amount = float(amt_raw)
        except ValueError:
            continue
        if len(desc) < 3:
            continue
        rows.append(
            {
                "source_pdf": source_pdf,
                "section": section,
                "date": date,
                "description": desc,
                "amount": f"{amount:.2f}",
            }
        )
    return rows


def pdf_to_rows(path: Path) -> list[dict]:
    all_rows: list[dict] = []
    name = path.name
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            t = page.extract_text() or ""
            all_rows.extend(extract_rows_from_text(t, name))
    return all_rows


def main() -> None:
    ap = argparse.ArgumentParser(description="Convert text-based statement PDFs to CSV.")
    ap.add_argument("input_dir", type=Path, help="Directory containing PDF files")
    ap.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Output directory for CSV files (default: <input_dir>/csv)",
    )
    ap.add_argument(
        "--combined",
        action="store_true",
        help="Also write all_transactions.csv combining every PDF",
    )
    args = ap.parse_args()
    indir: Path = args.input_dir
    outdir: Path = args.out or (indir / "csv")
    outdir.mkdir(parents=True, exist_ok=True)

    pdfs = sorted(indir.glob("*.pdf"))
    if not pdfs:
        raise SystemExit(f"No PDF files in {indir}")

    combined: list[dict] = []
    for pdf in pdfs:
        rows = pdf_to_rows(pdf)
        combined.extend(rows)
        out_csv = outdir / f"{pdf.stem}.csv"
        with out_csv.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(
                f, fieldnames=["source_pdf", "section", "date", "description", "amount"]
            )
            w.writeheader()
            w.writerows(rows)
        print(f"{pdf.name}: {len(rows)} rows -> {out_csv}")

    if args.combined and combined:
        all_path = outdir / "all_transactions.csv"
        with all_path.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(
                f, fieldnames=["source_pdf", "section", "date", "description", "amount"]
            )
            w.writeheader()
            w.writerows(combined)
        print(f"Combined: {len(combined)} rows -> {all_path}")


if __name__ == "__main__":
    main()
