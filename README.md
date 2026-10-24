# designmark

**Japanese landing-page design systems (DESIGN.md) for AI coding agents — search [designmark.jp](https://designmark.jp/?utm_source=github&utm_medium=readme&utm_campaign=tools) and drop one into your project from the terminal, any MCP client, or Claude Code.**

[日本語](README_ja.md) · [designmark.jp](https://designmark.jp/?utm_source=github&utm_medium=readme&utm_campaign=tools) · [Pattern packs on GitHub](https://github.com/xecin-inc/awesome-japanese-lp-design-md?utm_source=github&utm_medium=readme&utm_campaign=tools)

designmark.jp publishes DESIGN.md files analysed from more than 4,000 public Japanese landing pages — colors, typography, spacing, components and section structure — plus CC BY 4.0 **pattern packs** synthesised per industry and mood. Hand one to Claude Code, Cursor or another AI coding tool and it builds pages in that look.

```bash
npx designmark search 化粧品 --mood elegant
npx designmark add <ID> --claude-md
```

`add` saves `DESIGN.md` in the current folder; `--claude-md` also adds the line `@DESIGN.md` to `CLAUDE.md` so that Claude Code reads it. Requires Node.js 20 or later.

## CLI

| Command | What it does |
| --- | --- |
| `search [words...]` | Search LP designs and pattern packs. Every word must match. |
| `show <ID>` | Title, style, industry, moods, colors (role and HEX) and page URL. `--raw` prints the whole DESIGN.md. |
| `add <ID...>` | Save up to 3 designs: `DESIGN.md` for one, `design/<ID>.md` for two or three. |
| `packs` | List the pattern packs by industry. |
| `open <ID>` | Open the design's page on designmark.jp. |
| `mcp` | Start the MCP server (stdio). |

IDs are `xd-xxxxxxxx` (LP design), `pk-…` (pattern pack) or a designmark.jp URL. Every command accepts `--json`, `--lang ja|en` and `--help`. Output is plain text (no colors).

| `search` option | |
| --- | --- |
| `--category <name\|slug>` | Industry, e.g. `cosmetics` or `化粧品` |
| `--mood <name\|slug>` | Mood, repeatable (all must match): `natural` `soft` `elegant` `minimal` `pop` `retro` `cute` `sporty` `cool` `dark-luxury` `trust` `handmade` `wafu` `fresh` `bold` `dense` |
| `--color <family>` | Main color: `red` `orange` `yellow` `green` `teal` `blue` `purple` `pink` `brown` `black` `gray` `white`, or a Japanese name such as `青` (LP designs only) |
| `--view sp\|pc` | Analysed view (LP designs only) |
| `--packs-only` / `--lp-only` | Only pattern packs / only LP designs |
| `--limit <1-50>` | Number of results (default 10; up to 3 pattern packs come first) |

| `add` option | |
| --- | --- |
| `--dir <folder>` | Project folder (default: the current folder) |
| `--out <file>` | File to write, for a single ID (default `DESIGN.md`) |
| `--force` | Overwrite existing files (never overwritten otherwise) |
| `--claude-md` | Add `@<written file>` to `CLAUDE.md` (only once, however often you run it) |

```bash
npx designmark search クリニック --view sp --limit 5
npx designmark search --category cosmetics --mood elegant --mood soft --json
npx designmark packs --category cosmetics
npx designmark show pk-cosmetics-elegant
npx designmark add pk-cosmetics-elegant --claude-md
npx designmark add <ID> --out docs/DESIGN.md
```

To save a design to a file, use `add` (with `--out` for another path) rather than redirecting `show --raw`: `add` writes the bytes unchanged, while Windows PowerShell 5.1 re-encodes redirected output.

| Exit code | Meaning |
| --- | --- |
| 0 | Success |
| 1 | Failure (a file could not be written, or an unexpected network error) |
| 2 | Usage error (unknown option, invalid ID, more than 3 IDs, …) |
| 3 | Not found: the design is not in the latest index (withdrawn, or a wrong ID) |
| 4 | Temporarily unavailable (access may be limited): wait about 5 minutes |

| Environment variable | |
| --- | --- |
| `DESIGNMARK_LANG` | `ja` or `en` (`--lang` takes precedence). Without either: `LC_ALL` / `LC_MESSAGES` / `LANG`, then the system locale |
| `DESIGNMARK_CACHE_DIR` | Index cache folder. Default: `%LOCALAPPDATA%\designmark` on Windows, otherwise `$XDG_CACHE_HOME/designmark` or `~/.cache/designmark` |
| `DESIGNMARK_API` | Base URL of the API (default `https://designmark.jp`; for testing) |
| `BROWSER=none` | `open` prints the URL instead of opening a browser |

## MCP server

Claude Code:

```bash
claude mcp add designmark -- npx -y designmark@1 mcp
```

Cursor (`.cursor/mcp.json`):

```json
{ "mcpServers": { "designmark": { "command": "npx", "args": ["-y", "designmark@1", "mcp"] } } }
```

`designmark@1` keeps you on major version 1. If your MCP client cannot start `npx` on native Windows, use `cmd` with the arguments `/c npx -y designmark@1 mcp`.

| Tool | Input | Returns |
| --- | --- | --- |
| `search_designs` | `query`, `category`, `moods`, `color`, `view`, `include_packs` (default true), `limit` (1–20, default 10) | One line per design: ID, title, industry, moods, main colors, page URL |
| `get_design` | `id` (`xd-…` or URL) | A usage notice, a blank line, then the full DESIGN.md |
| `list_packs` | `category` | One line per pattern pack: ID, title, number of source designs |
| `get_pack` | `id` (`pk-…` or URL) | The license and an attribution example, a blank line, then the full DESIGN.md |

The server never writes files; your agent saves the DESIGN.md. Messages follow `DESIGNMARK_LANG` (or the system locale).

## Claude Code plugin

```text
/plugin marketplace add xecin-inc/designmark
/plugin install designmark@designmark
```

The plugin bundles the **designmark skill** — ask Claude Code for a Japanese-style landing page and it picks an industry and mood, shows you up to 3 candidates, adds the one you choose and builds with its tokens — and the **MCP server** above.

## Rate limits — and why

designmark's [terms of use](https://designmark.jp/terms/?utm_source=github&utm_medium=readme&utm_campaign=tools) (Article 2, paragraph 3) prohibit automated bulk fetching. This tool is built to stay well inside that:

- `add` fetches **at most 3 designs per run**, one at a time, **at least 1 second apart**. There is no bulk-download command.
- The MCP server fetches **at most 30 designs per 10 minutes** per process, at least 1 second apart, and stops fetching for 5 minutes after designmark.jp refuses a request.
- Search reads one index file, cached for 6 hours and then revalidated with ETag. DESIGN.md files are never cached, so a withdrawn design disappears quickly.
- A withdrawn design ends with exit code 3. Exit code 4 means designmark.jp may be limiting your access: wait about 5 minutes, and do not retry other IDs in a loop.

Please keep these limits if you fork the tool, and do not mirror designmark.jp or redistribute its LP designs as a dataset. Clients without the limits may be blocked.

## About the data

- LP designs (`xd-…`) are **unofficial analyses** of public Japanese landing pages; designmark is not affiliated with the companies behind them. **Never reuse the logos, photos, copy or product names of the original pages** — use your own materials.
- Pattern packs (`pk-…`) are synthesised from many designs and describe no single page. They are licensed **CC BY 4.0**; attribution example: "designmark (XECIN Inc.)". Browse them on [designmark.jp](https://designmark.jp/packs/?utm_source=github&utm_medium=readme&utm_campaign=tools) or in the [pattern pack collection](https://github.com/xecin-inc/awesome-japanese-lp-design-md?utm_source=github&utm_medium=readme&utm_campaign=tools).
- Rights holders of an original page can request removal through the [takedown form](https://designmark.jp/takedown/?utm_source=github&utm_medium=readme&utm_campaign=tools).

## Privacy

No telemetry. The tool talks only to `https://designmark.jp`, with a `designmark-cli/<version>` or `designmark-mcp/<version>` User-Agent. As with any website, designmark.jp may log the IP addresses of requests.

## Development

```bash
npm ci
npm run lint
npm run typecheck
npm test     # a local fixture server stands in for designmark.jp
npm run build
```

Releases are published to npm by GitHub Actions when a `v*` tag is pushed (trusted publishing with provenance).

designmark is made by XECIN Inc. For help building landing pages with AI or a DESIGN.md of your own, see [consultation](https://designmark.jp/consult/?utm_source=github&utm_medium=readme&utm_campaign=tools).

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Please report security problems privately as described in [SECURITY.md](SECURITY.md). Changes are listed in [CHANGELOG.md](CHANGELOG.md).

## License

The code in this repository is licensed under the [MIT License](LICENSE) © 2026 XECIN Inc. The designs on designmark.jp are governed by designmark's terms of use; pattern packs are CC BY 4.0.
