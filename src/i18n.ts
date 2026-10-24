// Display language and every user-facing message (spec §3.1, NFR-8).
// cli.ts loads this module before the Node.js version check, so it must not import anything.

export type Lang = "ja" | "en";

type Env = Readonly<Record<string, string | undefined>>;

/**
 * --lang → DESIGNMARK_LANG → LC_ALL / LC_MESSAGES / LANG starting with "ja" → the Intl locale
 * starting with "ja" → English (spec §3.1).
 */
export function detectLang(argv: readonly string[], env: Env, intlLocale = systemLocale()): Lang {
  const flag = langFlag(argv);
  if (flag === "ja" || flag === "en") return flag;
  const explicit = env.DESIGNMARK_LANG?.trim().toLowerCase();
  if (explicit?.startsWith("ja")) return "ja";
  if (explicit?.startsWith("en")) return "en";
  // POSIX precedence: the first of these that is set decides.
  const posix = env.LC_ALL || env.LC_MESSAGES || env.LANG;
  if (posix?.toLowerCase().startsWith("ja")) return "ja";
  if (intlLocale.toLowerCase().startsWith("ja")) return "ja";
  return "en";
}

/** The value of `--lang xx` or `--lang=xx` (options after `--` are ignored). */
export function langFlag(argv: readonly string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") break;
    if (arg === "--lang") return argv[i + 1] ?? "";
    if (arg?.startsWith("--lang=")) return arg.slice("--lang=".length);
  }
  return undefined;
}

function systemLocale(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return "";
  }
}

