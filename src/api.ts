// designmark.jp public API (spec §2): the indexes under /api/v1/ (cached, spec §3.8) and the
// DESIGN.md files (never cached). A DESIGN.md 404 is explained with a fresh look at the index,
// because a blocked request also gets the 404 page (spec §2.4, §3.5).

import type { CacheKey, IndexCache } from "./cache.js";
import { describeError } from "./errors.js";
import { type HttpClient, type HttpResponse, HttpStatusError } from "./http.js";
import { type DesignRef, designPath, pagePath } from "./ids.js";

/** The schema_version this tool understands (spec §2.4). */
export const KNOWN_SCHEMA_VERSION = 1;
export const INDEX_TTL_MS = 6 * 60 * 60 * 1000;

/** One LP design in /api/v1/index.json. Unknown fields are kept and passed through as is. */
export interface LpItem {
  id: string;
  title: string;
  style: string;
  category: string;
  category_slug: string;
  moods: string[];
  keywords: string[];
  palette: string[];
  color_family: string;
  views: string[];
  published_at: string;
  [field: string]: unknown;
}

/** One pattern pack in /api/v1/packs/index.json. */
export interface PackItem {
  id: string;
  title: string;
  style: string;
  category: string;
  category_slug: string;
  mood: string;
  mood_slug: string;
  members: number;
  palette: string[];
  version: string;
  updated_at: string;
  [field: string]: unknown;
}

export interface Category {
  name: string;
  slug: string;
  count: number;
  [field: string]: unknown;
}

export interface LpIndex {
  readonly schema_version: number;
  readonly items: LpItem[];
}

export interface PackIndex {
  readonly schema_version: number;
  readonly license: string;
  readonly attribution: string;
  readonly packs: PackItem[];
}

export interface CategoryIndex {
  readonly schema_version: number;
  readonly categories: Category[];
}

export interface Loaded<T> {
  readonly data: T;
  /** When the data was fetched or last confirmed (ISO 8601, Japan time). */
  readonly fetchedAt: string;
  /** designmark.jp could not be reached and an expired cache was used. */
  readonly stale: boolean;
}

/** "auto": use the cache while it is fresh. "revalidate": always ask the server (ETag). */
export type LoadMode = "auto" | "revalidate";

export type DesignResult =
  | {
      readonly ok: true;
      readonly ref: DesignRef;
      readonly bytes: Uint8Array;
      readonly text: string;
    }
  | {
      readonly ok: false;
      readonly ref: DesignRef;
      /** withdrawn: not in the latest index. blocked: rate limited or blocked. failed: anything else. */
      readonly reason: "withdrawn" | "blocked" | "failed";
      readonly detail: string;
    };

export class InvalidResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidResponseError";
  }
}

interface Resource<T> {
  readonly key: CacheKey;
  readonly path: string;
  readonly parse: (json: unknown) => T | undefined;
}

const INDEX: Resource<LpIndex> = { key: "index", path: "/api/v1/index.json", parse: parseLpIndex };
const PACKS: Resource<PackIndex> = {
  key: "packs",
  path: "/api/v1/packs/index.json",
  parse: parsePackIndex,
};
const CATEGORIES: Resource<CategoryIndex> = {
  key: "categories",
  path: "/api/v1/categories.json",
  parse: parseCategoryIndex,
};

export interface ApiOptions {
  readonly http: HttpClient;
  readonly cache: IndexCache;
  /** Wall-clock time in ms, for cache ages. */
  readonly now?: () => number;
  /** Called when an index has a newer schema_version than this tool knows (spec §2.4). */
  readonly onNewerSchema?: (version: number) => void;
}

export class DesignmarkApi {
  private readonly options: ApiOptions;

  constructor(options: ApiOptions) {
    this.options = options;
  }

  get baseUrl(): string {
    return this.options.http.baseUrl;
  }

  pageUrl(ref: DesignRef): string {
    return this.baseUrl + pagePath(ref);
  }

  index(mode: LoadMode = "auto"): Promise<Loaded<LpIndex>> {
    return this.load(INDEX, mode);
  }

  packs(mode: LoadMode = "auto"): Promise<Loaded<PackIndex>> {
    return this.load(PACKS, mode);
  }

  categories(mode: LoadMode = "auto"): Promise<Loaded<CategoryIndex>> {
    return this.load(CATEGORIES, mode);
  }

  /** Fetches a DESIGN.md (one request; a 404 adds one index request to explain it). */
  async design(ref: DesignRef): Promise<DesignResult> {
    let response: HttpResponse;
    try {
      response = await this.options.http.get(designPath(ref));
    } catch (error) {
      if (error instanceof HttpStatusError) {
        if (error.status === 404) return this.explainNotFound(ref);
        // 403 / 429 mean "too many requests" even though CloudFront normally turns them into 404.
        const reason = error.status === 403 || error.status === 429 ? "blocked" : "failed";
        return { ok: false, ref, reason, detail: error.message };
      }
      return { ok: false, ref, reason: "failed", detail: describeError(error) };
    }
    const text = new TextDecoder().decode(response.body);
    if (/^\s*</.test(text)) {
      return { ok: false, ref, reason: "failed", detail: "unexpected response (HTML)" };
    }
    return { ok: true, ref, bytes: response.body, text };
  }

