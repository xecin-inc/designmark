# designmark

**AI コーディングツールのための、日本の LP の設計書（DESIGN.md）。[designmark.jp](https://designmark.jp/?utm_source=github&utm_medium=readme&utm_campaign=tools) から探して、ターミナル・MCP クライアント・Claude Code でプロジェクトに置けます。**

[English](README.md) · [designmark.jp](https://designmark.jp/?utm_source=github&utm_medium=readme&utm_campaign=tools) · [型パック集（GitHub）](https://github.com/xecin-inc/awesome-japanese-lp-design-md?utm_source=github&utm_medium=readme&utm_campaign=tools)

designmark.jp は、公開されている日本の LP 4,000 件以上を分析した DESIGN.md（配色・書体・余白・部品・セクション構成）と、業種 × 雰囲気ごとに合成した **型パック**（CC BY 4.0）を公開しています。Claude Code・Cursor などに渡すと、そのトンマナで LP を作れます。

```bash
npx designmark search 化粧品 --mood elegant
npx designmark add <ID> --claude-md
```

`add` は今のフォルダに `DESIGN.md` を置きます。`--claude-md` を付けると、Claude Code が読み込むよう `CLAUDE.md` に `@DESIGN.md` の行も足します。Node.js 20 以上が必要です。

## CLI

| コマンド | 内容 |
| --- | --- |
| `search [語...]` | LP 単位の設計書と型パックを探す。語はすべてを含むもの |
| `show <ID>` | 題名・スタイル名・業種・雰囲気・配色（役割と HEX）・詳細ページの URL。`--raw` で DESIGN.md の全文 |
| `add <ID...>` | 設計書を置く（一度に 3 件まで）。1 件なら `DESIGN.md`、2〜3 件なら `design/<ID>.md` |
| `packs` | 型パックの一覧（業種の順） |
| `open <ID>` | designmark.jp の詳細ページを開く |
| `mcp` | MCP サーバーとして起動する（stdio） |

ID は `xd-xxxxxxxx`（LP 単位）、`pk-…`（型パック）、または designmark.jp の URL。どのコマンドも `--json`・`--lang ja|en`・`--help` が使えます。表示は色を使わないプレーンテキストです。

| `search` のオプション | |
| --- | --- |
| `--category <名前\|スラッグ>` | 業種（例: `cosmetics`、`化粧品`） |
| `--mood <名前\|スラッグ>` | 雰囲気。くり返し可（すべてを含むもの）: `natural` `soft` `elegant` `minimal` `pop` `retro` `cute` `sporty` `cool` `dark-luxury` `trust` `handmade` `wafu` `fresh` `bold` `dense`（日本語の名前も可） |
| `--color <色>` | 主色の系統: `red` `orange` `yellow` `green` `teal` `blue` `purple` `pink` `brown` `black` `gray` `white`、または `青` などの日本語（LP 単位だけ） |
| `--view sp\|pc` | 分析した画面（LP 単位だけ） |
| `--packs-only` / `--lp-only` | 型パックだけ／LP 単位だけ |
| `--limit <1〜50>` | 表示する件数（既定 10。型パックが先に最大 3 件） |

| `add` のオプション | |
| --- | --- |
| `--dir <フォルダ>` | 置き場所の基準（既定: 今のフォルダ） |
| `--out <ファイル>` | 書き出す先。ID が 1 件のときだけ（既定 `DESIGN.md`） |
| `--force` | 既存のファイルを上書きする（付けなければ上書きしない） |
| `--claude-md` | `CLAUDE.md` に `@<書き出したファイル>` を足す（何度実行しても 1 行） |

```bash
npx designmark search クリニック --view sp --limit 5
npx designmark search --category cosmetics --mood elegant --mood soft --json
npx designmark packs --category cosmetics
npx designmark show pk-cosmetics-elegant
npx designmark add pk-cosmetics-elegant --claude-md
npx designmark add <ID> --out docs/DESIGN.md
```

ファイルに保存するときは、`show --raw` をリダイレクトせずに `add`（別の場所なら `--out`）を使ってください。`add` は取得した内容をそのまま書きます（Windows PowerShell 5.1 のリダイレクトは文字コードを変えてしまいます）。

| 終了コード | 意味 |
| --- | --- |
| 0 | 成功 |
| 1 | 失敗（ファイルに書けない・想定外の通信の失敗） |
| 2 | 使い方の誤り（不明なオプション・ID の形の誤り・4 件以上の ID など） |
| 3 | 見つからない（最新の索引にない＝取り下げか ID の誤り） |
| 4 | 一時的に取得できない（アクセスの制限の可能性）。5 分ほど待つ |

| 環境変数 | |
| --- | --- |
| `DESIGNMARK_LANG` | `ja` か `en`（`--lang` が優先）。どちらもなければ `LC_ALL`・`LC_MESSAGES`・`LANG` → OS の言語 |
| `DESIGNMARK_CACHE_DIR` | 索引のキャッシュの置き場所。既定は Windows なら `%LOCALAPPDATA%\designmark`、ほかは `$XDG_CACHE_HOME/designmark` か `~/.cache/designmark` |
| `DESIGNMARK_API` | API の URL（既定 `https://designmark.jp`。テスト用） |
| `BROWSER=none` | `open` がブラウザを開かずに URL を表示する |

## MCP サーバー

Claude Code:

```bash
claude mcp add designmark -- npx -y designmark@1 mcp
```

Cursor（`.cursor/mcp.json`）:

```json
{ "mcpServers": { "designmark": { "command": "npx", "args": ["-y", "designmark@1", "mcp"] } } }
```

`designmark@1` は大きい版（1.x）を固定する書き方です。Windows（WSL ではない環境）で MCP クライアントが `npx` を起動できないときは、コマンドを `cmd`、引数を `/c npx -y designmark@1 mcp` にしてください。

| ツール | 入力 | 返すもの |
| --- | --- | --- |
| `search_designs` | `query`・`category`・`moods`・`color`・`view`・`include_packs`（既定 true）・`limit`（1〜20、既定 10） | 1 件 1 行: ID・題名・業種・雰囲気・主な配色・詳細ページの URL |
| `get_design` | `id`（`xd-…` か URL） | 注意の 1 行、空行、DESIGN.md の全文 |
| `list_packs` | `category` | 型パック 1 件 1 行: ID・題名・合成元の件数 |
| `get_pack` | `id`（`pk-…` か URL） | ライセンスと表示の例、空行、DESIGN.md の全文 |

サーバーはファイルを書きません（保存は呼び出す側のエージェントが行います）。表示の言語は `DESIGNMARK_LANG`（なければ OS の言語）に従います。

## Claude Code のプラグイン

```text
/plugin marketplace add xecin-inc/designmark
/plugin install designmark@designmark
```

プラグインには **designmark の Skill**（「日本の LP を作って」などの依頼で、業種と雰囲気を決め、候補を 3 件まで示し、選んだものを置いてから、そのトークンで作る）と、上の **MCP サーバー** が入っています。

## 取得の制限とその理由

designmark の[利用規約](https://designmark.jp/terms/?utm_source=github&utm_medium=readme&utm_campaign=tools)（第 2 条第 3 項）は、自動での大量取得を禁止しています。このツールは、その範囲に十分に収まるように作っています。

- `add` が一度に取得するのは **3 件まで**。1 件ずつ、**1 秒以上あけて**取得します。まとめて取得するコマンドはありません。
- MCP サーバーの取得は、1 プロセスで **10 分あたり 30 件まで**・1 秒に 1 件まで。designmark.jp に断られたら 5 分間は取得しません。
- 検索は索引のファイル 1 つで行い、6 時間キャッシュして、その後は ETag で確かめます。DESIGN.md の本文はキャッシュしないので、取り下げがすぐ反映されます。
- 取り下げられた設計書は終了コード 3 で知らせます。終了コード 4 はアクセスの制限の可能性です。5 分ほど待ち、別の ID を続けて試さないでください。

フォークして使う場合も、この制限を外さないでください。designmark.jp のミラーや、LP 単位の設計書をデータセットとして再配布することはできません。制限を外した使い方は遮断されることがあります。

## データについて

- LP 単位の設計書（`xd-…`）は、公開されている日本の LP を独自に分析した**非公式の資料**で、元 LP の運営企業・制作会社とは関係ありません。**元 LP のロゴ・写真・文章・商品名は使わず**、自社の素材に置き換えてください。
- 型パック（`pk-…`）は多数の設計書を集計して合成した型で、特定の LP のデザインではありません。ライセンスは **CC BY 4.0**（表示の例:「designmark（株式会社 XECIN）の型パックを利用」）。[designmark.jp](https://designmark.jp/packs/?utm_source=github&utm_medium=readme&utm_campaign=tools) と[型パック集](https://github.com/xecin-inc/awesome-japanese-lp-design-md?utm_source=github&utm_medium=readme&utm_campaign=tools)で見られます。
- 元 LP の権利者の方は、[削除依頼のフォーム](https://designmark.jp/takedown/?utm_source=github&utm_medium=readme&utm_campaign=tools)から掲載の削除を依頼できます。

## プライバシー

利用状況などの情報は送信しません（テレメトリーなし）。通信先は `https://designmark.jp` だけで、User-Agent は `designmark-cli/<版>` か `designmark-mcp/<版>` です。通常のアクセスと同じく、designmark.jp に IP アドレス等が記録される場合があります。

## 開発

```bash
npm ci
npm run lint
npm run typecheck
npm test     # designmark.jp の代わりにテスト用のローカルサーバーを使う
npm run build
```

`v*` のタグを打つと、GitHub Actions が npm に公開します（信頼された公開者・出どころの証明付き）。

designmark は株式会社 XECIN が運営しています。AI を使った LP の制作や、自社専用の DESIGN.md づくりは[制作の相談](https://designmark.jp/consult/?utm_source=github&utm_medium=readme&utm_campaign=tools)からどうぞ。

Issue とプルリクエストを受け付けています（[CONTRIBUTING.md](CONTRIBUTING.md)）。セキュリティの問題は [SECURITY.md](SECURITY.md) の方法で非公開でお知らせください。変更の履歴は [CHANGELOG.md](CHANGELOG.md) にあります。

## ライセンス

このリポジトリのコードは [MIT License](LICENSE)（© 2026 XECIN Inc.）です。designmark.jp の設計書の利用は designmark の利用規約に従います。型パックは CC BY 4.0 です。