const ja = {
  // Shared
  notice:
    "非公式の分析資料です。元 LP のロゴ・写真・文章・商品名は使わず、自社の素材に置き換えてください。",
  packLicense:
    "型パックは CC BY 4.0 です。表示の例:「designmark（株式会社 XECIN）の型パックを利用」",
  invalidId: (input: string) => `ID か designmark の URL を指定してください: ${input}`,
  needOneId: "ID を 1 つ指定してください",
  unknownCommand: (name: string) => `不明なコマンドです: ${name}`,
  unknownOption: (name: string) => `不明なオプションです: ${name}`,
  badOptionValue: (name: string) => `オプションの値が正しくありません: ${name}`,
  unexpectedArgument: (value: string) => `余分な引数があります: ${value}`,
  seeHelp: "使い方: npx designmark --help",
  badLang: "--lang には ja か en を指定してください",
  badApi: (value: string) => `DESIGNMARK_API が URL ではありません: ${value}`,
  unexpected: (detail: string) => `予期しないエラーが起きました: ${detail}`,
  stale: (fetchedAt: string) => `注意: 最新でない可能性があります（取得日時 ${fetchedAt}）`,
  newerSchema: (version: number) =>
    `注意: 索引の形式が新しくなっています（schema_version ${version}）。npx designmark@latest で最新版をお使いください。`,
  notFound: (id: string) =>
    `見つかりません: ${id}（取り下げられたか、ID が違います）。npx designmark search で別の候補を探してください`,
  unavailable: "一時的に取得できません。5 分ほど待ってから再度お試しください",
  failed: (detail: string) => `通信に失敗しました（${detail}）。時間をおいて再度お試しください`,
  indexUnavailable: (detail: string) => `索引を取得できません（${detail}）。`,
  packsIndexUnavailable: (detail: string) =>
    `注意: 型パックの索引を取得できませんでした（${detail}）。LP 単位だけを表示します。`,
  noMatch: "該当する設計書はありません。条件を変えてお試しください。",

  // search
  badLimit: (min: number, max: number) => `--limit には ${min}〜${max} の整数を指定してください`,
  badView: "--view には sp か pc を指定してください",
  bothScopes: "--packs-only と --lp-only は同時に指定できません",
  unknownCategory: (input: string, choices: string) =>
    `業種が見つかりません: ${input}\n指定できる値: ${choices}`,
  unknownMood: (input: string, choices: string) =>
    `雰囲気が見つかりません: ${input}\n指定できる値: ${choices}`,
  unknownColor: (input: string, choices: string) =>
    `色が見つかりません: ${input}\n指定できる値: ${choices}`,
  headingPacks: "型パック（CC BY 4.0）",
  headingLp: "LP 単位",
  synthesisedFrom: (members: number) => `（${members} 件から合成）`,
  searchSummary: (shown: number, total: number) =>
    `${shown} 件 / 該当 ${total} 件。npx designmark add <ID> でプロジェクトに置けます。`,

  // show
  labelStyle: "スタイル",
  labelTitleJa: "題名",
  labelCategory: "業種",
  labelMoods: "雰囲気",
  labelViews: "画面",
  labelPublished: "公開日",
  labelMembers: "合成元",
  membersValue: (members: number) => `${members} 件の設計書`,
  labelVersion: "版",
  versionValue: (version: string, updatedAt: string) =>
    updatedAt ? `${version}（${updatedAt} 更新）` : version,
  labelLicense: "ライセンス",
  licenseValue: "CC BY 4.0（表示の例:「designmark（株式会社 XECIN）の型パックを利用」）",
  labelPage: "詳細ページ",
  labelInstall: "導入",
  colorsHeading: "配色（DESIGN.md の YAML から）:",
  noColors: "配色: （DESIGN.md の YAML に colors がありません）",

  // add
  needIds: "ID を 1 つ以上指定してください（一度に 3 件まで）",
  tooMany: "一度に取得できるのは 3 件までです",
  outWithMany: "--out は ID が 1 件のときだけ指定できます",
  dirMissing: (dir: string) => `フォルダが見つかりません: ${dir}`,
  exists: (rel: string) => `既に ${rel} があります。上書きするなら --force`,
  saved: (rel: string, id: string) => `${rel} に保存しました（${id}）`,
  claudeCreated: (line: string) => `CLAUDE.md を作り、${line} を追加しました`,
  claudeAdded: (line: string) => `CLAUDE.md に ${line} を追加しました`,
  claudePresent: (line: string) => `CLAUDE.md には既に ${line} があります`,
  claudeHint: (line: string) =>
    `Claude Code で読み込むには、CLAUDE.md に「${line}」の 1 行を足してください（--claude-md を付けると自動で足します）。`,
  skippedRest: (ids: string) => `残りの取得をやめました: ${ids}`,
  writeFailed: (rel: string, detail: string) => `${rel} に書き込めませんでした（${detail}）`,

  // packs
  noPacks: "型パックはまだありません。",
  packsSummary: (count: number) =>
    `${count} 件。npx designmark add <ID> でプロジェクトに置けます。`,
  membersShort: (members: number) => `${members} 件から合成`,

  // open
  opened: (url: string) => `ブラウザで開きました: ${url}`,
  openFailed: (url: string) => `ブラウザを開けませんでした。次の URL を開いてください: ${url}`,

  // MCP (spec §4.2)
  mcpRateLimited: (seconds: number) =>
    `取得の上限（10 分あたり 30 件）に達しました。あと ${seconds} 秒待ってください`,
  mcpNotFound:
    "見つかりません（取り下げられたか、ID が違います）。search_designs で別の候補を探してください",
  mcpBlocked:
    "一時的に取得できません（アクセスの制限の可能性）。5 分待ってから再度お試しください。別の ID を続けて取得しないでください",
  mcpFailed: (detail: string) => `通信に失敗しました（${detail}）。時間をおいて再度お試しください`,
  mcpSearchFooter: (shown: number, total: number) =>
    `${shown} 件 / 該当 ${total} 件。get_design で本文を取得できます（型パック pk-… は get_pack）。`,
  mcpPacksFooter: (count: number) => `${count} 件（CC BY 4.0）。get_pack で本文を取得できます。`,
  mcpPackHeader:
    "ライセンス: CC BY 4.0。表示の例:「designmark（株式会社 XECIN）の型パックを利用」（https://designmark.jp）",
};

export type Messages = typeof ja;

