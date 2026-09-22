---
name: matlab-plot
description: "Plot MATLAB functions and save figures (PNG/PDF) by generating a small .m script and running MATLAB in batch mode. Use when a user asks to plot a MATLAB function/expression (e.g., \"plot sin(x)/x from -20 to 20\"), export a figure, or automate function plotting from the CLI."
---

# MATLAB Plot (function → image)

## What this skill does

- Turn a MATLAB expression in terms of `x` into a plot.
- Run MATLAB headlessly (batch mode) and save the figure to a file.

This skill assumes MATLAB is installed and `matlab` is on PATH.

## Quick start (recommended)

Use the bundled script:

```bash
python3 skills/matlab-plot/scripts/plot_function.py \
  --expr "sin(x)./x" \
  --xmin -20 --xmax 20 \
  --out /tmp/sinc.png \
  --title "sin(x)/x" \
  --xlabel x --ylabel "sin(x)/x" \
  --n 4000
```

### Notes

- Use elementwise operators for vectors: `.*`, `./`, `.^`.
- If the expression has a removable singularity (e.g., `sin(x)/x` at 0), you can either live with `NaN` at one point or provide a piecewise expression.

## Common variants

### Plot multiple expressions

Run the script multiple times or extend the generated `.m` if you need multiple lines.

### Export PDF instead of PNG

Use `--out something.pdf`.

## Troubleshooting checklist

1. Confirm MATLAB works headlessly:
   - `matlab -batch "disp(version)"`
2. If `-batch` fails (very old MATLAB), the script tries a `-nodisplay -nosplash -r` fallback.
3. If you see no output file, check stderr from the MATLAB run.
