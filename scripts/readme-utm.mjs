// Switches the UTM source of the README links between GitHub and npm, so that visits from the
// npm page are counted as utm_source=npm (spec §5.3). The replacement is exact and reversible:
// only "utm_source=github&" <-> "utm_source=npm&" changes.
//
//   prepack      node scripts/readme-utm.mjs npm
//   postpack     node scripts/readme-utm.mjs github --after-pack
//   postpublish  node scripts/readme-utm.mjs github
//
// `npm publish` reads README.md from disk again after packing (the manifest's `readme` field,
// which npmjs.com shows), so during a publish the restore waits for postpublish. If a publish
// fails half-way, run `node scripts/readme-utm.mjs github` to restore the files.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const [target, flag] = process.argv.slice(2);
if (target !== "npm" && target !== "github") {
  console.error("Usage: node scripts/readme-utm.mjs <npm|github> [--after-pack]");
  process.exit(2);
}
if (flag === "--after-pack" && process.env.npm_command === "publish") process.exit(0);

const [from, to] =
  target === "npm"
    ? ["utm_source=github&", "utm_source=npm&"]
    : ["utm_source=npm&", "utm_source=github&"];

for (const file of ["README.md", "README_ja.md"]) {
  if (!existsSync(file)) continue;
  const text = readFileSync(file, "utf8");
  const next = text.split(from).join(to);
  if (next !== text) writeFileSync(file, next);
}
