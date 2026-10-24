import assert from "node:assert/strict";
import { test } from "node:test";
import {
  categoriesOf,
  resolveCategory,
  resolveColor,
  resolveMood,
  type SearchFilters,
  type SearchOptions,
  search,
} from "../src/search.js";
import { LP_ITEMS, PACKS } from "./helpers/fixtures.js";

const ALL: SearchOptions = { scope: "all", limit: 10, maxPacks: 3 };
const ids = (list: readonly { id: string }[]) => list.map((entry) => entry.id);
const run = (filters: Partial<SearchFilters>, options: SearchOptions = ALL) =>
  search(LP_ITEMS, PACKS, { words: [], ...filters }, options);

test("every word must match; title 3, keyword 2, others 1; ties: newest first", () => {
  // "上品": title+mood (4) for a and f, mood only (1) for c. a is newer than f.
  assert.deepEqual(ids(run({ words: ["上品"] }, { ...ALL, scope: "lp" }).items), [
    "xd-0000000a",
    "xd-0000000f",
    "xd-0000000c",
  ]);
  // Both words must match: only c has 上品 (mood) and 黒 (title, keyword, color name).
  assert.deepEqual(ids(run({ words: ["上品 黒"] }).items), ["xd-0000000c"]);
});

test("words are compared after NFKC and lower-casing", () => {
  assert.deepEqual(ids(run({ words: ["ｌｐ全角"] }).items), ["xd-0000000f"]);
  assert.deepEqual(ids(run({ words: ["IVORY"] }).items), ["xd-0000000a"]);
  // Industry and mood slugs and color names count as text too.
  assert.ok(ids(run({ words: ["cosmetics", "elegant"] }).items).includes("xd-0000000c"));
  assert.deepEqual(ids(run({ words: ["緑"] }).items), ["xd-0000000e"]);
});

test("filters: industry, moods (all), color and view", () => {
  const cosmetics = { name: "化粧品・スキンケア", slug: "cosmetics" };
  const result = run({ category: cosmetics, moods: ["上品・高級"] });
  assert.deepEqual(ids(result.packs), ["pk-cosmetics-elegant"]);
  assert.deepEqual(ids(result.items), ["xd-0000000a", "xd-0000000c", "xd-0000000f"]);
  assert.deepEqual(ids(run({ moods: ["上品・高級", "ラグジュアリー・ダーク"] }).items), [
    "xd-0000000c",
  ]);
  // Packs have no color or view, so these filters keep LP designs only.
  const blue = run({ colorFamily: "blue" });
  assert.deepEqual(ids(blue.packs), []);
  assert.deepEqual(ids(blue.items), ["xd-0000000d"]);
  assert.deepEqual(ids(run({ view: "pc" }).items), [
    "xd-0000000a",
    "xd-0000000b",
    "xd-0000000c",
    "xd-0000000e",
  ]);
});

test("packs first, at most 3; LP designs fill up to the limit; total counts every match", () => {
  const result = run({});
  assert.equal(result.packs.length, 3);
  assert.equal(result.items.length, 6);
  assert.equal(result.total, 10);
  const limited = run({}, { ...ALL, limit: 5 });
  assert.equal(limited.packs.length, 3);
  assert.equal(limited.items.length, 2);
  assert.equal(run({}, { ...ALL, limit: 2 }).packs.length, 2);
  assert.equal(run({}, { ...ALL, limit: 2 }).items.length, 0);
});

test("--packs-only and --lp-only", () => {
  const packs = run({}, { ...ALL, scope: "packs" });
  assert.equal(packs.packs.length, 4);
  assert.equal(packs.items.length, 0);
  assert.equal(packs.total, 4);
  const lp = run({}, { ...ALL, scope: "lp", limit: 4 });
  assert.equal(lp.packs.length, 0);
  assert.deepEqual(ids(lp.items), ["xd-0000000a", "xd-0000000b", "xd-0000000c", "xd-0000000d"]);
  assert.equal(lp.total, 6);
});

test("moods by name, slug or one part of the name", () => {
  assert.equal(resolveMood("elegant"), "上品・高級");
  assert.equal(resolveMood("ELEGANT"), "上品・高級");
  assert.equal(resolveMood("上品・高級"), "上品・高級");
  assert.equal(resolveMood("上品"), "上品・高級");
  assert.equal(resolveMood("ﾅﾁｭﾗﾙ"), "ナチュラル");
  assert.equal(resolveMood("dark-luxury"), "ラグジュアリー・ダーク");
  assert.equal(resolveMood("新しい雰囲気", ["新しい雰囲気"]), "新しい雰囲気");
  assert.equal(resolveMood("unknown"), undefined);
});

test("colors by family or Japanese name", () => {
  assert.equal(resolveColor("青"), "blue");
  assert.equal(resolveColor("青系"), "blue");
  assert.equal(resolveColor("Blue"), "blue");
  assert.equal(resolveColor("黄色"), "yellow");
  assert.equal(resolveColor("灰色"), "gray");
  assert.equal(resolveColor("grey"), "gray");
  assert.equal(resolveColor("水色"), undefined);
});

test("industries by slug, name or one part of the name", () => {
  const categories = categoriesOf(LP_ITEMS, PACKS);
  assert.deepEqual(
    categories.map((c) => c.slug),
    ["cosmetics", "medical", "health"],
  );
  for (const input of ["cosmetics", "COSMETICS", "化粧品・スキンケア", "化粧品", "スキンケア"]) {
    assert.equal(resolveCategory(input, categories)?.slug, "cosmetics", input);
  }
  assert.equal(resolveCategory("unknown", categories), undefined);
});
