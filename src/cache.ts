// Index cache on disk (spec §3.8). Only the indexes are cached, never a DESIGN.md body.
// Files: index.json / packs.json / categories.json (the bodies as fetched) and meta.json
// ({"index": {"etag", "fetched_at", "schema_version"}, "packs": {…}, …}).
// Any failure to read or write is treated as "no cache": the cache only saves requests.

import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type CacheKey = "index" | "packs" | "categories";

export interface CacheEntryMeta {
  etag?: string | undefined;
  fetched_at: string;
  schema_version?: number | undefined;
}

type CacheMeta = Partial<Record<CacheKey, CacheEntryMeta>>;

const FILE_NAMES: Record<CacheKey, string> = {
  index: "index.json",
  packs: "packs.json",
  categories: "categories.json",
};

/**
 * DESIGNMARK_CACHE_DIR → %LOCALAPPDATA%\designmark (Windows) → $XDG_CACHE_HOME/designmark →
 * ~/.cache/designmark.
 */
export function cacheDir(
  env: Readonly<Record<string, string | undefined>>,
  platform: NodeJS.Platform = process.platform,
  home: string = homedir(),
): string {
  if (env.DESIGNMARK_CACHE_DIR) return env.DESIGNMARK_CACHE_DIR;
  if (platform === "win32" && env.LOCALAPPDATA) return join(env.LOCALAPPDATA, "designmark");
  if (env.XDG_CACHE_HOME) return join(env.XDG_CACHE_HOME, "designmark");
  return join(home, ".cache", "designmark");
}

export interface CachedEntry {
  readonly meta: CacheEntryMeta;
  readonly body: string;
}

export class IndexCache {
  readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  read(key: CacheKey): CachedEntry | undefined {
    const meta = this.readMeta()[key];
    if (!meta || typeof meta.fetched_at !== "string") return undefined;
    try {
      return { meta, body: readFileSync(join(this.dir, FILE_NAMES[key]), "utf8") };
    } catch {
      return undefined;
    }
  }

  write(key: CacheKey, body: Uint8Array, meta: CacheEntryMeta): void {
    try {
      mkdirSync(this.dir, { recursive: true });
      writeAtomic(join(this.dir, FILE_NAMES[key]), body);
      this.updateMeta((all) => {
        all[key] = meta;
      });
    } catch {
      // Not cached: the next run fetches again.
    }
  }

  /** Marks a cached entry as checked now (after a 304 Not Modified). */
  touch(key: CacheKey, fetchedAt: string): void {
    this.updateMeta((all) => {
      const entry = all[key];
      if (entry) entry.fetched_at = fetchedAt;
    });
  }

  /** Deletes a broken entry so that it is fetched again. */
  remove(key: CacheKey): void {
    try {
      rmSync(join(this.dir, FILE_NAMES[key]), { force: true });
    } catch {
      // Already gone or not removable; meta.json no longer points to it either way.
    }
    this.updateMeta((all) => {
      delete all[key];
    });
  }

  private readMeta(): CacheMeta {
    try {
      const parsed: unknown = JSON.parse(readFileSync(join(this.dir, "meta.json"), "utf8"));
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? (parsed as CacheMeta)
        : {};
    } catch {
      return {};
    }
  }

  private updateMeta(change: (meta: CacheMeta) => void): void {
    try {
      const meta = this.readMeta();
      change(meta);
      mkdirSync(this.dir, { recursive: true });
      writeAtomic(join(this.dir, "meta.json"), JSON.stringify(meta));
    } catch {
      // Same as write(): a cache that cannot be updated is simply not used next time.
    }
  }
}

/** Writes through a temporary file so that a reader never sees a half-written file. */
function writeAtomic(file: string, data: string | Uint8Array): void {
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, data);
  try {
    renameSync(temp, file);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}
