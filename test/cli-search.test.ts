// `designmark search` end to end: a child process against the fixture server.

import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { userAgent } from "../src/version.js";
import { removeDir, runCli, tempDir, testEnv } from "./helpers/cli.js";
import { bigIndex, LP_ITEMS } from "./helpers/fixtures.js";
import { type FixtureServer, startServer } from "./helpers/server.js";

let server: FixtureServer;
let cache: string;

const env = (extra: Record<string, string | undefined> = {}) => testEnv(server.url, cache, extra);
const search = (args: readonly string[], extra: Record<string, string | undefined> = {}) =>
  runCli(["search", ...args], { env: env(extra) });

before(async () => {
  server = await startServer();
});

after(async () => {
  await server.close();
});

beforeEach(() => {
  cache = tempDir();
  server.requests.length = 0;
  Object.assign(server.state, {
    items: [...LP_ITEMS],
    schemaVersion: 1,
    indexStatus: undefined,
    failNext: 0,
  });
});

afterEach(() => {
  removeDir(cache);
});

test("T-03: `search 化粧品 --mood elegant` answers within 1 second from the cache", async (t) => {
  server.state.items = bigIndex(4200);
  const prime = await search(["化粧品", "--mood", "elegant"]);
  assert.equal(prime.code, 0, prime.stderr);
  server.requests.length = 0;

  const timed = await search(["化粧品", "--mood", "elegant"]);
  assert.equal(timed.code, 0, timed.stderr);
  assert.equal(server.requests.length, 0, "answered from the cache");
  t.diagnostic(`4,200-item index, cached: process ran ${Math.round(timed.ms)} ms`);
  assert.ok(timed.ms < 1000, `took ${Math.round(timed.ms)} ms`);
  assert.match(timed.stdout, /^Pattern packs \(CC BY 4\.0\)$/m);
  assert.match(timed.stdout, /^LP designs$/m);
  assert.match(timed.stdout, /^10 shown \/ \d+ matches\./m);
});

test("text output in Japanese (spec §3.3)", async () => {
  const result = await search(["化粧品", "--mood", "上品"], { DESIGNMARK_LANG: "ja" });
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.stdout.trimEnd().split("\n"), [
    "型パック（CC BY 4.0）",
    "  pk-cosmetics-elegant  化粧品の上品・高級な LP の型（60 件から合成）",
    "LP 単位",
    "  xd-0000000a  生成りと金の上品な化粧水LP  化粧品・スキンケア  SP・PC  #F7F3EC #FFFFFF #B89A7A",
    "  xd-0000000c  黒と金のラグジュアリー美容液LP  化粧品・スキンケア  PC  #F7F3EC #FFFFFF #B89A7A",
    "  xd-0000000f  ＬＰ全角テスト用の上品な美容LP  化粧品・スキンケア  SP  #F7F3EC #FFFFFF #B89A7A",
    "4 件 / 該当 4 件。npx designmark add <ID> でプロジェクトに置けます。",
  ]);
});

test("--json: {packs, items, total} with the index entries as they are", async () => {
  const result = await search(["--json", "--limit", "5"]);
  assert.equal(result.code, 0, result.stderr);
  const data = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(data), ["packs", "items", "total"]);
  assert.equal(data.packs.length, 3);
  assert.equal(data.items.length, 2);
  assert.equal(data.total, 10);
  assert.deepEqual(data.items[0], LP_ITEMS[0]);
});

test("the request identifies the tool (User-Agent)", async () => {
  assert.equal((await search(["--lp-only"])).code, 0);
  assert.equal(server.requests[0]?.userAgent, userAgent("cli"));
  assert.match(
    userAgent("cli"),
    /^designmark-cli\/\d+\.\d+\.\d+ \(\+https:\/\/github\.com\/xecin-inc\/designmark\)$/,
  );
});

test("usage errors exit with 2 before any request", async () => {
  const cases = [
    ["--limit", "0"],
    ["--limit", "51"],
    ["--limit", "2.5"],
    ["--view", "tablet"],
    ["--packs-only", "--lp-only"],
    ["--color", "水色"],
    ["--frobnicate"],
    ["--category"],
  ];
  for (const args of cases) {
    const result = await search(args);
    assert.equal(result.code, 2, `${args.join(" ")}: ${result.stderr}`);
  }
  assert.equal(server.requests.length, 0);
});

test("an unknown industry or mood exits with 2 and lists the accepted values", async () => {
  const category = await search(["--category", "unknown"]);
  assert.equal(category.code, 2);
  assert.match(category.stderr, /cosmetics \(化粧品・スキンケア\)/);
  const mood = await search(["--mood", "unknown"]);
  assert.equal(mood.code, 2);
  assert.match(mood.stderr, /dark-luxury/);
});

test("designmark.jp unreachable: the expired cache is used with a note (spec §3.8)", async () => {
  assert.equal((await search([])).code, 0);
  const metaPath = join(cache, "meta.json");
  const meta = JSON.parse(readFileSync(metaPath, "utf8")) as Record<string, { fetched_at: string }>;
  for (const entry of Object.values(meta)) entry.fetched_at = "2026-01-01T00:00:00+09:00";
  writeFileSync(metaPath, JSON.stringify(meta));
  server.state.indexStatus = 503;

  const result = await search(["化粧品"]);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stderr, /may be out of date \(index fetched at 2026-01-01T00:00:00\+09:00\)/);
  assert.match(result.stdout, /xd-0000000a/);
});

test("no cache and no index: 404 (possibly blocked) → 4, 5xx → 1", async () => {
  server.state.indexStatus = 404;
  const blocked = await search([]);
  assert.equal(blocked.code, 4);
  assert.match(blocked.stderr, /Wait about 5 minutes/);
  server.state.indexStatus = 503;
  const outage = await search([]);
  assert.equal(outage.code, 1);
  assert.match(outage.stderr, /HTTP 503/);
});

test("a newer schema_version warns once and keeps working", async () => {
  server.state.schemaVersion = 2;
  const result = await search([]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr.split("schema_version 2").length - 1, 1);
  assert.match(result.stdout, /xd-0000000a/);
});
