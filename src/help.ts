// --help texts.

import type { Lang } from "./i18n.js";

export type CommandName = "search" | "show" | "add" | "packs" | "open" | "mcp";

const COMMON_EN = `Common options:
  --json           Machine-readable output
  --lang ja|en     Display language
  -h, --help       Show help`;

const COMMON_JA = `共通のオプション:
  --json           機械で読む形で出力する
  --lang ja|en     表示の言語
  -h, --help       使い方を表示する`;

const GLOBAL_EN = `designmark — Japanese landing-page design systems (DESIGN.md) from designmark.jp

Usage: npx designmark <command> [arguments] [options]

Commands:
  search [words...]   Search LP designs and pattern packs
  show <ID>           Show a design's summary (--raw prints the whole DESIGN.md)
  add <ID...>         Save up to 3 designs in your project (DESIGN.md)
  packs               List the pattern packs (CC BY 4.0)
  open <ID>           Open the design's page in your browser
  mcp                 Start the MCP server (stdio)

${COMMON_EN}
  -v, --version    Show the version

IDs: xd-xxxxxxxx (LP design), pk-… (pattern pack), or a designmark.jp URL.
Exit codes: 0 ok, 1 failure, 2 usage error, 3 not found (withdrawn or wrong ID),
            4 temporarily unavailable (wait about 5 minutes).
The designs are unofficial analyses of public Japanese landing pages: never reuse
the original pages' logos, photos, copy or product names.
https://designmark.jp
`;

const GLOBAL_JA = `designmark — designmark.jp の日本の LP の設計書（DESIGN.md）を探して使う

使い方: npx designmark <コマンド> [引数] [オプション]

コマンド:
  search [語...]      LP 単位の設計書と型パックを探す
  show <ID>           設計書の要点を表示する（--raw で DESIGN.md の全文）
  add <ID...>         プロジェクトに DESIGN.md を置く（一度に 3 件まで）
  packs               型パック（CC BY 4.0）の一覧
  open <ID>           詳細ページをブラウザで開く
  mcp                 MCP サーバーとして起動する（stdio）

${COMMON_JA}
  -v, --version    版を表示する

ID: xd-xxxxxxxx（LP 単位）、pk-…（型パック）、または designmark.jp の URL
終了コード: 0 成功 / 1 失敗 / 2 使い方の誤り / 3 見つからない（取り下げか ID の誤り）/
            4 一時的に取得できない（5 分ほど待つ）
設計書は公開されている日本の LP を独自に分析した非公式の資料です。元 LP のロゴ・写真・
文章・商品名は使わないでください。
https://designmark.jp
`;

