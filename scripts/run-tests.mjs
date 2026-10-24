// Runs the compiled tests with node:test, one file at a time (the timing tests must not compete
// for the CPU). Works the same on Node.js 20 and 22 and on every OS, without shell globs.
// `npm test -- mcp` runs only the files whose name contains "mcp".
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const dir = join(".test-dist", "test");
const filters = process.argv.slice(2);
const files = readdirSync(dir)
  .filter((name) => name.endsWith(".test.js"))
  .filter((name) => filters.length === 0 || filters.some((filter) => name.includes(filter)))
  .sort()
  .map((name) => join(dir, name));

if (files.length === 0) {
  console.error(`No test files found in ${dir}`);
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", "--test-concurrency=1", ...files], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
