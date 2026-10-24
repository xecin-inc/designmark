// `designmark search [words...]` (spec §3.3).

import type { Loaded, LpIndex, PackIndex } from "../api.js";
import type { Context } from "../context.js";
import { describeError, usageError } from "../errors.js";
import { categoryOf, colorOf, limitOf, moodOf, viewOf } from "../filters.js";
import { categoryLabel, columns, lpTitle, packTitle, paletteLabel, viewsLabel } from "../format.js";
import { categoriesOf, type Scope, type SearchResult, search } from "../search.js";
import { indexFailure, parseCommand, printJson, printLines, warnIfStale } from "./common.js";

const MAX_PACKS_FIRST = 3;

export async function run(ctx: Context, args: readonly string[]): Promise<number> {
  const { values, positionals } = parseCommand(ctx, args, {
    category: { type: "string" },
    mood: { type: "string", multiple: true },
    color: { type: "string" },
    view: { type: "string" },
    "packs-only": { type: "boolean" },
    "lp-only": { type: "boolean" },
    limit: { type: "string" },
  });
  const { msg } = ctx;

  // Everything that can be checked without the network is checked first.
  const limit = limitOf(values.limit, 1, 50, 10, msg);
  if (values["packs-only"] && values["lp-only"]) throw usageError(msg.bothScopes);
  const scope: Scope = values["packs-only"] ? "packs" : values["lp-only"] ? "lp" : "all";
  const view = viewOf(values.view, msg);
  const colorFamily = values.color === undefined ? undefined : colorOf(values.color, msg);

  const api = ctx.api();
  let lp: Loaded<LpIndex> | undefined;
  let packs: Loaded<PackIndex> | undefined;
  if (scope !== "packs") {
    try {
      lp = await api.index();
    } catch (error) {
      throw indexFailure(error, msg);
    }
  }
  if (scope !== "lp") {
    try {
      packs = await api.packs();
    } catch (error) {
      if (scope === "packs") throw indexFailure(error, msg);
      ctx.warn(msg.packsIndexUnavailable(describeError(error)));
    }
  }
  warnIfStale(ctx, lp, packs);

  const items = lp?.data.items ?? [];
  const packItems = packs?.data.packs ?? [];
  const knownMoods = new Set(items.flatMap((item) => item.moods));
  const category =
    values.category === undefined
      ? undefined
      : categoryOf(values.category, categoriesOf(items, packItems), msg);
  const result = search(
    items,
    packItems,
    {
      words: positionals,
      category,
      moods: (values.mood ?? []).map((mood) => moodOf(mood, knownMoods, msg)),
      colorFamily,
      view,
    },
    { scope, limit, maxPacks: MAX_PACKS_FIRST },
  );

  if (values.json) {
    printJson(ctx, { packs: result.packs, items: result.items, total: result.total });
  } else {
    printLines(ctx, render(result, ctx));
  }
  return 0;
}

function render(result: SearchResult, ctx: Context): string[] {
  const { lang, msg } = ctx;
  if (result.packs.length === 0 && result.items.length === 0) return [msg.noMatch];
  const lines: string[] = [];
  if (result.packs.length > 0) {
    const width = Math.max(...result.packs.map((pack) => pack.id.length));
    lines.push(msg.headingPacks);
    for (const pack of result.packs) {
      const title = packTitle(pack, lang) + msg.synthesisedFrom(pack.members);
      lines.push(`  ${columns(pack.id.padEnd(width), title)}`);
    }
  }
  if (result.items.length > 0) {
    lines.push(msg.headingLp);
    for (const item of result.items) {
      const cells = [
        item.id,
        lpTitle(item, lang),
        categoryLabel(item, lang),
        viewsLabel(item.views, lang),
        paletteLabel(item.palette, 3),
      ];
      lines.push(`  ${columns(...cells)}`);
    }
  }
  lines.push(msg.searchSummary(result.packs.length + result.items.length, result.total));
  return lines;
}
