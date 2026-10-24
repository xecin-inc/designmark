/** Package version. test/package.test.ts checks it against package.json and the plugin manifest. */
export const VERSION = "1.0.0";

/** Source repository (also used in the User-Agent so designmark.jp can identify the tool). */
export const REPO_URL = "https://github.com/xecin-inc/designmark";

/** The only host the tool talks to. DESIGNMARK_API replaces it (used by the tests). */
export const DEFAULT_API = "https://designmark.jp";

export type ClientKind = "cli" | "mcp";

/** `designmark-cli/1.0.0 (+https://github.com/…)` or `designmark-mcp/…` (spec §3.1, basic design §6.4). */
export function userAgent(kind: ClientKind): string {
  return `designmark-${kind}/${VERSION} (+${REPO_URL})`;
}
