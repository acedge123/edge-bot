#!/usr/bin/env python3
"""Plot a MATLAB expression y=f(x) to an image/PDF by running MATLAB headlessly.

Example:
  python3 plot_function.py --expr "sin(x)./x" --xmin -20 --xmax 20 --out /tmp/sinc.png

Requirements:
  - MATLAB installed and `matlab` available on PATH.
"""

import argparse
import os
import shlex
import subprocess
import sys
import tempfile
from pathlib import Path


def run(cmd, *, check=True):
    proc = subprocess.run(cmd, text=True, capture_output=True)
    if check and proc.returncode != 0:
        raise RuntimeError(
            "Command failed (exit %s):\n%s\n\nSTDOUT:\n%s\n\nSTDERR:\n%s"
            % (proc.returncode, " ".join(map(shlex.quote, cmd)), proc.stdout, proc.stderr)
        )
    return proc


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--expr", required=True, help="MATLAB expression in terms of x (use elementwise ops)")
    ap.add_argument("--xmin", type=float, required=True)
    ap.add_argument("--xmax", type=float, required=True)
    ap.add_argument("--out", required=True, help="Output file path (.png, .pdf, etc.)")
    ap.add_argument("--title", default="")
    ap.add_argument("--xlabel", default="x")
    ap.add_argument("--ylabel", default="")
    ap.add_argument("--n", type=int, default=2000, help="Number of sample points")
    ap.add_argument("--linewidth", type=float, default=2.0)
    args = ap.parse_args()

    out_path = Path(args.out).expanduser().resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    # Generate a self-contained MATLAB script.
    # We intentionally embed the expression as code, not as eval of a string.
    # This is for convenience; treat inputs as trusted.
    matlab_script = f"""
try
  set(0,'DefaultFigureVisible','off');
  f = @(x) {args.expr};
  x = linspace({args.xmin}, {args.xmax}, {args.n});
  y = f(x);
  fig = figure('Visible','off');
  plot(x, y, 'LineWidth', {args.linewidth});
  grid on;
  xlabel({args.xlabel!r});
  ylabel({args.ylabel!r});
  if ~isempty({args.title!r})
    title({args.title!r});
  end
  set(fig, 'Color', 'w');
  exportgraphics(fig, {str(out_path)!r});
  close(fig);
  disp('WROTE: {str(out_path)}');
catch ME
  disp(getReport(ME, 'extended'));
  exit(1);
end
exit(0);
""".lstrip()

    with tempfile.TemporaryDirectory(prefix="matlab-plot-") as td:
        td = Path(td)
        mfile = td / "plot_function_generated.m"
        mfile.write_text(matlab_script, encoding="utf-8")

        # Prefer -batch (newer MATLAB), fallback to -r for older versions.
        batch_cmd = ["matlab", "-batch", f"run('{mfile.as_posix()}')"]
        try:
            proc = run(batch_cmd, check=True)
        except Exception as e_batch:
            # Fallback.
            fallback_cmd = [
                "matlab",
                "-nodisplay",
                "-nosplash",
                "-nodesktop",
                "-r",
                f"run('{mfile.as_posix()}');",
            ]
            try:
                proc = run(fallback_cmd, check=True)
            except Exception as e_fallback:
                raise RuntimeError(
                    "MATLAB run failed with -batch and fallback -r.\n\n"
                    f"-batch error: {e_batch}\n\nFallback error: {e_fallback}"
                )

        if not out_path.exists():
            raise RuntimeError(
                "MATLAB reported success but output file was not created: %s\n\nSTDOUT:\n%s\n\nSTDERR:\n%s"
                % (out_path, proc.stdout, proc.stderr)
            )

        # Print path for easy piping.
        print(str(out_path))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(2)
