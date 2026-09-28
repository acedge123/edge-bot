---
name: docx
description: Use when working with Microsoft Word documents (.docx): create new DOCX deliverables, extract/inspect text, edit existing .docx by unpacking/editing OOXML, add comments or tracked changes, accept/reject changes, convert via LibreOffice/pandoc, or validate/repair DOCX structure.
---

# DOCX (Word) creation, editing, and analysis

A `.docx` file is a ZIP archive containing Office Open XML (OOXML).

## Common workflows

### 1) Read / extract content
- Prefer **pandoc** for readable text extraction.
  - Include tracked changes when needed:
    ```bash
    pandoc --track-changes=all input.docx -o output.md
    ```
- For low-level inspection, unpack the DOCX to XML:
  ```bash
  python scripts/office/unpack.py input.docx unpacked/
  ```

### 2) Edit an existing DOCX (OOXML round-trip)
Follow this order:
1. Unpack:
   ```bash
   python scripts/office/unpack.py input.docx unpacked/
   ```
2. Edit XML under `unpacked/word/`.
   - For tracked changes/comments: see the XML patterns in this skill’s scripts and the upstream guidance.
   - Use smart quotes entities when inserting new text that contains quotes/apostrophes:
     - `&#x2018;` `&#x2019;` `&#x201C;` `&#x201D;`
3. Pack back into a valid DOCX:
   ```bash
   python scripts/office/pack.py unpacked/ output.docx --original input.docx
   ```

### 3) Add comments
Use the helper to create comment boilerplate across the necessary parts:
```bash
python scripts/comment.py unpacked/ 0 "Comment text with &amp; and &#x2019;"
python scripts/comment.py unpacked/ 1 "Reply text" --parent 0
```
Then add comment markers to `unpacked/word/document.xml` (commentRangeStart/End + commentReference).

### 4) Accept tracked changes (produce a clean final)
```bash
python scripts/accept_changes.py input.docx output.docx
```
This uses LibreOffice in headless mode.

### 5) Convert
- `.doc` → `.docx` (LibreOffice):
  ```bash
  python scripts/office/soffice.py --headless --convert-to docx input.doc
  ```
- `.docx` → `.pdf` (LibreOffice):
  ```bash
  python scripts/office/soffice.py --headless --convert-to pdf input.docx
  ```

### 6) Validate structure
```bash
python scripts/office/validate.py input.docx
```

## Notes / dependencies
- External tools used by this skill (if installed): `pandoc`, `soffice` (LibreOffice), `pdftoppm`.
- `scripts/office/soffice.py` may compile a small local LD_PRELOAD shim with `gcc` if AF_UNIX sockets are blocked in the runtime.
- License terms for the bundled implementation are in `LICENSE.txt`.
