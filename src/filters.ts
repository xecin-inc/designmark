// Turns user input for the search filters into index values, or a usage error that lists the
// accepted values. Shared by the CLI (`search`, `packs`) and the MCP server.

import { usageError } from "./errors.js";
import { choiceList } from "./format.js";
import type { Messages } from "./i18n.js";
import {
  type CategoryRef,
  COLOR_FAMILIES,
  MOODS,
  resolveCategory,
  resolveColor,
  resolveMood,
  type View,
} from "./search.js";

export function limitOf(
  raw: string | number | undefined,
  min: number,
  max: number,
  fallback: number,
  msg: Messages,
): number {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw usageError(msg.badLimit(min, max));
  }
  return value;
}

export function viewOf(raw: string | undefined, msg: Messages): View | undefined {
  if (raw === undefined) return undefined;
  const view = raw.trim().toLowerCase();
  if (view !== "sp" && view !== "pc") throw usageError(msg.badView);
  return view;
}

export function colorOf(input: string, msg: Messages): string {
  const family = resolveColor(input);
  if (!family) {
    throw usageError(msg.unknownColor(input, choiceList(Object.keys(COLOR_FAMILIES))));
  }
  return family;
}

export function moodOf(input: string, known: Iterable<string>, msg: Messages): string {
  const mood = resolveMood(input, known);
  if (!mood) throw usageError(msg.unknownMood(input, choiceList(MOODS.map((m) => m.slug))));
  return mood;
}

export function categoryOf(
  input: string,
  categories: readonly CategoryRef[],
  msg: Messages,
): CategoryRef {
  const category = resolveCategory(input, categories);
  if (!category) {
    const choices = categories.map((c) => (c.slug ? `${c.slug} (${c.name})` : c.name));
    throw usageError(msg.unknownCategory(input, choiceList(choices)));
  }
  return category;
}
