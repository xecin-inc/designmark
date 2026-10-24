// The only place that talks to the network (spec §3.7): GET requests, one at a time, spaced at
// least 1 second apart, a 15-second timeout and a single retry after 2 seconds (never for 404).

import { type ClientKind, userAgent } from "./version.js";

/** Monotonic time and waiting; the tests inject a fake clock. */
export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => performance.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export const MIN_INTERVAL_MS = 1000;
export const RETRY_DELAY_MS = 2000;
export const TIMEOUT_MS = 15_000;

export class HttpStatusError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`HTTP ${status}`);
    this.name = "HttpStatusError";
    this.status = status;
  }
}

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}

export interface HttpResponse {
  /** 304 only when `etag` was sent and the server says the cached copy is current. */
  readonly status: 200 | 304;
  readonly body: Uint8Array;
  readonly etag?: string | undefined;
}

export interface HttpOptions {
  readonly baseUrl: string;
  readonly client: ClientKind;
  readonly clock?: Clock;
  /** Minimum gap between the end of one request and the start of the next. */
  readonly minIntervalMs?: number;
  readonly retryDelayMs?: number;
  readonly timeoutMs?: number;
  readonly fetch?: typeof fetch;
}

export class HttpClient {
  readonly baseUrl: string;
  private readonly userAgent: string;
  private readonly clock: Clock;
  private readonly minIntervalMs: number;
  private readonly retryDelayMs: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private lastFinished = Number.NEGATIVE_INFINITY;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(options: HttpOptions) {
    this.baseUrl = options.baseUrl;
    this.userAgent = userAgent(options.client);
    this.clock = options.clock ?? systemClock;
    this.minIntervalMs = options.minIntervalMs ?? MIN_INTERVAL_MS;
    this.retryDelayMs = options.retryDelayMs ?? RETRY_DELAY_MS;
    this.timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
    this.fetchImpl = options.fetch ?? fetch;
  }

  /** GETs `path` (relative to the base URL). Throws HttpStatusError or NetworkError. */
  get(path: string, etag?: string): Promise<HttpResponse> {
    const task = this.queue.then(() => this.getWithRetry(path, etag));
    this.queue = task.catch(() => undefined);
    return task;
  }

  private async getWithRetry(path: string, etag: string | undefined): Promise<HttpResponse> {
    try {
      return await this.once(path, etag);
    } catch (error) {
      if (error instanceof HttpStatusError && error.status === 404) throw error;
      await this.clock.sleep(this.retryDelayMs);
      return this.once(path, etag);
    }
  }

  private async once(path: string, etag: string | undefined): Promise<HttpResponse> {
    await this.waitForTurn();
    try {
      const headers: Record<string, string> = { "user-agent": this.userAgent };
      if (etag) headers["if-none-match"] = etag;
      const response = await this.fetchImpl(this.baseUrl + path, {
        headers,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (response.status === 304 && etag) {
        await response.body?.cancel();
        return { status: 304, body: new Uint8Array(0) };
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new HttpStatusError(response.status);
      }
      const body = new Uint8Array(await response.arrayBuffer());
      return { status: 200, body, etag: response.headers.get("etag") ?? undefined };
    } catch (error) {
      if (error instanceof HttpStatusError) throw error;
      throw new NetworkError(describeFetchError(error, this.timeoutMs));
    } finally {
      this.lastFinished = this.clock.now();
    }
  }

  private async waitForTurn(): Promise<void> {
    for (;;) {
      const wait = this.lastFinished + this.minIntervalMs - this.clock.now();
      if (wait <= 0) return;
      await this.clock.sleep(wait);
    }
  }
}

function describeFetchError(error: unknown, timeoutMs: number): string {
  if (!(error instanceof Error)) return String(error);
  if (error.name === "TimeoutError" || error.name === "AbortError") {
    return `timeout after ${timeoutMs / 1000} s`;
  }
  const cause = (error as { cause?: unknown }).cause;
  if (cause instanceof Error) {
    const code = (cause as NodeJS.ErrnoException).code;
    return typeof code === "string" ? code : cause.message;
  }
  return error.message;
}
