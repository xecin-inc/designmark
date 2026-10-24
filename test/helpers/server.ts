// A local stand-in for designmark.jp (node:http on 127.0.0.1). It serves the public API from the
// synthetic fixtures, answers ETag revalidation with 304, records every request with its arrival
// time, and has switches for takedowns, blocks and outages. The tests never contact designmark.jp.

import { createHash } from "node:crypto";
import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { Category, LpItem, PackItem } from "../../src/api.js";
import { CATEGORIES, designMd, LP_ITEMS, PACKS } from "./fixtures.js";

export interface ServerState {
  items: LpItem[];
  packs: PackItem[];
  categories: Category[];
  schemaVersion: number;
  /** Taken down: removed from the index, and its DESIGN.md is 404. */
  withdrawn: Set<string>;
  /** DESIGN.md is 404 although the ID is in the index (what a WAF block looks like). */
  blockedBodies: Set<string>;
  /** Status for the three index files instead of the content (404 = blocked, 503 = outage). */
  indexStatus: number | undefined;
  /** Status for every DESIGN.md instead of the content. */
  bodyStatus: number | undefined;
  /** Answer this many of the next requests with 503. */
  failNext: number;
}

export interface RequestRecord {
  readonly path: string;
  /** Arrival time (performance.now() of the test process). */
  readonly at: number;
  readonly ifNoneMatch: string | undefined;
  readonly userAgent: string | undefined;
  status: number;
}

export interface FixtureServer {
  readonly url: string;
  readonly state: ServerState;
  readonly requests: RequestRecord[];
  /** The exact bytes served for a DESIGN.md. */
  designBytes(id: string): Buffer;
  /** Requests whose path ends with /DESIGN.md. */
  bodyRequests(): RequestRecord[];
  close(): Promise<void>;
}

const NOT_FOUND_PAGE =
  "<!doctype html><html><head><title>404</title></head><body>Not Found</body></html>";

export async function startServer(overrides: Partial<ServerState> = {}): Promise<FixtureServer> {
  const state: ServerState = {
    items: [...LP_ITEMS],
    packs: [...PACKS],
    categories: [...CATEGORIES],
    schemaVersion: 1,
    withdrawn: new Set(),
    blockedBodies: new Set(),
    indexStatus: undefined,
    bodyStatus: undefined,
    failNext: 0,
    ...overrides,
  };
  const requests: RequestRecord[] = [];

  const lpIndex = () =>
    JSON.stringify({
      schema_version: state.schemaVersion,
      generated_at: "2026-10-20T03:12:00+09:00",
      site: "https://designmark.jp",
      count: visibleItems().length,
      items: visibleItems(),
    });
  const visibleItems = () => state.items.filter((item) => !state.withdrawn.has(item.id));
  const packIndex = () =>
    JSON.stringify({
      schema_version: state.schemaVersion,
      generated_at: "2026-10-20T03:12:00+09:00",
      license: "CC-BY-4.0",
      attribution: "designmark (XECIN Inc.) — https://designmark.jp",
      count: state.packs.length,
      packs: state.packs,
    });
  const categoryIndex = () =>
    JSON.stringify({ schema_version: state.schemaVersion, categories: state.categories });

  const designBytes = (id: string): Buffer => {
    const entry = [...state.items, ...state.packs].find((e) => e.id === id);
    return Buffer.from(designMd(entry ?? { id, title: id, style: id }), "utf8");
  };

  const server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    const record: RequestRecord = {
      path,
      at: performance.now(),
      ifNoneMatch: request.headers["if-none-match"],
      userAgent: request.headers["user-agent"],
      status: 0,
    };
    requests.push(record);
    const send = (status: number, body: string | Buffer, type: string, etag?: string) => {
      record.status = status;
      const headers: Record<string, string> = { "content-type": type };
      if (etag) headers.etag = etag;
      response.writeHead(status, headers);
      response.end(status === 304 ? undefined : body);
    };
    const notFound = () => send(404, NOT_FOUND_PAGE, "text/html; charset=utf-8");

    if (state.failNext > 0) {
      state.failNext--;
      return send(503, "Service Unavailable", "text/plain");
    }
    const indexes: Record<string, () => string> = {
      "/api/v1/index.json": lpIndex,
      "/api/v1/packs/index.json": packIndex,
      "/api/v1/categories.json": categoryIndex,
    };
    const index = indexes[path];
    if (index) {
      if (state.indexStatus) return statusPage(response, record, state.indexStatus);
      const body = index();
      const etag = `"${createHash("sha1").update(body).digest("hex")}"`;
      if (request.headers["if-none-match"] === etag) return send(304, "", "application/json", etag);
      return send(200, body, "application/json", etag);
    }

    const lpMatch = /^\/d\/(xd-[0-9a-f]{8})\/DESIGN\.md$/.exec(path);
    const packMatch = /^\/packs\/(pk-[a-z0-9-]+)\/DESIGN\.md$/.exec(path);
    const id = lpMatch?.[1] ?? packMatch?.[1];
    if (id === undefined) return notFound();
    if (state.bodyStatus) return statusPage(response, record, state.bodyStatus);
    if (state.withdrawn.has(id) || state.blockedBodies.has(id)) return notFound();
    const exists = lpMatch
      ? state.items.some((item) => item.id === id)
      : state.packs.some((pack) => pack.id === id);
    if (!exists) return notFound();
    return send(200, designBytes(id), "text/markdown; charset=utf-8");
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    state,
    requests,
    designBytes,
    bodyRequests: () => requests.filter((r) => r.path.endsWith("/DESIGN.md")),
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

function statusPage(response: ServerResponse, record: RequestRecord, status: number): void {
  record.status = status;
  response.writeHead(status, { "content-type": "text/html; charset=utf-8" });
  response.end(status === 404 ? NOT_FOUND_PAGE : `<!doctype html><title>${status}</title>`);
}
