// Index cache (spec §3.8) and the request rules (spec §3.7), in-process against the fixture server.

import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { DesignmarkApi, INDEX_TTL_MS } from "../src/api.js";
import { cacheDir, IndexCache } from "../src/cache.js";
import { HttpClient } from "../src/http.js";
import { userAgent } from "../src/version.js";
import { removeDir, tempDir } from "./helpers/cli.js";
import { LP_ITEMS } from "./helpers/fixtures.js";
import { type FixtureServer, startServer } from "./helpers/server.js";

let server: FixtureServer;
let dir: string;
let now: number;
let warnings: number[];

function api(): DesignmarkApi {
  const http = new HttpClient({
    baseUrl: server.url,
    client: "cli",
    minIntervalMs: 0,
    retryDelayMs: 0,
  });
  return new DesignmarkApi({
    http,
    cache: new IndexCache(dir),
    now: () => now,
    onNewerSchema: (version) => warnings.push(version),
  });
}

const meta = () => JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));

before(async () => {
  server = await startServer();
});

after(async () => {
  await server.close();
});

beforeEach(() => {
  dir = tempDir();
  now = Date.parse("2026-10-24T12:00:00+09:00");
  warnings = [];
  server.requests.length = 0;
  Object.assign(server.state, {
    items: [...LP_ITEMS],
    schemaVersion: 1,
    indexStatus: undefined,
    failNext: 0,
  });
  server.state.withdrawn.clear();
  server.state.blockedBodies.clear();
});

afterEach(() => {
  removeDir(dir);
});

test("cache folder: DESIGNMARK_CACHE_DIR, then LOCALAPPDATA (Windows), XDG_CACHE_HOME, ~/.cache", () => {
  assert.equal(cacheDir({ DESIGNMARK_CACHE_DIR: "/x" }, "win32", "/home/u"), "/x");
  assert.equal(
    cacheDir({ LOCALAPPDATA: "C:\\Users\\u\\AppData\\Local" }, "win32", "C:\\Users\\u"),
    join("C:\\Users\\u\\AppData\\Local", "designmark"),
  );
  assert.equal(
    cacheDir({ XDG_CACHE_HOME: "/xdg" }, "linux", "/home/u"),
    join("/xdg", "designmark"),
  );
  assert.equal(cacheDir({}, "darwin", "/Users/u"), join("/Users/u", ".cache", "designmark"));
});

test("the index is cached for 6 hours, then revalidated with If-None-Match (304)", async () => {
  const client = api();
  const first = await client.index();
  assert.equal(first.data.items.length, LP_ITEMS.length);
  assert.ok(existsSync(join(dir, "index.json")));
  const saved = meta().index;
  assert.match(saved.etag, /^"[0-9a-f]+"$/);
  assert.equal(saved.schema_version, 1);
  assert.equal(saved.fetched_at, "2026-10-24T12:00:00+09:00");
  assert.equal(server.requests.length, 1);
  assert.equal(server.requests[0]?.userAgent, userAgent("cli"));

  now += INDEX_TTL_MS - 1000;
  await client.index();
  assert.equal(server.requests.length, 1, "fresh cache: no request");

  now += 2000;
  const revalidated = await client.index();
  assert.equal(server.requests.length, 2);
  assert.equal(server.requests[1]?.ifNoneMatch, saved.etag);
  assert.equal(server.requests[1]?.status, 304);
  assert.equal(revalidated.stale, false);
  assert.equal(meta().index.fetched_at, "2026-10-24T18:00:01+09:00", "304 only updates fetched_at");
  assert.equal(meta().index.etag, saved.etag);
});

test("a changed index replaces the cache", async () => {
  await api().index();
  const oldEtag = meta().index.etag;
  server.state.withdrawn.add("xd-0000000a");
  const result = await api().index("revalidate");
  assert.equal(server.requests[1]?.ifNoneMatch, oldEtag);
  assert.equal(server.requests[1]?.status, 200);
  assert.equal(result.data.items.length, LP_ITEMS.length - 1);
  assert.notEqual(meta().index.etag, oldEtag);
});

test("when designmark.jp cannot be reached, the expired cache is used and marked stale", async () => {
  await api().index();
  now += INDEX_TTL_MS + 1000;
  server.state.indexStatus = 503;
  const result = await api().index();
  assert.equal(result.stale, true);
  assert.equal(result.fetchedAt, "2026-10-24T12:00:00+09:00");
  assert.equal(result.data.items.length, LP_ITEMS.length);
  // One retry after a failure (spec §3.7).
  assert.deepEqual(
    server.requests.map((r) => r.status),
    [200, 503, 503],
  );
  await assert.rejects(api().index("revalidate"), /HTTP 503/);
});

test("a broken cache is deleted and fetched again", async () => {
  await api().index();
  writeFileSync(join(dir, "index.json"), "{ broken");
  const result = await api().index();
  assert.equal(result.data.items.length, LP_ITEMS.length);
  assert.equal(server.requests.length, 2);
  assert.equal(server.requests[1]?.ifNoneMatch, undefined, "the broken entry is not revalidated");
  writeFileSync(join(dir, "meta.json"), "not json");
  await api().index();
  assert.equal(server.requests.length, 3);
});

test("a 404 is not retried; a 5xx is retried once", async () => {
  server.state.indexStatus = 404;
  await assert.rejects(api().index(), /HTTP 404/);
  assert.equal(server.requests.length, 1);
  server.state.indexStatus = undefined;
  server.state.failNext = 1;
  const result = await api().index();
  assert.equal(result.data.items.length, LP_ITEMS.length);
  assert.deepEqual(
    server.requests.slice(1).map((r) => r.status),
    [503, 200],
  );
});

test("a newer schema_version warns and keeps working (spec §2.4)", async () => {
  server.state.schemaVersion = 2;
  const result = await api().index();
  assert.equal(result.data.items.length, LP_ITEMS.length);
  assert.deepEqual(warnings, [2]);
});

test("DESIGN.md: 404 + listed = blocked, 404 + not listed = withdrawn (spec §3.5)", async () => {
  const client = api();
  server.state.blockedBodies.add("xd-0000000b");
  const blocked = await client.design({ kind: "lp", id: "xd-0000000b" });
  assert.equal(blocked.ok, false);
  assert.equal(!blocked.ok && blocked.reason, "blocked");
  server.state.blockedBodies.clear();

  server.state.withdrawn.add("xd-0000000c");
  const withdrawn = await client.design({ kind: "lp", id: "xd-0000000c" });
  assert.equal(!withdrawn.ok && withdrawn.reason, "withdrawn");
  const unknownPack = await client.design({ kind: "pack", id: "pk-unknown" });
  assert.equal(!unknownPack.ok && unknownPack.reason, "withdrawn");

  server.state.indexStatus = 404;
  const noIndex = await client.design({ kind: "lp", id: "xd-0000000c" });
  assert.equal(!noIndex.ok && noIndex.reason, "blocked");
  assert.equal(existsSync(join(dir, "DESIGN.md")), false, "bodies are never cached");
});
