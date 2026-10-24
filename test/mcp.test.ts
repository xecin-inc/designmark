// MCP server (spec §4): acceptance test T-06 and the MCP part of T-02b. The in-memory tests drive
// the server with a fake clock, so the 1-second spacing and the 10-minute window cost no real time.

import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { DesignmarkApi } from "../src/api.js";
import { IndexCache } from "../src/cache.js";
import { HttpClient } from "../src/http.js";
import { type Lang, messages } from "../src/i18n.js";
import { COOL_DOWN_MS, createMcpServer, FETCH_WINDOW_MS } from "../src/mcp.js";
import { userAgent } from "../src/version.js";
import { CLI_PATH, removeDir, tempDir } from "./helpers/cli.js";
import { FakeClock } from "./helpers/clock.js";
import { type FixtureServer, startServer } from "./helpers/server.js";

let server: FixtureServer;
let cache: string;

const EN = messages("en");

before(async () => {
  server = await startServer();
});

after(async () => {
  await server.close();
});

beforeEach(() => {
  cache = tempDir();
  server.requests.length = 0;
  Object.assign(server.state, { indexStatus: undefined, bodyStatus: undefined });
  server.state.withdrawn.clear();
  server.state.blockedBodies.clear();
});

afterEach(() => {
  removeDir(cache);
});

async function connect(lang: Lang = "en") {
  const clock = new FakeClock();
  const fetchTimes: number[] = [];
  const recordingFetch = ((input: string | URL | Request, init?: RequestInit) => {
    fetchTimes.push(clock.now());
    return fetch(input, init);
  }) as typeof fetch;
  const http = new HttpClient({ baseUrl: server.url, client: "mcp", clock, fetch: recordingFetch });
  const api = new DesignmarkApi({ http, cache: new IndexCache(cache) });
  const mcp = createMcpServer({ api, lang, clock });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await mcp.connect(serverSide);
  const client = new Client({ name: "designmark-test", version: "0.0.0" });
  await client.connect(clientSide);
  const close = async () => {
    await client.close();
    await mcp.close();
  };
  return { client, clock, fetchTimes, close };
}

async function call(client: Client, name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  const content = result.content as { type: string; text?: string }[];
  return { isError: result.isError === true, text: content.map((c) => c.text ?? "").join("\n") };
}

test("T-06: the four tools are listed, read-only, with the fetch limit in their descriptions", async () => {
  const { client, close } = await connect();
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((tool) => tool.name).sort(), [
      "get_design",
      "get_pack",
      "list_packs",
      "search_designs",
    ]);
    for (const tool of tools) {
      assert.match(tool.description ?? "", /Japanese/, tool.name);
      assert.equal(tool.annotations?.readOnlyHint, true, tool.name);
    }
    for (const name of ["get_design", "get_pack", "search_designs"]) {
      const tool = tools.find((t) => t.name === name);
      assert.match(
        tool?.description ?? "",
        /30 (DESIGN\.md fetches |fetches )?per 10 minutes/,
        name,
      );
    }
  } finally {
    await close();
  }
});

test("T-06: the 31st fetch within 10 minutes returns the limit error", async () => {
  const { client, clock, fetchTimes, close } = await connect();
  try {
    for (let i = 1; i <= 30; i++) {
      const result = await call(client, "get_design", { id: "xd-0000000a" });
      assert.equal(result.isError, false, `fetch ${i}: ${result.text}`);
    }
    assert.equal(server.bodyRequests().length, 30);
    for (let i = 1; i < fetchTimes.length; i++) {
      const gap = (fetchTimes[i] ?? 0) - (fetchTimes[i - 1] ?? 0);
      assert.ok(gap >= 1000, `fetch ${i + 1} came ${gap} ms after the previous one`);
    }
    assert.ok(clock.now() < FETCH_WINDOW_MS);

    const limited = await call(client, "get_design", { id: "xd-0000000a" });
    assert.equal(limited.isError, true);
    assert.match(
      limited.text,
      /^Fetch limit reached \(30 per 10 minutes\)\. Wait \d+ more seconds\.$/,
    );
    assert.equal(server.bodyRequests().length, 30, "the 31st is not sent");

    const search = await call(client, "search_designs", { query: "化粧品" });
    assert.equal(search.isError, false, "searching is not limited");

    clock.advance(FETCH_WINDOW_MS);
    const later = await call(client, "get_pack", { id: "pk-cosmetics-elegant" });
    assert.equal(later.isError, false, "allowed again after the window");
  } finally {
    await close();
  }
});

test("the limit message in Japanese matches spec §4.2", () => {
  assert.equal(
    messages("ja").mcpRateLimited(12),
    "取得の上限（10 分あたり 30 件）に達しました。あと 12 秒待ってください",
  );
});

test("get_design: the notice, a blank line, then the DESIGN.md; get_pack: the license first", async () => {
  const { client, close } = await connect("ja");
  try {
    const design = await call(client, "get_design", { id: "https://designmark.jp/d/xd-0000000a/" });
    assert.equal(design.isError, false, design.text);
    const body = server.designBytes("xd-0000000a").toString("utf8");
    assert.equal(design.text, `${messages("ja").notice}\n\n${body}`);
    assert.equal(server.requests.at(-1)?.userAgent, userAgent("mcp"));

    const pack = await call(client, "get_pack", { id: "pk-cosmetics-elegant" });
    assert.ok(pack.text.startsWith(`${messages("ja").mcpPackHeader}\n\n---\n`), pack.text);
  } finally {
    await close();
  }
});

