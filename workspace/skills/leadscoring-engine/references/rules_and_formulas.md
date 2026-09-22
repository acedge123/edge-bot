# Lead Scoring Engine — Rules & Formulas

Implementation lives in `backend/scoringengine/models.py`.

## Recommendations rules

- Must begin with `If` (prefix is stripped before eval).
- Syntax is regex-validated, then evaluated.
- Can reference values using `{field_name}`.
- Can reference computed fields: `{x_axis_score}`, `{y_axis_score}`, `{total_score}`.

Example:

- `If {total_score} < 30 and {credit_score} < 600`

## Scoring formulas

A ScoringModel can define `formula` to compute a value before binning into ranges.

- Use `{field_name}` placeholders.
- Supports arithmetic, comparisons, boolean logic, parentheses.
- Supports aggregate functions for multiple-value questions: `mean`, `median`, `sum`, `min`, `max`, `count`.
- Supports some math/date helpers: `sqrt`, `today()`, `days(...)` and date diffs.
- Multi-value indexing: `{field_name[0]}`, `{field_name[-1]}`.

Notes:
- Division by zero returns None (no points).
- Date literals like `2026-03-13` are converted to `date(2026,3,13)`.
