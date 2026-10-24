// Files that `add` writes in the user's project (spec §3.5): DESIGN.md and the CLAUDE.md import.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { DesignRef } from "./ids.js";

export interface Target {
  readonly ref: DesignRef;
  /** Absolute path of the file to write. */
  readonly path: string;
  /** Path relative to the base folder with "/" separators (for messages and CLAUDE.md). */
  readonly rel: string;
}

/** DESIGN.md for one design, design/<ID>.md for two or three, or `out` for one. */
export function planTargets(baseDir: string, refs: readonly DesignRef[], out?: string): Target[] {
  return refs.map((ref) => {
    const file = out ?? (refs.length === 1 ? "DESIGN.md" : `design/${ref.id}.md`);
    const path = resolve(baseDir, file);
    return { ref, path, rel: displayPath(baseDir, path) };
  });
}

export function displayPath(baseDir: string, path: string): string {
  const rel = relative(baseDir, path);
  return (rel !== "" && !isAbsolute(rel) ? rel : path).split(sep).join("/");
}

export function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function fileExists(path: string): boolean {
  return existsSync(path);
}

/** Writes the fetched bytes unchanged. Without `force`, an existing file is never replaced. */
export function writeDesign(target: Target, bytes: Uint8Array, force: boolean): void {
  mkdirSync(dirname(target.path), { recursive: true });
  writeFileSync(target.path, bytes, { flag: force ? "w" : "wx" });
}

export type ClaudeMdChange = "created" | "added" | "present";

/** Appends `@<rel>` to CLAUDE.md in `baseDir` unless the line is already there. */
export function addClaudeMdImport(baseDir: string, rel: string): ClaudeMdChange {
  const file = resolve(baseDir, "CLAUDE.md");
  const line = `@${rel}`;
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    writeFileSync(file, `${line}\n`);
    return "created";
  }
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  if (lines.includes(line) || lines.includes(`@./${rel}`)) return "present";
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const separator = text === "" || text.endsWith("\n") ? "" : eol;
  writeFileSync(file, `${text}${separator}${line}${eol}`);
  return "added";
}
