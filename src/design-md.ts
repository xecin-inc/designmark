// Reads the parts of a DESIGN.md that `show` displays (spec §3.4). The YAML front matter is the
// source of the color tokens; the "## Colors" table only adds the role text when it is there.
// A tiny line-based reader is enough for this flat block and avoids a YAML dependency.

export interface ColorToken {
  readonly token: string;
  readonly hex: string;
  readonly role?: string | undefined;
}

/** The YAML between the leading `---` lines, if any. */
export function frontMatter(markdown: string): string | undefined {
  return /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(markdown)?.[1];
}

/** A top-level scalar of the front matter, such as `name`. */
export function frontMatterValue(markdown: string, key: string): string | undefined {
  const yaml = frontMatter(markdown);
  if (yaml === undefined) return undefined;
  for (const line of yaml.split(/\r?\n/)) {
    const match = /^([\w-]+):\s*(.*)$/.exec(line);
    if (match?.[1] === key) return unquote(match[2] ?? "") || undefined;
  }
  return undefined;
}

/** `colors:` tokens in YAML order, with the role from the "## Colors" table when available. */
export function colorTokens(markdown: string): ColorToken[] {
  const yaml = frontMatter(markdown);
  if (yaml === undefined) return [];
  const roles = colorRoles(markdown);
  const tokens: ColorToken[] = [];
  let inColors = false;
  for (const line of yaml.split(/\r?\n/)) {
    if (!inColors) {
      inColors = /^colors:\s*$/.test(line);
      continue;
    }
    if (/^\S/.test(line)) break;
    const match = /^\s+([\w.-]+):\s*(.+?)\s*$/.exec(line);
    const token = match?.[1];
    const hex = unquote(match?.[2] ?? "");
    if (token && /^#[0-9a-f]{3,8}$/i.test(hex)) tokens.push({ token, hex, role: roles.get(token) });
  }
  return tokens;
}

/** Rows like "| `primary` | `#C7B2A2` | role text | …" in the "## Colors" section. */
function colorRoles(markdown: string): Map<string, string> {
  const roles = new Map<string, string>();
  const start = markdown.search(/^## Colors\s*$/m);
  if (start < 0) return roles;
  const rest = markdown.slice(start + 1);
  const end = rest.search(/^## /m);
  for (const line of (end < 0 ? rest : rest.slice(0, end)).split(/\r?\n/)) {
    const cells = line.split("|").map((cell) => cell.trim());
    const token = /^`([\w.-]+)`$/.exec(cells[1] ?? "")?.[1];
    const role = cells[3];
    if (token && /#[0-9a-f]{3,8}/i.test(cells[2] ?? "") && role) roles.set(token, role);
  }
  return roles;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  const quoted = /^(['"])(.*)\1$/.exec(trimmed);
  return quoted ? (quoted[2] ?? "") : trimmed;
}
