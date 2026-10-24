// `designmark add` end to end (spec §3.5): acceptance tests T-02, T-02b, T-04 and T-05.

import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { messages } from "../src/i18n.js";
import { removeDir, runCli, tempDir, testEnv } from "./helpers/cli.js";
import { LP_ITEMS } from "./helpers/fixtures.js";
import { type FixtureServer, startServer } from "./helpers/server.js";

let server: FixtureServer;
let cache: string;
let project: string;

const env = (extra: Record<string, string | undefined> = {}) => testEnv(server.url, cache, extra);
const add = (args: readonly string[], extra: Record<string, string | undefined> = {}) =>
  runCli(["add", ...args], { env: env(extra), cwd: project });
const read = (...parts: string[]) => readFileSync(join(project, ...parts));
const paths = () => server.requests.map((request) => `${request.path} ${request.status}`);

before(async () => {
  server = await startServer();
});

after(async () => {
  await server.close();
});

beforeEach(() => {
  cache = tempDir();
  project = tempDir();
  server.requests.length = 0;
  Object.assign(server.state, {
    items: [...LP_ITEMS],
    indexStatus: undefined,
    bodyStatus: undefined,
    failNext: 0,
  });
  server.state.withdrawn.clear();
  server.state.blockedBodies.clear();
});

afterEach(() => {
  removeDir(cache);
  removeDir(project);
});

test("T-05: four IDs is a usage error (exit 2) and nothing is fetched", async () => {
  const result = await add(["xd-0000000a", "xd-0000000b", "xd-0000000c", "xd-0000000d"]);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /at most 3 designs at a time/);
  assert.equal(server.requests.length, 0);
});

test("T-05: three designs are fetched one by one, at least 1 second apart", async (t) => {
  const ids = ["xd-0000000a", "xd-0000000b", "pk-cosmetics-elegant"];
  // Default spacing: no DESIGNMARK_TEST_INTERVAL_MS.
  const result = await add(ids, { DESIGNMARK_TEST_INTERVAL_MS: undefined });
  assert.equal(result.code, 0, result.stderr);
  const bodies = server.bodyRequests();
  assert.deepEqual(
    bodies.map((request) => request.path),
    [
      "/d/xd-0000000a/DESIGN.md",
      "/d/xd-0000000b/DESIGN.md",
      "/packs/pk-cosmetics-elegant/DESIGN.md",
    ],
  );
  const gaps = bodies.slice(1).map((request, i) => request.at - (bodies[i]?.at ?? 0));
  t.diagnostic(`gaps between arrivals: ${gaps.map((gap) => `${gap.toFixed(1)} ms`).join(", ")}`);
  for (const gap of gaps) assert.ok(gap >= 1000, `gap ${gap.toFixed(1)} ms`);
  assert.equal(server.requests.length, 3, "no index request is needed");
  for (const id of ids) assert.deepEqual(read("design", `${id}.md`), server.designBytes(id));
});

test("T-04: CLAUDE.md gets one line even after two runs; DESIGN.md is not overwritten without --force", async () => {
  const first = await add(["xd-0000000a", "--claude-md"]);
  assert.equal(first.code, 0, first.stderr);
  assert.deepEqual(read("DESIGN.md"), server.designBytes("xd-0000000a"));
  assert.equal(read("CLAUDE.md").toString(), "@DESIGN.md\n");
  assert.match(first.stdout, /Created CLAUDE\.md with @DESIGN\.md/);

  const second = await add(["xd-0000000a", "--claude-md", "--force"]);
  assert.equal(second.code, 0, second.stderr);
  assert.equal(read("CLAUDE.md").toString(), "@DESIGN.md\n");
  assert.match(second.stdout, /CLAUDE\.md already has @DESIGN\.md/);

  writeFileSync(join(project, "DESIGN.md"), "my own edits");
  server.requests.length = 0;
  const third = await add(["xd-0000000b", "--claude-md"]);
  assert.equal(third.code, 1);
  assert.match(third.stderr, /DESIGN\.md already exists\. Use --force/);
  assert.equal(read("DESIGN.md").toString(), "my own edits");
  assert.equal(server.requests.length, 0, "nothing is fetched when the file exists");
});