const COMMANDS: Record<CommandName, Record<Lang, string>> = {
  search: {
    en: `Usage: npx designmark search [words...] [options]

Search LP designs and pattern packs. Every word must match (title, keywords, style,
industry, mood or color name).

Options:
  --category <name|slug>   Industry, e.g. cosmetics or 化粧品
  --mood <name|slug>       Mood (repeatable; all must match), e.g. elegant
  --color <family>         Main color: red orange yellow green teal blue purple
                           pink brown black gray white (or 青, 赤, …). LP designs only
  --view sp|pc             Analysed view. LP designs only
  --packs-only             Pattern packs only
  --lp-only                LP designs only
  --limit <1-50>           Number of results (default 10)

${COMMON_EN}

Example: npx designmark search 化粧品 --mood elegant
`,
    ja: `使い方: npx designmark search [語...] [オプション]

LP 単位の設計書と型パックを探します。語はすべてが（題名・キーワード・スタイル名・業種・
雰囲気・色の名前のどこかに）含まれるものを返します。

オプション:
  --category <名前|スラッグ>   業種（例: cosmetics、化粧品）
  --mood <名前|スラッグ>       雰囲気（くり返し可。すべてを含むもの。例: elegant）
  --color <色>                 主色の系統: red orange yellow green teal blue purple pink
                               brown black gray white（青・赤 なども可）。LP 単位だけ
  --view sp|pc                 分析した画面。LP 単位だけ
  --packs-only                 型パックだけ
  --lp-only                    LP 単位だけ
  --limit <1〜50>              表示する件数（既定 10）

${COMMON_JA}

例: npx designmark search 化粧品 --mood elegant
`,
  },
  show: {
    en: `Usage: npx designmark show <ID> [--raw]

Show the title, style, industry, moods, colors (role and HEX), page URL and the add command.

Options:
  --raw    Print the whole DESIGN.md to stdout (for pipes)

${COMMON_EN}
`,
    ja: `使い方: npx designmark show <ID> [--raw]

題名・スタイル名・業種・雰囲気・配色（役割と HEX）・詳細ページの URL・導入のコマンドを表示します。

オプション:
  --raw    DESIGN.md の全文をそのまま標準出力に書く（パイプで渡す用）

${COMMON_JA}
`,
  },
  add: {
    en: `Usage: npx designmark add <ID...> [options]

Save designs in your project: DESIGN.md for one ID, design/<ID>.md for two or three.
At most 3 IDs per run; they are fetched one at a time, at least 1 second apart.

Options:
  --dir <folder>    Project folder (default: the current folder)
  --out <file>      File to write (one ID only; default DESIGN.md)
  --force           Overwrite existing files
  --claude-md       Add "@DESIGN.md" (the written path) to CLAUDE.md

${COMMON_EN}

Example: npx designmark add pk-cosmetics-elegant --claude-md
`,
    ja: `使い方: npx designmark add <ID...> [オプション]

プロジェクトに設計書を置きます。1 件なら DESIGN.md、2〜3 件なら design/<ID>.md。
一度に 3 件まで。1 件ずつ、1 秒以上あけて取得します。

オプション:
  --dir <フォルダ>    置き場所の基準（既定: 今のフォルダ）
  --out <ファイル>    書き出す先（ID が 1 件のときだけ。既定 DESIGN.md）
  --force             既存のファイルを上書きする
  --claude-md         CLAUDE.md に「@DESIGN.md」（書き出した先）の行を足す

${COMMON_JA}

例: npx designmark add pk-cosmetics-elegant --claude-md
`,
  },
  packs: {
    en: `Usage: npx designmark packs [--category <name|slug>]

List the pattern packs (CC BY 4.0) by industry.

${COMMON_EN}
`,
    ja: `使い方: npx designmark packs [--category <名前|スラッグ>]

型パック（CC BY 4.0）の一覧を業種の順に表示します。

${COMMON_JA}
`,
  },
  open: {
    en: `Usage: npx designmark open <ID>

Open the design's page on designmark.jp in your default browser
(prints the URL instead when no browser can be opened, or when BROWSER=none).

${COMMON_EN}
`,
    ja: `使い方: npx designmark open <ID>

詳細ページを既定のブラウザで開きます（開けないとき・BROWSER=none のときは URL を表示）。

${COMMON_JA}
`,
  },
  mcp: {
    en: `Usage: npx designmark mcp

Start the MCP server over stdio. Tools: search_designs, get_design, list_packs, get_pack.
Limit: 30 DESIGN.md fetches per 10 minutes, at least 1 second apart.

Claude Code:  claude mcp add designmark -- npx -y designmark@1 mcp
Cursor:       .cursor/mcp.json → {"mcpServers":{"designmark":{"command":"npx","args":["-y","designmark@1","mcp"]}}}
`,
    ja: `使い方: npx designmark mcp

MCP サーバーを stdio で起動します。ツール: search_designs・get_design・list_packs・get_pack。
取得の上限: 10 分あたり 30 件・1 秒に 1 件。

Claude Code:  claude mcp add designmark -- npx -y designmark@1 mcp
Cursor:       .cursor/mcp.json → {"mcpServers":{"designmark":{"command":"npx","args":["-y","designmark@1","mcp"]}}}
`,
  },
};

export function globalHelp(lang: Lang): string {
  return lang === "ja" ? GLOBAL_JA : GLOBAL_EN;
}

export function commandHelp(command: CommandName, lang: Lang): string {
  return COMMANDS[command][lang];
}
