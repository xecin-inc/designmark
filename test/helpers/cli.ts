// Runs the compiled CLI in a child process, like a user would, and manages temporary folders.

import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** The compiled CLI next to the compiled tests (.test-dist/src/cli.js). */
export const CLI_PATH = fileURLToPath(new URL("../../src/cli.js", import.meta.url));

/** The repository root (for reading package.json, plugin files, …). */
export const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

export interface CliResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly ms: number;
}

export interface CliOptions {
  /** Added to a copy of process.env without DESIGNMARK_*; undefined removes a variable. */
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly cwd?: string;
}

export function runCli(args: readonly string[], options: CliOptions = {}): Promise<CliResult> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !key.startsWith("DESIGNMARK_")) env[key] = value;
  }
  env.DESIGNMARK_LANG = "en";
  env.BROWSER = "none";
  for (const [key, value] of Object.entries(options.env ?? {})) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  const started = performance.now();
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [CLI_PATH, ...args],
      { env, cwd: options.cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const code = error === null ? 0 : typeof error.code === "number" ? error.code : -1;
        resolve({ code, stdout, stderr, ms: performance.now() - started });
      },
    );
  });
}

export function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "designmark-test-"));
}

export function removeDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

/** Environment for a CLI run against the fixture server, with its own cache folder. */
export function testEnv(
  serverUrl: string,
  cacheDir: string,
  extra: Readonly<Record<string, string | undefined>> = {},
): Record<string, string | undefined> {
  return {
    DESIGNMARK_API: serverUrl,
    DESIGNMARK_CACHE_DIR: cacheDir,
    DESIGNMARK_TEST_INTERVAL_MS: "5",
    ...extra,
  };
}
