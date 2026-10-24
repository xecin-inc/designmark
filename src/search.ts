// Filtering and ranking shared by the CLI and the MCP server (spec §3.3, §4.1).

import type { LpItem, PackItem } from "./api.js";

/** Moods and their slugs (spec §6.2). */
export const MOODS: readonly { readonly name: string; readonly slug: string }[] = [
  { name: "ナチュラル", slug: "natural" },
  { name: "やさしい・柔らかい", slug: "soft" },
  { name: "上品・高級", slug: "elegant" },
  { name: "シンプル・ミニマル", slug: "minimal" },
  { name: "ポップ・元気", slug: "pop" },
  { name: "レトロ", slug: "retro" },
  { name: "かわいい", slug: "cute" },
  { name: "スポーティ", slug: "sporty" },
  { name: "クール・先進的", slug: "cool" },
  { name: "ラグジュアリー・ダーク", slug: "dark-luxury" },
  { name: "信頼・誠実", slug: "trust" },
  { name: "親しみ・手作り感", slug: "handmade" },
  { name: "和風", slug: "wafu" },
  { name: "清潔・爽やか", slug: "fresh" },
  { name: "力強い・インパクト", slug: "bold" },
  { name: "情報量多め・訴求型", slug: "dense" },
];

/** `color_family` values (spec §2.1) and the Japanese names accepted for them. */
export const COLOR_FAMILIES: Readonly<Record<string, readonly string[]>> = {
  red: ["赤", "レッド"],
  orange: ["オレンジ", "橙", "だいだい"],
  yellow: ["黄", "黄色", "イエロー"],
  green: ["緑", "グリーン"],
  teal: ["青緑", "ティール", "ターコイズ"],
  blue: ["青", "ブルー", "紺", "ネイビー"],
  purple: ["紫", "パープル"],
  pink: ["ピンク", "桃色"],
  brown: ["茶", "茶色", "ブラウン"],
  black: ["黒", "ブラック"],
  gray: ["グレー", "グレイ", "灰", "灰色", "grey"],
  white: ["白", "ホワイト"],
};

export type View = "sp" | "pc";
export type Scope = "all" | "packs" | "lp";

export interface CategoryRef {
  readonly name: string;
  readonly slug: string;
}

export interface SearchFilters {
  /** Free words; each must appear somewhere in the item (spec §3.3 step 3). */
  readonly words: readonly string[];
  readonly category?: CategoryRef | undefined;
  /** Mood names; an item must have all of them. */
  readonly moods?: readonly string[] | undefined;
  readonly colorFamily?: string | undefined;
  readonly view?: View | undefined;
}

export interface SearchOptions {
  readonly scope: Scope;
  readonly limit: number;
  /** Packs shown before the LP designs when scope is "all" (spec §3.3 step 4: 3). */
  readonly maxPacks: number;
}

export interface SearchResult {
  readonly packs: PackItem[];
  readonly items: LpItem[];
  /** Every match, before the limit. */
  readonly total: number;
}

/** NFKC and lower case, as in spec §3.3. */
export function normalize(text: string): string {
  return text.normalize("NFKC").toLowerCase();
}

export function search(
  items: readonly LpItem[],
  packs: readonly PackItem[],
  filters: SearchFilters,
  options: SearchOptions,
): SearchResult {
  const words = filters.words.flatMap((word) => normalize(word).split(/\s+/)).filter(Boolean);

  const lp =
    options.scope === "packs"
      ? []
      : rank(
          items.filter((item) => matchesLp(item, filters)),
          (item) => score(prepareLp(item), words),
          (a, b) =>
            a.published_at < b.published_at ? 1 : a.published_at > b.published_at ? -1 : 0,
        );
  const pk =
    options.scope === "lp"
      ? []
      : rank(
          packs.filter((pack) => matchesPack(pack, filters)),
          (pack) => score(preparePack(pack), words),
          () => 0,
        );

  const total = lp.length + pk.length;
  if (options.scope === "packs") return { packs: pk.slice(0, options.limit), items: [], total };
  if (options.scope === "lp") return { packs: [], items: lp.slice(0, options.limit), total };
  const shownPacks = pk.slice(0, Math.min(options.maxPacks, options.limit));
  return { packs: shownPacks, items: lp.slice(0, options.limit - shownPacks.length), total };
}

/** Keeps the entries every word matches, best score first; ties keep `tieBreak`, then the index order. */
function rank<T>(
  entries: readonly T[],
  scoreOf: (entry: T) => number | undefined,
  tieBreak: (a: T, b: T) => number,
): T[] {
  const scored: { entry: T; score: number; order: number }[] = [];
  entries.forEach((entry, order) => {
    const value = scoreOf(entry);
    if (value !== undefined) scored.push({ entry, score: value, order });
  });
  scored.sort((a, b) => b.score - a.score || tieBreak(a.entry, b.entry) || a.order - b.order);
  return scored.map((s) => s.entry);
}

function matchesLp(item: LpItem, filters: SearchFilters): boolean {
  if (filters.category && !sameCategory(item, filters.category)) return false;
  if (filters.moods?.some((mood) => !item.moods.includes(mood))) return false;
  if (filters.colorFamily && item.color_family !== filters.colorFamily) return false;
  if (filters.view && !item.views.includes(filters.view)) return false;
  return true;
}

