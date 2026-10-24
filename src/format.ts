// Small display helpers shared by the CLI commands and the MCP server. Japanese output shows the
// Japanese names from the index; English output shows the English style names and the slugs.

import type { LpItem, PackItem } from "./api.js";
import type { Lang } from "./i18n.js";
import { moodSlug } from "./search.js";

export function lpTitle(item: LpItem, lang: Lang): string {
  return (lang === "en" ? item.style || item.title : item.title || item.style) || item.id;
}

export function packTitle(pack: PackItem, lang: Lang): string {
  return (lang === "en" ? pack.style || pack.title : pack.title || pack.style) || pack.id;
}

export function categoryLabel(entry: { category: string; category_slug: string }, lang: Lang) {
  return lang === "en"
    ? entry.category_slug || entry.category
    : entry.category || entry.category_slug;
}

export function moodsLabel(moods: readonly string[], lang: Lang): string {
  return lang === "en" ? moods.map((mood) => moodSlug(mood) ?? mood).join(", ") : moods.join("、");
}

export function packMoodLabel(pack: PackItem, lang: Lang): string {
  return lang === "en" ? pack.mood_slug || pack.mood : pack.mood || pack.mood_slug;
}

/** "SP・PC" in Japanese, "SP/PC" in English. */
export function viewsLabel(views: readonly string[], lang: Lang): string {
  return views.map((view) => view.toUpperCase()).join(lang === "ja" ? "・" : "/");
}

export function paletteLabel(palette: readonly string[], max: number): string {
  return palette.slice(0, max).join(" ");
}

/** Joins non-empty columns with two spaces. */
export function columns(...cells: readonly string[]): string {
  return cells.filter((cell) => cell !== "").join("  ");
}

/** Comma-separated choices for "unknown value" messages. */
export function choiceList(values: readonly string[]): string {
  return values.join(", ");
}
