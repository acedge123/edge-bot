import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

for (const name of ["survey-hub-manage", "mom-walk-manage"]) {
  test(`${name} executes when invoked through the installed symlink`, () => {
    const dir = mkdtempSync(join(tmpdir(), "manage-cli-"));
    try {
      const link = join(dir, name);
      symlinkSync(fileURLToPath(new URL(`./${name}.mjs`, import.meta.url)), link);
      const output = execFileSync(process.execPath, [link, "list-actions"], {
        encoding: "utf8",
      });
      const result = JSON.parse(output);
      assert.ok(result.actions.length > 0);
      assert.ok(result.actions.every((action) => typeof action.name === "string"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
