// What a command needs from the outside world, gathered in one place so that commands stay pure
// functions of (context, arguments) → exit code.

import { DesignmarkApi } from "./api.js";
import { cacheDir, IndexCache } from "./cache.js";
import { CliError, ExitCode } from "./errors.js";
import { type Clock, HttpClient, MIN_INTERVAL_MS, RETRY_DELAY_MS, systemClock } from "./http.js";
import { type Lang, type Messages, messages } from "./i18n.js";
import { type ClientKind, DEFAULT_API } from "./version.js";

type Env = Readonly<Record<string, string | undefined>>;

export interface Io {
  stdout(text: string | Uint8Array): void;
  stderr(text: string): void;
  readonly env: Env;
  readonly cwd: string;
  readonly platform: NodeJS.Platform;
}

export function processIo(): Io {
  return {
    stdout: (text) => {
      process.stdout.write(text);
    },
    stderr: (text) => {
      process.stderr.write(text);
    },
    env: process.env,
    cwd: process.cwd(),
    platform: process.platform,
  };
}

export interface Context {
  readonly io: Io;
  readonly lang: Lang;
  readonly msg: Messages;
  /** The API client, created on first use (so that --help never needs DESIGNMARK_API). */
  api(): DesignmarkApi;
  /** A line on stderr (warnings and notes that must not mix with --json output). */
  warn(text: string): void;
}

export function createContext(io: Io, lang: Lang): Context {
  const msg = messages(lang);
  const warn = (text: string) => io.stderr(`${text}\n`);
  let api: DesignmarkApi | undefined;
  return {
    io,
    lang,
    msg,
    api: () => {
      api ??= createApi({ env: io.env, client: "cli", msg, warn });
      return api;
    },
    warn,
  };
}

export interface ApiSetup {
  readonly env: Env;
  readonly client: ClientKind;
  readonly msg: Messages;
  readonly warn: (text: string) => void;
  readonly clock?: Clock;
}

export function createApi(setup: ApiSetup): DesignmarkApi {
  const baseUrl = apiBaseUrl(setup.env, setup.msg);
  const testInterval = testIntervalMs(setup.env, baseUrl);
  const http = new HttpClient({
    baseUrl,
    client: setup.client,
    clock: setup.clock ?? systemClock,
    minIntervalMs: testInterval ?? MIN_INTERVAL_MS,
    retryDelayMs: testInterval === undefined ? RETRY_DELAY_MS : testInterval * 2,
  });
  let warned = false;
  return new DesignmarkApi({
    http,
    cache: new IndexCache(cacheDir(setup.env)),
    onNewerSchema: (version) => {
      if (warned) return;
      warned = true;
      setup.warn(setup.msg.newerSchema(version));
    },
  });
}

/** DESIGNMARK_API (default https://designmark.jp) without a trailing slash. */
export function apiBaseUrl(env: Env, msg: Messages): string {
  const raw = env.DESIGNMARK_API?.trim() || DEFAULT_API;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new CliError(msg.badApi(raw), ExitCode.usage);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new CliError(msg.badApi(raw), ExitCode.usage);
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/**
 * DESIGNMARK_TEST_INTERVAL_MS shortens the spacing between requests for the test suite. It only
 * works against a loopback DESIGNMARK_API, so designmark.jp is never fetched faster than 1/s.
 */
export function testIntervalMs(env: Env, baseUrl: string): number | undefined {
  const raw = env.DESIGNMARK_TEST_INTERVAL_MS;
  if (raw === undefined || raw.trim() === "") return undefined;
  if (!LOOPBACK_HOSTS.has(new URL(baseUrl).hostname)) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}
