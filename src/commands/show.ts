// `designmark show <ID> [--raw]` (spec §3.4).

import type { DesignmarkApi, LpItem, PackItem } from "../api.js";
import type { Context } from "../context.js";
import { type ColorToken, colorTokens, frontMatterValue } from "../design-md.js";
import {
  categoryLabel,
  lpTitle,
  moodsLabel,
  packMoodLabel,
  packTitle,
  viewsLabel,
} from "../format.js";
import { type DesignRef, designPath } from "../ids.js";
import { designFailure, parseCommand, printJson, printLines, singleRef } from "./common.js";

export async function run(ctx: Context, args: readonly string[]): Promise<number> {
  const { values, positionals } = parseCommand(ctx, args, { raw: { type: "boolean" } });
  const ref = singleRef(ctx, positionals);
  const api = ctx.api();

  const result = await api.design(ref);
  if (!result.ok) throw designFailure(result, ctx.msg);

  if (values.raw) {
    ctx.io.stdout(result.bytes);
    ctx.warn(ref.kind === "pack" ? ctx.msg.packLicense : ctx.msg.notice);
    return 0;
  }

  const entry = await lookUp(api, ref);
  const colors = colorTokens(result.text);
  if (values.json) {
    printJson(ctx, {
      id: ref.id,
      kind: ref.kind,
      item: entry ?? null,
      colors,
      page: api.pageUrl(ref),
      design_md: api.baseUrl + designPath(ref),
    });
    return 0;
  }

  const lines =
    ref.kind === "lp"
      ? lpLines(ctx, ref, entry as LpItem | undefined, result.text)
      : packLines(ctx, ref, entry as PackItem | undefined, result.text);
  lines.push(...colorLines(ctx, colors));
  lines.push(`${ctx.msg.labelPage}: ${api.pageUrl(ref)}`);
  lines.push(`${ctx.msg.labelInstall}: npx designmark add ${ref.id}`);
  lines.push(ref.kind === "pack" ? ctx.msg.packLicense : ctx.msg.notice);
  printLines(ctx, lines);
  return 0;
}

/** The index entry for the summary, from the cache when possible. Never fails the command. */
async function lookUp(api: DesignmarkApi, ref: DesignRef): Promise<LpItem | PackItem | undefined> {
  try {
    if (ref.kind === "lp") return (await api.index()).data.items.find((item) => item.id === ref.id);
    return (await api.packs()).data.packs.find((pack) => pack.id === ref.id);
  } catch {
    return undefined;
  }
}

function heading(title: string, id: string, lang: string): string {
  return lang === "ja" ? `${title}（${id}）` : `${title} (${id})`;
}

function lpLines(ctx: Context, ref: DesignRef, item: LpItem | undefined, text: string): string[] {
  const { lang, msg } = ctx;
  if (!item) return [heading(frontMatterValue(text, "name") ?? ref.id, ref.id, lang)];
  const lines = [heading(lpTitle(item, lang), ref.id, lang)];
  if (lang === "ja") lines.push(`${msg.labelStyle}: ${item.style}`);
  else lines.push(`${msg.labelTitleJa}: ${item.title}`);
  lines.push(
    `${msg.labelCategory}: ${lang === "ja" ? item.category : `${categoryLabel(item, lang)} (${item.category})`}`,
    `${msg.labelMoods}: ${moodsLabel(item.moods, lang)}`,
    `${msg.labelViews}: ${viewsLabel(item.views, lang)}`,
    `${msg.labelPublished}: ${item.published_at}`,
  );
  return lines;
}

function packLines(
  ctx: Context,
  ref: DesignRef,
  pack: PackItem | undefined,
  text: string,
): string[] {
  const { lang, msg } = ctx;
  if (!pack) return [heading(frontMatterValue(text, "name") ?? ref.id, ref.id, lang)];
  const lines = [heading(packTitle(pack, lang), ref.id, lang)];
  if (lang === "ja") lines.push(`${msg.labelStyle}: ${pack.style}`);
  else lines.push(`${msg.labelTitleJa}: ${pack.title}`);
  lines.push(
    `${msg.labelCategory}: ${lang === "ja" ? pack.category : `${categoryLabel(pack, lang)} (${pack.category})`}`,
    `${msg.labelMoods}: ${packMoodLabel(pack, lang)}`,
    `${msg.labelMembers}: ${msg.membersValue(pack.members)}`,
  );
  if (pack.version)
    lines.push(`${msg.labelVersion}: ${msg.versionValue(pack.version, pack.updated_at)}`);
  lines.push(`${msg.labelLicense}: ${msg.licenseValue}`);
  return lines;
}

function colorLines(ctx: Context, colors: readonly ColorToken[]): string[] {
  if (colors.length === 0) return [ctx.msg.noColors];
  const width = Math.max(...colors.map((color) => color.token.length));
  return [
    ctx.msg.colorsHeading,
    ...colors.map((color) =>
      `  ${color.token.padEnd(width)}  ${color.hex}${color.role ? `  ${color.role}` : ""}`.trimEnd(),
    ),
  ];
}
