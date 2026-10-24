# Changelog

All notable changes to this project are documented in this file. The project follows [Semantic Versioning](https://semver.org/).

## 1.0.0 — unreleased

First public release.

- CLI: `search`, `show`, `add`, `packs`, `open` and `mcp` for the DESIGN.md files on [designmark.jp](https://designmark.jp/)
  and the CC BY 4.0 pattern packs. `add --claude-md` adds `@DESIGN.md` to `CLAUDE.md`.
- MCP server (`designmark mcp`): `search_designs`, `get_design`, `list_packs`, `get_pack` (stdio).
- Claude Code plugin with a skill and the MCP server (`/plugin marketplace add xecin-inc/designmark`).
- Fetch limits that follow the designmark.jp terms of use: at most 3 designs per `add`, at least 1 second apart;
  30 designs per 10 minutes in the MCP server.
- Japanese and English messages. No telemetry. Node.js 20 or later.