test("search_designs and list_packs: one line per design", async () => {
  const { client, close } = await connect("ja");
  try {
    const result = await call(client, "search_designs", { query: "化粧品", moods: ["elegant"] });
    assert.equal(result.isError, false, result.text);
    const palette = "#F7F3EC #FFFFFF #B89A7A #2B2B2B #C9A86A";
    assert.deepEqual(result.text.split("\n"), [
      `pk-cosmetics-elegant｜化粧品の上品・高級な LP の型｜化粧品・スキンケア｜上品・高級｜${palette}｜${server.url}/packs/pk-cosmetics-elegant/`,
      `xd-0000000a｜生成りと金の上品な化粧水LP｜化粧品・スキンケア｜上品・高級、やさしい・柔らかい｜${palette}｜${server.url}/d/xd-0000000a/`,
      `xd-0000000c｜黒と金のラグジュアリー美容液LP｜化粧品・スキンケア｜ラグジュアリー・ダーク、上品・高級｜${palette}｜${server.url}/d/xd-0000000c/`,
      `xd-0000000f｜ＬＰ全角テスト用の上品な美容LP｜化粧品・スキンケア｜上品・高級｜${palette}｜${server.url}/d/xd-0000000f/`,
      "4 件 / 該当 4 件。get_design で本文を取得できます（型パック pk-… は get_pack）。",
    ]);

    const unknown = await call(client, "search_designs", { category: "unknown" });
    assert.equal(unknown.isError, true);
    assert.match(unknown.text, /cosmetics \(化粧品・スキンケア\)/);

    const packs = await call(client, "list_packs", { category: "cosmetics" });
    assert.deepEqual(packs.text.split("\n"), [
      "pk-cosmetics-elegant｜化粧品の上品・高級な LP の型｜60 件から合成",
      "pk-cosmetics-cute｜化粧品のかわいい LP の型｜41 件から合成",
      "2 件（CC BY 4.0）。get_pack で本文を取得できます。",
    ]);
  } finally {
    await close();
  }
});

test("T-02b: after a blocked fetch, no DESIGN.md request is made for 5 minutes", async () => {
  const { client, clock, close } = await connect();
  try {
    server.state.blockedBodies.add("xd-0000000b");
    const blocked = await call(client, "get_design", { id: "xd-0000000b" });
    assert.equal(blocked.isError, true);
    assert.equal(blocked.text, EN.mcpBlocked);
    assert.deepEqual(
      server.requests.map((r) => `${r.path} ${r.status}`),
      ["/d/xd-0000000b/DESIGN.md 404", "/api/v1/index.json 200"],
    );

    const sent = server.requests.length;
    assert.equal((await call(client, "get_design", { id: "xd-0000000a" })).text, EN.mcpBlocked);
    clock.advance(COOL_DOWN_MS - 1000);
    assert.equal(
      (await call(client, "get_pack", { id: "pk-cosmetics-elegant" })).text,
      EN.mcpBlocked,
    );
    assert.equal(server.requests.length, sent, "no request during the cool-down");

    clock.advance(1000);
    const after = await call(client, "get_design", { id: "xd-0000000a" });
    assert.equal(after.isError, false, after.text);
  } finally {
    await close();
  }
});

test("T-02b: index unavailable → blocked; withdrawn → not found (no cool-down); 5xx → failure", async () => {
  const { client, close } = await connect();
  try {
    server.state.withdrawn.add("xd-0000000c");
    assert.equal((await call(client, "get_design", { id: "xd-0000000c" })).text, EN.mcpNotFound);
    assert.equal((await call(client, "get_design", { id: "xd-0000000a" })).isError, false);

    server.state.bodyStatus = 503;
    assert.equal(
      (await call(client, "get_design", { id: "xd-0000000a" })).text,
      EN.mcpFailed("HTTP 503"),
    );
    server.state.bodyStatus = undefined;
    assert.equal((await call(client, "get_design", { id: "xd-0000000a" })).isError, false);

    const invalid = await call(client, "get_design", { id: "nope" });
    assert.equal(invalid.isError, true);
    assert.equal(server.requests.at(-1)?.path, "/d/xd-0000000a/DESIGN.md", "nothing sent");

    server.state.blockedBodies.add("xd-0000000b");
    server.state.indexStatus = 404;
    assert.equal((await call(client, "get_design", { id: "xd-0000000b" })).text, EN.mcpBlocked);
  } finally {
    await close();
  }
});

test("T-06: `designmark mcp` over stdio lists the tools and answers a search", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [CLI_PATH, "mcp"],
    env: {
      ...getDefaultEnvironment(),
      DESIGNMARK_API: server.url,
      DESIGNMARK_CACHE_DIR: cache,
      DESIGNMARK_LANG: "en",
      DESIGNMARK_TEST_INTERVAL_MS: "5",
    },
    stderr: "pipe",
  });
  const client = new Client({ name: "designmark-test", version: "0.0.0" });
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    assert.equal(tools.length, 4);
    const result = await call(client, "search_designs", { query: "clinic" });
    assert.equal(result.isError, false, result.text);
    assert.match(result.text, /^xd-0000000d \| Calm Blue Clinic LP \| medical \| trust, fresh \| /);
    assert.equal(server.requests[0]?.userAgent, userAgent("mcp"));
  } finally {
    await client.close();
  }
});
