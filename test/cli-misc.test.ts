// `show`, `packs`, `open`, help, version and argument errors, end to end.

import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { openerCommand } from "../src/commands/open.js";
import { messages } from "../src/i18n.js";
import { VERSION } from "../src/version.js";
import { removeDir, runCli, tempDir, testEnv } from "./helpers/cli.js";
import { type FixtureServer, startServer } from "./helpers/server.js";

let server: FixtureServer;
let cache: string;

const env = (extra: Record<string, string | undefined> = {}) => testEnv(server.url, cache, extra);
const cli = (args: readonly string[], extra: Record<string, string | undefined> = {}) =>
  runCli(args, { env: env(extra) });
const lines = (text: string) => text.trimEnd().split("\n");

before(async () => {
  server = await startServer();
});

after(async () => {
  await server.close();
});

beforeEach(() => {
  cache = tempDir();
  server.requests.length = 0;
  server.state.withdrawn.clear();
  server.state.blockedBodies.clear();
});

afterEach(() => {
  removeDir(cache);
});

test("show: title, style, industry, moods, colors (role and HEX), page and the add command", async () => {
  const result = await cli(["show", "xd-0000000a"]);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(lines(result.stdout), [
    "Ivory Gold Lotion LP (xd-0000000a)",
    "Title (ja): 生成りと金の上品な化粧水LP",
    "Industry: cosmetics (化粧品・スキンケア)",
    "Moods: elegant, soft",
    "Views: SP/PC",
    "Published: 2026-10-20",
    "Colors (from the DESIGN.md YAML):",
    "  primary     #B89A7A  ブランドの地",
    "  background  #F7F3EC  メインの背景",
    "  text        #2B2B2B  本文",
    "  cta         #C9A86A  購入ボタン",
    `Page: ${server.url}/d/xd-0000000a/`,
    "Add: npx designmark add xd-0000000a",
    messages("en").notice,
  ]);
});

test("show a pattern pack in Japanese", async () => {
  const result = await cli(["show", "pk-cosmetics-elegant"], { DESIGNMARK_LANG: "ja" });
  assert.equal(result.code, 0, result.stderr);
  const output = lines(result.stdout);
  assert.equal(output[0], "化粧品の上品・高級な LP の型（pk-cosmetics-elegant）");
  assert.ok(output.includes("合成元: 60 件の設計書"));
  assert.ok(output.includes("版: 2026.11（2026-11-01 更新）"));
  assert.ok(output.some((line) => line.startsWith("ライセンス: CC BY 4.0")));
  assert.ok(output.includes("導入: npx designmark add pk-cosmetics-elegant"));
});

test("show --raw writes the DESIGN.md unchanged to stdout (the notice goes to stderr)", async () => {
  const result = await cli(["show", "xd-0000000a", "--raw"]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, server.designBytes("xd-0000000a").toString("utf8"));
  assert.equal(result.stderr.trim(), messages("en").notice);
});

test("show --json", async () => {
  const result = await cli(["show", "xd-0000000a", "--json"]);
  assert.equal(result.code, 0, result.stderr);
  const data = JSON.parse(result.stdout);
  assert.equal(data.id, "xd-0000000a");
  assert.equal(data.kind, "lp");
  assert.equal(data.item.style, "Ivory Gold Lotion LP");
  assert.deepEqual(data.colors[0], { token: "primary", hex: "#B89A7A", role: "ブランドの地" });
  assert.equal(data.design_md, `${server.url}/d/xd-0000000a/DESIGN.md`);
});

test("show: withdrawn → 3, blocked → 4, no or bad ID → 2", async () => {
  server.state.withdrawn.add("xd-0000000c");
  assert.equal((await cli(["show", "xd-0000000c"])).code, 3);
  server.state.blockedBodies.add("xd-0000000b");
  assert.equal((await cli(["show", "xd-0000000b"])).code, 4);
  assert.equal((await cli(["show"])).code, 2);
  assert.equal((await cli(["show", "xd-0000000a", "xd-0000000b"])).code, 2);
  assert.equal((await cli(["show", "https://example.com/d/xd-0000000a/"])).code, 2);
});

test("packs: grouped by industry in the site's order (categories.json)", async () => {
  const result = await cli(["packs"], { DESIGNMARK_LANG: "ja" });
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(lines(result.stdout), [
    "型パック（CC BY 4.0）",
    "化粧品・スキンケア",
    "  pk-cosmetics-elegant  化粧品の上品・高級な LP の型  上品・高級  60 件から合成",
    "  pk-cosmetics-cute     化粧品のかわいい LP の型  かわいい  41 件から合成",
    "健康食品・サプリ",
    "  pk-health-natural     健康食品のナチュラルな LP の型  ナチュラル  25 件から合成",
    "医療・クリニック",
    "  pk-medical-trust      医療の信頼・誠実な LP の型  信頼・誠実  33 件から合成",
    "4 件。npx designmark add <ID> でプロジェクトに置けます。",
  ]);
});

test("packs --category and --json", async () => {
  const medical = await cli(["packs", "--category", "medical"]);
  assert.equal(medical.code, 0, medical.stderr);
  assert.match(medical.stdout, /pk-medical-trust/);
  assert.doesNotMatch(medical.stdout, /pk-cosmetics/);
  const json = JSON.parse((await cli(["packs", "--json"])).stdout);
  assert.equal(json.license, "CC-BY-4.0");
  assert.deepEqual(
    json.packs.map((pack: { id: string }) => pack.id),
    ["pk-cosmetics-elegant", "pk-cosmetics-cute", "pk-health-natural", "pk-medical-trust"],
  );
  assert.equal((await cli(["packs", "--category", "unknown"])).code, 2);
});

test("open: BROWSER=none prints the page URL without any request", async () => {
  const result = await cli(["open", "pk-cosmetics-elegant"]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout.trim(), `${server.url}/packs/pk-cosmetics-elegant/`);
  assert.equal(server.requests.length, 0);
});

test("open: the system opener per platform (spec §3.6)", () => {
  const url = "https://designmark.jp/d/xd-12ab34cd/";
  assert.deepEqual(openerCommand(url, "darwin"), { command: "open", args: [url] });
  assert.deepEqual(openerCommand(url, "linux"), { command: "xdg-open", args: [url] });
  assert.deepEqual(openerCommand(url, "win32"), {
    command: "cmd.exe",
    args: ["/d", "/s", "/c", `"start "" "${url}""`],
  });
});

test("--version, --help, and usage errors (exit code 2)", async () => {
  const version = await runCli(["--version"]);
  assert.equal(version.code, 0);
  assert.equal(version.stdout.trim(), VERSION);

  const help = await runCli(["--help"]);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /Usage: npx designmark <command>/);
  const addHelp = await runCli(["add", "--help", "--lang", "ja"]);
  assert.equal(addHelp.code, 0);
  assert.match(addHelp.stdout, /使い方: npx designmark add/);

  const none = await runCli([]);
  assert.equal(none.code, 2);
  assert.match(none.stderr, /Usage: npx designmark/);
  const unknown = await runCli(["frobnicate"]);
  assert.equal(unknown.code, 2);
  assert.match(unknown.stderr, /Unknown command: frobnicate/);
  assert.equal((await runCli(["search", "--lang", "fr"])).code, 2);
  assert.equal((await runCli(["search"], { env: { DESIGNMARK_API: "not a url" } })).code, 2);
  assert.equal((await runCli(["mcp", "extra"])).code, 2);
});