function matchesPack(pack: PackItem, filters: SearchFilters): boolean {
  // Packs have no color family or view: a color or view filter keeps LP designs only.
  if (filters.colorFamily || filters.view) return false;
  if (filters.category && !sameCategory(pack, filters.category)) return false;
  if (filters.moods?.some((mood) => pack.mood !== mood)) return false;
  return true;
}

function sameCategory(entry: { category: string; category_slug: string }, ref: CategoryRef) {
  return entry.category_slug ? entry.category_slug === ref.slug : entry.category === ref.name;
}

/** Normalized text per scoring field (spec §3.3 step 3). */
interface Prepared {
  readonly title: string;
  readonly keywords: readonly string[];
  readonly style: string;
  readonly category: string;
  readonly moods: string;
  readonly colors: string;
}

const preparedCache = new WeakMap<object, Prepared>();

function prepareLp(item: LpItem): Prepared {
  let prepared = preparedCache.get(item);
  if (!prepared) {
    prepared = {
      title: normalize(item.title),
      keywords: item.keywords.map(normalize),
      style: normalize(item.style),
      category: normalize(`${item.category}\n${item.category_slug}`),
      moods: normalize(item.moods.map((mood) => `${mood}\n${moodSlug(mood) ?? ""}`).join("\n")),
      colors: normalize(
        [item.color_family, ...(COLOR_FAMILIES[item.color_family] ?? [])].join("\n"),
      ),
    };
    preparedCache.set(item, prepared);
  }
  return prepared;
}

function preparePack(pack: PackItem): Prepared {
  let prepared = preparedCache.get(pack);
  if (!prepared) {
    prepared = {
      title: normalize(pack.title),
      keywords: [],
      style: normalize(pack.style),
      category: normalize(`${pack.category}\n${pack.category_slug}`),
      moods: normalize(`${pack.mood}\n${pack.mood_slug}`),
      colors: "",
    };
    preparedCache.set(pack, prepared);
  }
  return prepared;
}

/** Title 3, keyword 2, style / industry / mood / color name 1 per word; undefined if a word misses. */
function score(prepared: Prepared, words: readonly string[]): number | undefined {
  let total = 0;
  for (const word of words) {
    let points = 0;
    if (prepared.title.includes(word)) points += 3;
    if (prepared.keywords.some((keyword) => keyword.includes(word))) points += 2;
    if (prepared.style.includes(word)) points += 1;
    if (prepared.category.includes(word)) points += 1;
    if (prepared.moods.includes(word)) points += 1;
    if (prepared.colors.includes(word)) points += 1;
    if (points === 0) return undefined;
    total += points;
  }
  return total;
}

export function moodSlug(name: string): string | undefined {
  return MOODS.find((mood) => mood.name === name)?.slug;
}

/** A mood name or slug → the mood name. Also accepts one part of a name ("上品" → "上品・高級"). */
export function resolveMood(input: string, knownNames: Iterable<string> = []): string | undefined {
  const wanted = normalize(input).trim();
  const bySlug = MOODS.find((mood) => mood.slug === wanted);
  if (bySlug) return bySlug.name;
  const names = new Set<string>([...MOODS.map((mood) => mood.name), ...knownNames]);
  for (const name of names) if (normalize(name) === wanted) return name;
  for (const name of names) {
    if (name.split("・").some((part) => normalize(part) === wanted)) return name;
  }
  return undefined;
}

/** A `color_family` value or a Japanese color name ("青", "青系", "黄色") → the family. */
export function resolveColor(input: string): string | undefined {
  const wanted = normalize(input).trim();
  const candidates = [
    wanted,
    wanted.replace(/系$/, ""),
    wanted.replace(/系$/, "").replace(/色$/, ""),
  ];
  for (const candidate of candidates) {
    for (const [family, names] of Object.entries(COLOR_FAMILIES)) {
      if (candidate === family || names.some((name) => normalize(name) === candidate)) {
        return family;
      }
    }
  }
  return undefined;
}

/** An industry name or slug → the industry. Also accepts one part ("化粧品" → "化粧品・スキンケア"). */
export function resolveCategory(
  input: string,
  categories: readonly CategoryRef[],
): CategoryRef | undefined {
  const wanted = normalize(input).trim();
  return (
    categories.find((category) => normalize(category.slug) === wanted) ??
    categories.find((category) => normalize(category.name) === wanted) ??
    categories.find((category) =>
      category.name.split("・").some((part) => normalize(part) === wanted),
    )
  );
}

/** The industries found in the indexes, without duplicates, in order of appearance. */
export function categoriesOf(
  ...lists: readonly (readonly { category: string; category_slug: string }[])[]
): CategoryRef[] {
  const seen = new Map<string, CategoryRef>();
  for (const list of lists) {
    for (const entry of list) {
      const key = entry.category_slug || entry.category;
      if (key && !seen.has(key)) seen.set(key, { name: entry.category, slug: entry.category_slug });
    }
  }
  return [...seen.values()];
}
