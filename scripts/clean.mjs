// Removes build output folders: `node scripts/clean.mjs [dir...]` (default: dist and .test-dist).
import { rmSync } from "node:fs";

const targets = process.argv.slice(2);
for (const target of targets.length > 0 ? targets : ["dist", ".test-dist"]) {
  rmSync(target, { recursive: true, force: true });
}
