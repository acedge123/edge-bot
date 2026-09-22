---
name: xlsx
description: Use when the task centers on spreadsheet files (.xlsx/.xlsm/.csv/.tsv): reading, cleaning, restructuring, fixing broken workbooks, converting formats, recalculating formulas, validating/repairing Office Open XML spreadsheets, or delivering an Excel file as the final output.
---

# XLSX (Excel) workflows

An `.xlsx`/`.xlsm` file is a ZIP archive containing SpreadsheetML XML.

## Core quality bars (when delivering Excel)
- Deliver with **no obvious formula errors** (`#REF!`, `#DIV/0!`, `#VALUE!`, `#NAME?`, etc.) unless the user explicitly wants them.
- Preserve existing template formatting/conventions when editing a provided file.

## Common workflows

### 1) Unpack → edit XML → repack (low-level repair)
1. Unpack:
   ```bash
   python3 scripts/office/unpack.py input.xlsx unpacked/
   ```
2. Edit the XML in `unpacked/xl/` (worksheets, sharedStrings, styles, calcChain, etc.).
3. Pack:
   ```bash
   python3 scripts/office/pack.py unpacked/ output.xlsx --original input.xlsx
   ```

### 2) Validate structure
```bash
python3 scripts/office/validate.py input.xlsx
```
Use after edits and before delivering, especially if Excel complains about “repairing” the file.

### 3) Recalculate / refresh formulas (LibreOffice)
If a workbook needs formulas recalculated (e.g., values not updated, stale cached results), use:
```bash
python3 scripts/recalc.py input.xlsx output.xlsx
```
This runs LibreOffice headless.

### 4) Convert formats
For conversions that LibreOffice handles well:
```bash
python3 scripts/office/soffice.py --headless --convert-to xlsx input.csv
python3 scripts/office/soffice.py --headless --convert-to csv  input.xlsx
```

## Notes / dependencies
- External tools used by this skill (if installed): `soffice` (LibreOffice).
- `scripts/office/soffice.py` may compile a small local LD_PRELOAD shim with `gcc` if AF_UNIX sockets are blocked in the runtime.
- License terms for the bundled implementation are in `LICENSE.txt`.
