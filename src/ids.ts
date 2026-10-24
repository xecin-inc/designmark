// Design IDs and the URLs built from them (spec §3.2).

export type DesignKind = "lp" | "pack";

export interface DesignRef {
  readonly kind: DesignKind;
  readonly id: string;
}

const LP_ID = /^xd-[0-9a-f]{8}$/;
const PACK_ID = /^pk-[a-z0-9-]+$/;
const SITE_HOSTS = new Set(["designmark.jp", "www.designmark.jp"]);

/**
 * Resolves `xd-xxxxxxxx`, `pk-…` or a designmark URL (`https://designmark.jp/d/<ID>/…`,
 * `…/packs/<ID>/…`). `extraHost` (host[:port]) also accepts URLs of the configured API host.
 */
export function parseDesignRef(input: string, extraHost?: string): DesignRef | undefined {
  const text = input.trim();
  const direct = refFromId(text.toLowerCase());
  if (direct) return direct;

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
  if (!SITE_HOSTS.has(url.hostname) && url.host !== extraHost) return undefined;

  const match = /^\/(d|packs)\/([^/]+)(?:\/|$)/.exec(url.pathname);
  const section = match?.[1];
  const rawId = match?.[2];
  if (section === undefined || rawId === undefined) return undefined;
  let id: string;
  try {
    id = decodeURIComponent(rawId).toLowerCase();
  } catch {
    return undefined;
  }
  const ref = refFromId(id);
  if (!ref) return undefined;
  return (section === "d") === (ref.kind === "lp") ? ref : undefined;
}

function refFromId(id: string): DesignRef | undefined {
  if (LP_ID.test(id)) return { kind: "lp", id };
  if (PACK_ID.test(id)) return { kind: "pack", id };
  return undefined;
}

/** Path of the DESIGN.md file on designmark.jp. */
export function designPath(ref: DesignRef): string {
  return ref.kind === "lp" ? `/d/${ref.id}/DESIGN.md` : `/packs/${ref.id}/DESIGN.md`;
}

/** Path of the detail page on designmark.jp. */
export function pagePath(ref: DesignRef): string {
  return ref.kind === "lp" ? `/d/${ref.id}/` : `/packs/${ref.id}/`;
}
