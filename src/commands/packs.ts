// `designmark packs [--category]` (spec §3.6): the pattern packs grouped by industry, in the
// order of the site's navigation (/api/v1/categories.json).

import type { DesignmarkApi, PackItem } from "../api.js";
import type { Context } from "../context.js";
import { usageError } from "../errors.js";
import { categoryOf } from "../filters.js";
import { categoryLabel, columns, packMoodLabel, packTitle } from "../format.js";
import { categoriesOf } from "../search.js";
import { indexFailure, parseCommand, printJson, printLines, warnIfStale } from "./common.js";

export async function run(ctx: Context, args: readonly string[]): Promise<number> {
  const { values, positionals } = parseCommand(ctx, args, { category: { type: "string" } });
  const { msg, lang } = ctx;
  if (positionals[0] !== undefined) throw usageError(msg.unexpectedArgument(positionals[0]));

  const api = ctx.api();
  let loaded: Awaited<ReturnType<DesignmarkApi["packs"]>>;
  try {
    loaded = await api.packs();
  } catch (error) {
    throw indexFailure(error, msg);
  }
  warnIfStale(ctx, loaded);

  let packs = loaded.data.packs;
  if (values.category !== undefined) {
    const category = categoryOf(values.category, categoriesOf(packs), msg);
    packs = packs.filter(
      (pack) => (pack.category_slug || pack.category) === (category.slug || category.name),
    );
  }
  const groups = groupByCategory(packs, await categoryOrder(api));

  if (values.json) {
    printJson(ctx, {
      license: loaded.data.license,
      attribution: loaded.data.attribution,
      packs: groups.flat(),
    });
    return 0;
  }
  if (packs.length === 0) {
    printLines(ctx, [msg.noPacks]);
    return 0;
  }
  const width = Math.max(...packs.map((pack) => pack.id.length));
  const lines = [msg.headingPacks];
  for (const group of groups) {
    const first = group[0] as PackItem;
    lines.push(
      lang === "ja" ? first.category : `${categoryLabel(first, lang)} (${first.category})`,
    );
    for (const pack of group) {
      const cells = [pack.id.padEnd(width), packTitle(pack, lang), packMoodLabel(pack, lang)];
      lines.push(`  ${columns(...cells, msg.membersShort(pack.members))}`);
    }
  }
  lines.push(msg.packsSummary(packs.length));
  printLines(ctx, lines);
  return 0;
}

/** Industry slugs in the site's order; empty when categories.json is unavailable. */
async function categoryOrder(api: DesignmarkApi): Promise<string[]> {
  try {
    return (await api.categories()).data.categories.map(
      (category) => category.slug || category.name,
    );
  } catch {
    return [];
  }
}

/** Groups by industry: known industries in `order`, the rest in order of first appearance. */
function groupByCategory(packs: readonly PackItem[], order: readonly string[]): PackItem[][] {
  const groups = new Map<string, PackItem[]>();
  for (const pack of packs) {
    const key = pack.category_slug || pack.category;
    const group = groups.get(key);
    if (group) group.push(pack);
    else groups.set(key, [pack]);
  }
  const rank = (key: string) => {
    const index = order.indexOf(key);
    return index < 0 ? order.length : index;
  };
  return [...groups.entries()].sort((a, b) => rank(a[0]) - rank(b[0])).map(([, group]) => group);
}
