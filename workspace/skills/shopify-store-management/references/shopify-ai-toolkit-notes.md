# Shopify AI Toolkit Notes

Use the toolkit as a schema-aware, validation-first surface for Shopify work.

## Design implications for the skill
- Prefer read/inspect/validate before write.
- Treat Shopify docs and schema validation as first-class inputs.
- Keep store ops explicit and narrow.
- Avoid vague "do Shopify stuff" behavior.

## Skill shape
- Store context gathering
- Inspection of products, collections, inventory, orders, customers, and themes
- Validation before mutations
- Dry-run planning by default
- Clear execute/verify steps

## Good fit
- Repeatable store operations
- Admin workflows
- Structured catalog updates
- Safe schema-backed changes

## Not enough by itself
- Broad magical automation
- Unbounded destructive actions
- Credential guessing