  /** Spec §3.5 step 2: decide between "withdrawn" and "blocked" with a fresh index. */
  private async explainNotFound(ref: DesignRef): Promise<DesignResult> {
    let listed: boolean;
    try {
      listed =
        ref.kind === "lp"
          ? (await this.index("revalidate")).data.items.some((item) => item.id === ref.id)
          : (await this.packs("revalidate")).data.packs.some((pack) => pack.id === ref.id);
    } catch (error) {
      return {
        ok: false,
        ref,
        reason: "blocked",
        detail: `index unavailable: ${describeError(error)}`,
      };
    }
    return listed
      ? { ok: false, ref, reason: "blocked", detail: "listed in the index, but DESIGN.md is 404" }
      : { ok: false, ref, reason: "withdrawn", detail: "not in the latest index" };
  }

  private async load<T extends { schema_version: number }>(
    resource: Resource<T>,
    mode: LoadMode,
  ): Promise<Loaded<T>> {
    const cached = this.readCached(resource);
    if (mode === "auto" && cached && this.isFresh(cached.fetchedAt)) {
      return { data: cached.data, fetchedAt: cached.fetchedAt, stale: false };
    }
    try {
      const response = await this.options.http.get(resource.path, cached?.etag);
      const fetchedAt = isoJst(this.now());
      if (response.status === 304) {
        if (!cached) throw new InvalidResponseError("304 without a cached copy");
        this.options.cache.touch(resource.key, fetchedAt);
        return { data: cached.data, fetchedAt, stale: false };
      }
      const data = parseBody(resource, response.body);
      this.options.cache.write(resource.key, response.body, {
        etag: response.etag,
        fetched_at: fetchedAt,
        schema_version: data.schema_version,
      });
      this.checkSchema(data.schema_version);
      return { data, fetchedAt, stale: false };
    } catch (error) {
      // Spec §3.8: when designmark.jp cannot be reached, keep working with the old index.
      if (mode === "auto" && cached) {
        return { data: cached.data, fetchedAt: cached.fetchedAt, stale: true };
      }
      throw error;
    }
  }

  private readCached<T extends { schema_version: number }>(
    resource: Resource<T>,
  ): { data: T; fetchedAt: string; etag: string | undefined } | undefined {
    const entry = this.options.cache.read(resource.key);
    if (!entry) return undefined;
    try {
      const data = resource.parse(JSON.parse(entry.body));
      if (data) {
        this.checkSchema(data.schema_version);
        return { data, fetchedAt: entry.meta.fetched_at, etag: entry.meta.etag };
      }
    } catch {
      // Broken JSON: fall through and delete it (spec §3.8 「壊れているとき: 消して取り直す」).
    }
    this.options.cache.remove(resource.key);
    return undefined;
  }

  private isFresh(fetchedAt: string): boolean {
    const age = this.now() - Date.parse(fetchedAt);
    return age >= 0 && age < INDEX_TTL_MS;
  }

  private now(): number {
    return this.options.now ? this.options.now() : Date.now();
  }

  private checkSchema(version: number): void {
    if (version > KNOWN_SCHEMA_VERSION) this.options.onNewerSchema?.(version);
  }
}

/** ISO 8601 in Japan time, e.g. 2026-10-20T03:12:00+09:00 (spec §1). */
export function isoJst(ms: number): string {
  return `${new Date(ms + 9 * 60 * 60 * 1000).toISOString().slice(0, 19)}+09:00`;
}

function parseBody<T>(resource: Resource<T>, body: Uint8Array): T {
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new InvalidResponseError(`${resource.path} is not JSON`);
  }
  const data = resource.parse(json);
  if (!data) throw new InvalidResponseError(`${resource.path} has an unexpected format`);
  return data;
}

// The parsers accept unknown fields (spec §2.4) and repair missing known ones, so that one odd
// entry never breaks the whole index.

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function texts(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function schemaVersion(json: Json): number {
  return typeof json.schema_version === "number" ? json.schema_version : KNOWN_SCHEMA_VERSION;
}

function parseLpIndex(json: unknown): LpIndex | undefined {
  if (!isObject(json) || !Array.isArray(json.items)) return undefined;
  const items: LpItem[] = [];
  for (const raw of json.items) {
    if (!isObject(raw) || typeof raw.id !== "string") continue;
    items.push({
      ...raw,
      id: raw.id,
      title: text(raw.title),
      style: text(raw.style),
      category: text(raw.category),
      category_slug: text(raw.category_slug),
      moods: texts(raw.moods),
      keywords: texts(raw.keywords),
      palette: texts(raw.palette),
      color_family: text(raw.color_family),
      views: texts(raw.views),
      published_at: text(raw.published_at),
    });
  }
  return { schema_version: schemaVersion(json), items };
}

function parsePackIndex(json: unknown): PackIndex | undefined {
  if (!isObject(json) || !Array.isArray(json.packs)) return undefined;
  const packs: PackItem[] = [];
  for (const raw of json.packs) {
    if (!isObject(raw) || typeof raw.id !== "string") continue;
    packs.push({
      ...raw,
      id: raw.id,
      title: text(raw.title),
      style: text(raw.style),
      category: text(raw.category),
      category_slug: text(raw.category_slug),
      mood: text(raw.mood),
      mood_slug: text(raw.mood_slug),
      members: count(raw.members),
      palette: texts(raw.palette),
      version: text(raw.version),
      updated_at: text(raw.updated_at),
    });
  }
  return {
    schema_version: schemaVersion(json),
    license: text(json.license) || "CC-BY-4.0",
    attribution: text(json.attribution),
    packs,
  };
}

function parseCategoryIndex(json: unknown): CategoryIndex | undefined {
  if (!isObject(json) || !Array.isArray(json.categories)) return undefined;
  const categories: Category[] = [];
  for (const raw of json.categories) {
    if (!isObject(raw) || typeof raw.name !== "string") continue;
    categories.push({ ...raw, name: raw.name, slug: text(raw.slug), count: count(raw.count) });
  }
  return { schema_version: schemaVersion(json), categories };
}