const en: Messages = {
  notice:
    "These are unofficial analyses. Do not reuse the logos, photos, copy or product names of the original pages; replace them with your own materials.",
  packLicense:
    'Pattern packs are CC BY 4.0. Attribution example: "Uses a pattern pack from designmark (XECIN Inc.)"',
  invalidId: (input: string) =>
    `Specify a design ID (xd-xxxxxxxx or pk-…) or a designmark.jp URL: ${input}`,
  needOneId: "Specify one design ID",
  unknownCommand: (name: string) => `Unknown command: ${name}`,
  unknownOption: (name: string) => `Unknown option: ${name}`,
  badOptionValue: (name: string) => `Missing or invalid value for option: ${name}`,
  unexpectedArgument: (value: string) => `Unexpected argument: ${value}`,
  seeHelp: "Usage: npx designmark --help",
  badLang: "--lang must be ja or en",
  badApi: (value: string) => `DESIGNMARK_API is not a URL: ${value}`,
  unexpected: (detail: string) => `Unexpected error: ${detail}`,
  stale: (fetchedAt: string) => `Note: results may be out of date (index fetched at ${fetchedAt}).`,
  newerSchema: (version: number) =>
    `Note: the index uses a newer format (schema_version ${version}). Update with npx designmark@latest.`,
  notFound: (id: string) =>
    `Not found: ${id} (withdrawn, or a wrong ID). Search for another design with npx designmark search.`,
  unavailable:
    "Temporarily unavailable (access may be limited). Wait about 5 minutes and try again.",
  failed: (detail: string) => `Request failed (${detail}). Please try again later.`,
  indexUnavailable: (detail: string) => `Could not get the index (${detail}). `,
  packsIndexUnavailable: (detail: string) =>
    `Note: could not get the pattern pack index (${detail}); showing LP designs only.`,
  noMatch: "No designs matched. Try other conditions.",

  badLimit: (min: number, max: number) => `--limit must be an integer from ${min} to ${max}`,
  badView: "--view must be sp or pc",
  bothScopes: "--packs-only and --lp-only cannot be used together",
  unknownCategory: (input: string, choices: string) =>
    `Unknown industry: ${input}\nChoose from: ${choices}`,
  unknownMood: (input: string, choices: string) =>
    `Unknown mood: ${input}\nChoose from: ${choices}`,
  unknownColor: (input: string, choices: string) =>
    `Unknown color: ${input}\nChoose from: ${choices}`,
  headingPacks: "Pattern packs (CC BY 4.0)",
  headingLp: "LP designs",
  synthesisedFrom: (members: number) => ` (synthesised from ${members} designs)`,
  searchSummary: (shown: number, total: number) =>
    `${shown} shown / ${total} matches. Run npx designmark add <ID> to put one in your project.`,

  labelStyle: "Style",
  labelTitleJa: "Title (ja)",
  labelCategory: "Industry",
  labelMoods: "Moods",
  labelViews: "Views",
  labelPublished: "Published",
  labelMembers: "Synthesised from",
  membersValue: (members: number) => `${members} designs`,
  labelVersion: "Version",
  versionValue: (version: string, updatedAt: string) =>
    updatedAt ? `${version} (updated ${updatedAt})` : version,
  labelLicense: "License",
  licenseValue:
    'CC BY 4.0 (attribution example: "Uses a pattern pack from designmark (XECIN Inc.)")',
  labelPage: "Page",
  labelInstall: "Add",
  colorsHeading: "Colors (from the DESIGN.md YAML):",
  noColors: "Colors: (no colors in the DESIGN.md YAML)",

  needIds: "Specify one or more design IDs (up to 3 at a time)",
  tooMany: "You can fetch at most 3 designs at a time.",
  outWithMany: "--out can only be used with a single ID",
  dirMissing: (dir: string) => `Folder not found: ${dir}`,
  exists: (rel: string) => `${rel} already exists. Use --force to overwrite it.`,
  saved: (rel: string, id: string) => `Saved ${id} to ${rel}`,
  claudeCreated: (line: string) => `Created CLAUDE.md with ${line}`,
  claudeAdded: (line: string) => `Added ${line} to CLAUDE.md`,
  claudePresent: (line: string) => `CLAUDE.md already has ${line}`,
  claudeHint: (line: string) =>
    `To load it in Claude Code, add the line "${line}" to CLAUDE.md (or rerun with --claude-md).`,
  skippedRest: (ids: string) => `Stopped without fetching: ${ids}`,
  writeFailed: (rel: string, detail: string) => `Could not write ${rel} (${detail})`,

  noPacks: "No pattern packs yet.",
  packsSummary: (count: number) =>
    `${count} pattern packs. Run npx designmark add <ID> to put one in your project.`,
  membersShort: (members: number) => `synthesised from ${members} designs`,

  opened: (url: string) => `Opened ${url}`,
  openFailed: (url: string) => `Could not open a browser. Open this URL: ${url}`,

  mcpRateLimited: (seconds: number) =>
    `Fetch limit reached (30 per 10 minutes). Wait ${seconds} more seconds.`,
  mcpNotFound: "Not found (withdrawn, or a wrong ID). Use search_designs to find another design.",
  mcpBlocked:
    "Temporarily unavailable (access may be limited). Wait 5 minutes before trying again, and do not fetch other IDs in the meantime.",
  mcpFailed: (detail: string) => `Request failed (${detail}). Please try again later.`,
  mcpSearchFooter: (shown: number, total: number) =>
    `${shown} shown / ${total} matches. Fetch the full DESIGN.md with get_design (pattern packs pk-…: get_pack).`,
  mcpPacksFooter: (count: number) => `${count} pattern packs (CC BY 4.0). Fetch one with get_pack.`,
  mcpPackHeader:
    'License: CC BY 4.0. Attribution example: "Uses a pattern pack from designmark (XECIN Inc.) — https://designmark.jp"',
};

export function messages(lang: Lang): Messages {
  return lang === "ja" ? ja : en;
}
