#!/usr/bin/env node
// Entry point (package.json "bin"). Checks the Node.js version before loading any module that
// needs Node.js 20 (spec §3.1: show the version and exit with code 1).

import { detectLang } from "./i18n.js";
import { nodeVersionProblem } from "./node-check.js";

const argv = process.argv.slice(2);
const problem = nodeVersionProblem(process.version, detectLang(argv, process.env));
if (problem) {
  process.stderr.write(`${problem}\n`);
  process.exit(1);
}

// A closed pipe (e.g. `designmark search … | head -1`) is not an error.
process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") process.exit(0);
  throw error;
});

const { main } = await import("./main.js");
process.exitCode = await main(argv);