test("CLAUDE.md: the line goes after the existing text, keeping CRLF", async () => {
  writeFileSync(join(project, "CLAUDE.md"), "# Project\r\nRules");
  const result = await add(["xd-0000000a", "--claude-md"]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(read("CLAUDE.md").toString(), "# Project\r\nRules\r\n@DESIGN.md\r\n");
  assert.match(result.stdout, /Added @DESIGN\.md to CLAUDE\.md/);
});

test("without --claude-md: a hint only; the notice once at the end", async () => {
  const result = await add(["xd-0000000a", "xd-0000000b"]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(existsSync(join(project, "CLAUDE.md")), false);
  assert.match(result.stdout, /add the line "@design\/xd-0000000a\.md" to CLAUDE\.md/);
  const notice = messages("en").notice;
  assert.equal(result.stdout.split(notice).length - 1, 1);
  assert.ok(result.stdout.trimEnd().endsWith(notice));
});

test("Japanese messages", async () => {
  const result = await add(["xd-0000000a"], { DESIGNMARK_LANG: "ja" });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /DESIGN\.md に保存しました（xd-0000000a）/);
  assert.ok(result.stdout.includes(messages("ja").notice));
});

test("T-02: a withdrawn design ends with exit code 3, even if the cached index still lists it", async () => {
  assert.equal((await runCli(["search"], { env: env() })).code, 0, "cache the index first");
  server.state.withdrawn.add("xd-0000000c");
  server.requests.length = 0;

  const result = await add(["xd-0000000c"]);
  assert.equal(result.code, 3);
  assert.match(result.stderr, /Not found: xd-0000000c \(withdrawn, or a wrong ID\)/);
  assert.deepEqual(paths(), ["/d/xd-0000000c/DESIGN.md 404", "/api/v1/index.json 200"]);
  assert.ok(server.requests[1]?.ifNoneMatch, "the index is revalidated, not taken from the cache");
  assert.equal(existsSync(join(project, "DESIGN.md")), false);

  const list = await runCli(["search", "--json", "--lp-only", "--limit", "50"], { env: env() });
  const ids = (JSON.parse(list.stdout).items as { id: string }[]).map((item) => item.id);
  assert.ok(!ids.includes("xd-0000000c"), "the refreshed cache no longer lists it");
});

test("T-02: the other IDs are still added, and the exit code is 3", async () => {
  server.state.withdrawn.add("xd-0000000c");
  const result = await add(["xd-0000000c", "xd-0000000d"]);
  assert.equal(result.code, 3);
  assert.ok(existsSync(join(project, "design", "xd-0000000d.md")));
  assert.equal(existsSync(join(project, "design", "xd-0000000c.md")), false);
});

test("T-02b: DESIGN.md 404 while listed in the index: stop the rest, exit code 4", async () => {
  server.state.blockedBodies.add("xd-0000000b");
  const result = await add(["xd-0000000b", "xd-0000000c", "xd-0000000d"]);
  assert.equal(result.code, 4);
  assert.match(result.stderr, /Temporarily unavailable/);
  assert.match(result.stderr, /Stopped without fetching: xd-0000000c, xd-0000000d/);
  assert.deepEqual(paths(), ["/d/xd-0000000b/DESIGN.md 404", "/api/v1/index.json 200"]);
});

test("T-02b: when the index is 404 as well, exit code 4", async () => {
  server.state.blockedBodies.add("xd-0000000b");
  server.state.indexStatus = 404;
  const result = await add(["xd-0000000b", "xd-0000000c"]);
  assert.equal(result.code, 4);
  assert.deepEqual(paths(), ["/d/xd-0000000b/DESIGN.md 404", "/api/v1/index.json 404"]);
});

test("DESIGN.md 404 and the index failing with 5xx: exit code 4", async () => {
  server.state.withdrawn.add("xd-0000000b");
  server.state.indexStatus = 503;
  assert.equal((await add(["xd-0000000b"])).code, 4);
});

test("a 5xx DESIGN.md is retried once, then exit code 1 and the rest is skipped", async () => {
  server.state.bodyStatus = 503;
  const result = await add(["xd-0000000a", "xd-0000000b"]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /HTTP 503/);
  assert.deepEqual(paths(), ["/d/xd-0000000a/DESIGN.md 503", "/d/xd-0000000a/DESIGN.md 503"]);
});

test("--out, --dir and a pattern pack", async () => {
  const out = await add(["pk-cosmetics-elegant", "--out", "docs/design.md"]);
  assert.equal(out.code, 0, out.stderr);
  assert.deepEqual(read("docs", "design.md"), server.designBytes("pk-cosmetics-elegant"));
  assert.ok(out.stdout.includes(messages("en").packLicense));
  assert.ok(!out.stdout.includes(messages("en").notice), "the LP notice is for LP designs");

  mkdirSync(join(project, "site"));
  const dir = await add(["xd-0000000a", "--dir", "site", "--claude-md"]);
  assert.equal(dir.code, 0, dir.stderr);
  assert.deepEqual(read("site", "DESIGN.md"), server.designBytes("xd-0000000a"));
  assert.equal(read("site", "CLAUDE.md").toString(), "@DESIGN.md\n");
});

test("designmark URLs work as IDs", async () => {
  const result = await add(["https://designmark.jp/d/xd-0000000e/"]);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(paths(), ["/d/xd-0000000e/DESIGN.md 200"]);
});

test("invalid input: exit 2 (usage) or 1 (missing folder) before any request", async () => {
  assert.equal((await add([])).code, 2);
  assert.equal((await add(["not-an-id"])).code, 2);
  assert.equal((await add(["xd-0000000a", "xd-0000000b", "--out", "x.md"])).code, 2);
  assert.equal((await add(["xd-0000000a", "--dir", "missing"])).code, 1);
  assert.equal(server.requests.length, 0);
});

test("--json reports every ID", async () => {
  server.state.withdrawn.add("xd-0000000c");
  const result = await add(["xd-0000000a", "xd-0000000c", "--json", "--claude-md"]);
  assert.equal(result.code, 3);
  const data = JSON.parse(result.stdout);
  assert.deepEqual(data.results, [
    { id: "xd-0000000a", kind: "lp", status: "written", path: "design/xd-0000000a.md" },
    { id: "xd-0000000c", kind: "lp", status: "withdrawn", path: "design/xd-0000000c.md" },
  ]);
  assert.deepEqual(data.claude_md, ["created"]);
  assert.deepEqual(data.notices, [messages("en").notice]);
});
