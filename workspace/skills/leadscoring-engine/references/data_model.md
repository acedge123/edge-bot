# Lead Scoring Engine — Data Model Cheat Sheet

## Core entities

- **Question**: the prompt shown on a form.
  - `number` (1-based ordering)
  - `text`
  - `field_name` (letters/numbers/underscore; this is the key used in answers + rules + formulas)
  - `type`: `CH`, `MC`, `O`, `I`, `S`, `D`
  - `multiple_values` (optional): if true, multiple entries can be provided using `field_name[index]` semantics.

- **Choice** (for `CH`/`MC`):
  - `slug` (answer token submitted)
  - `text` (display)
  - `value` (numeric value used for scoring/rules)

- **ScoringModel** (one per Question):
  - `weight`
  - `x_axis` / `y_axis` booleans
  - optional `formula` (computed numeric/date value)
  - `ranges` (ValueRange) OR `dates_ranges` (DatesRange)

- **Recommendation** (optional, per Question):
  - `rule` (string beginning with `If`)
  - payload: `response_text`, `affiliate_name`, `affiliate_image`, `affiliate_link`, `redirect_url`

## How answers become values

Normalization happens in `backend/scoringengine/helpers.py::collect_answers_values`.

- `CH`: submitted `slug` → stored response becomes `choice.text`; value is `choice.value`
- `MC`: submitted comma-separated slugs → stored response becomes joined `choice.text`s; values is list of `choice.value`
- `I`: response parsed as int → value
- `S`: response parsed as float; must be within `[min_value, max_value]` → value
- `D`: response parsed as `YYYY-MM-DD` → date_value
- `O`: value becomes `1` if non-empty else `0`

## Fields usable in rules/formulas

Rules/formulas can reference:
- Question `field_name` values for types: `S`, `I`, `CH`, `O`, `D`
- Calculated score fields:
  - `{x_axis_score}`
  - `{y_axis_score}`
  - `{total_score}`

(From `Question.get_possible_field_names` in `backend/scoringengine/models.py`.)
