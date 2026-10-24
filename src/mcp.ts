// MCP server (spec §4): four read-only tools over stdio. It never writes files; the calling
// agent saves what it fetches. Limits: 30 DESIGN.md fetches per 10 minutes per process (index
// requests are not counted), at least 1 second apart (the HTTP client), and after a "blocked"
// answer no DESIGN.md request at all for 5 minutes.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { DesignmarkApi, Loaded, PackIndex } from "./api.js";
import { createApi } from "./context.js";
import { CliError, describeError } from "./errors.js";
import { categoryOf, colorOf, limitOf, moodOf } from "./filters.js";
import {
  categoryLabel,
  lpTitle,
  moodsLabel,
  packMoodLabel,
  packTitle,
  paletteLabel,
} from "./format.js";
import { type Clock, HttpStatusError, systemClock } from "./http.js";
import { type Lang, type Messages, messages } from "./i18n.js";
import { parseDesignRef } from "./ids.js";
import { categoriesOf, search } from "./search.js";
import { VERSION } from "./version.js";

export const FETCH_LIMIT = 30;
export const FETCH_WINDOW_MS = 10 * 60 * 1000;
export const COOL_DOWN_MS = 5 * 60 * 1000;

const INSTRUCTIONS = [
  "designmark (https://designmark.jp) publishes DESIGN.md design systems analysed from public Japanese landing pages (LP), plus CC BY 4.0 pattern packs synthesised per industry and mood.",
  "Workflow: search_designs → show the user up to 3 candidates → get_design (xd-…) or get_pack (pk-…) for the chosen one → save it as DESIGN.md in the project and build with its tokens.",
  "Never reuse logos, photos, copy or product names of the original pages. Do not bulk-download: fetch at most 3 designs per request.",
  "If a fetch reports that designmark is temporarily unavailable, wait 5 minutes and do not try other IDs in the meantime.",
].join(" ");

const ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

type Env = Readonly<Record<string, string | undefined>>;

export interface McpOptions {
  readonly api: DesignmarkApi;
  readonly lang: Lang;
  /** Drives the rate limit and the cool-down; the tests pass a fake clock. */
  readonly clock?: Clock;
}

/** Sliding-window counter of DESIGN.md fetches. */
export class FetchLimiter {
  private readonly stamps: number[] = [];
  private readonly max: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(max: number, windowMs: number, now: () => number) {
    this.max = max;
    this.windowMs = windowMs;
    this.now = now;
  }

  /** Records a fetch and returns 0, or returns the seconds to wait when the limit is reached. */
  take(): number {
    const now = this.now();
    while (this.stamps.length > 0 && (this.stamps[0] as number) <= now - this.windowMs) {
      this.stamps.shift();
    }
    if (this.stamps.length >= this.max) {
      return Math.max(1, Math.ceil(((this.stamps[0] as number) + this.windowMs - now) / 1000));
    }
    this.stamps.push(now);
    return 0;
  }
}

export function createMcpServer(options: McpOptions): McpServer {
  const { api, lang } = options;
  const clock = options.clock ?? systemClock;
  const msg = messages(lang);
  const separator = lang === "ja" ? "｜" : " | ";
  const limiter = new FetchLimiter(FETCH_LIMIT, FETCH_WINDOW_MS, () => clock.now());
  let coolDownUntil = Number.NEGATIVE_INFINITY;

  const server = new McpServer(
    { name: "designmark", version: VERSION },
    { instructions: INSTRUCTIONS },
  );

  server.registerTool(
    "search_designs",
    {
      title: "Search Japanese LP designs",
      description:
        "Search designmark.jp for DESIGN.md design systems of Japanese landing pages (LP): unofficial analyses of public Japanese LPs (colors, typography, spacing, components, section structure), plus CC BY 4.0 pattern packs synthesised per industry and mood. Filter by keywords (Japanese or English), industry, mood, main color and view. Returns one line per design: ID | title | industry | moods | main colors | page URL. Then fetch the chosen design with get_design (xd-…) or get_pack (pk-…). Searching reads a cached index and does not count toward the fetch limit (30 DESIGN.md fetches per 10 minutes).",
      inputSchema: {
        query: z
          .string()
          .max(200)
          .optional()
          .describe('Keywords, all of which must match, e.g. "化粧品 上品" or "skincare"'),
        category: z
          .string()
          .optional()
          .describe('Industry name or slug, e.g. "cosmetics" or "化粧品・スキンケア"'),
        moods: z
          .array(z.string())
          .max(4)
          .optional()
          .describe(
            "Mood names or slugs, all of which must match: natural, soft, elegant, minimal, pop, retro, cute, sporty, cool, dark-luxury, trust, handmade, wafu, fresh, bold, dense",
          ),
        color: z
          .string()
          .optional()
          .describe(
            "Main color family (LP designs only): red, orange, yellow, green, teal, blue, purple, pink, brown, black, gray, white, or a Japanese name such as 青",
          ),
        view: z
          .enum(["sp", "pc"])
          .optional()
          .describe("Analysed view (LP designs only): sp = smartphone, pc = desktop"),
        include_packs: z.boolean().optional().describe("Include pattern packs (default true)"),
        limit: z.number().int().min(1).max(20).optional().describe("Maximum results (default 10)"),
      },
      annotations: ANNOTATIONS,
    },
    (args) =>
      guard(msg, async () => {
        const limit = limitOf(args.limit, 1, 20, 10, msg);
        const colorFamily = args.color === undefined ? undefined : colorOf(args.color, msg);
        const includePacks = args.include_packs ?? true;
        const notes: string[] = [];
        const lp = await api.index();
        if (lp.stale) notes.push(msg.stale(lp.fetchedAt));
        let packs: Loaded<PackIndex> | undefined;
        if (includePacks) {
          try {
            packs = await api.packs();
            if (packs.stale) notes.push(msg.stale(packs.fetchedAt));
          } catch (error) {
            notes.push(msg.packsIndexUnavailable(describeError(error)));
          }
        }
        const items = lp.data.items;
        const packItems = packs?.data.packs ?? [];
        const knownMoods = new Set(items.flatMap((item) => item.moods));
        const result = search(
          items,
          packItems,
          {
            words: args.query ? [args.query] : [],
            category:
              args.category === undefined
                ? undefined
                : categoryOf(args.category, categoriesOf(items, packItems), msg),
            moods: (args.moods ?? []).map((mood) => moodOf(mood, knownMoods, msg)),
            colorFamily,
            view: args.view,
          },
          { scope: includePacks ? "all" : "lp", limit, maxPacks: 3 },
        );
        const shown = result.packs.length + result.items.length;
        if (shown === 0) return success([msg.noMatch, ...notes].join("\n"));
        const lines = [
          ...result.packs.map((pack) =>
            [
              pack.id,
              packTitle(pack, lang),
              categoryLabel(pack, lang),
              packMoodLabel(pack, lang),
              paletteLabel(pack.palette, 5),
              api.pageUrl({ kind: "pack", id: pack.id }),
            ].join(separator),
          ),
          ...result.items.map((item) =>
            [
              item.id,
              lpTitle(item, lang),
              categoryLabel(item, lang),
              moodsLabel(item.moods, lang),
              paletteLabel(item.palette, 5),
              api.pageUrl({ kind: "lp", id: item.id }),
            ].join(separator),
          ),
          msg.mcpSearchFooter(shown, result.total),
          ...notes,
        ];
        return success(lines.join("\n"));
      }),
  );

  server.registerTool(
    "get_design",
    {
      title: "Get a Japanese LP DESIGN.md",
      description:
        "Fetch the full DESIGN.md of one Japanese landing-page design from designmark.jp by ID (xd-xxxxxxxx) or designmark.jp URL, to save as DESIGN.md in the project. Fetch at most 3 designs per user request; this server allows 30 fetches per 10 minutes, at least 1 second apart. The first line is a notice: these are unofficial analyses, so never reuse the original page's logos, photos, copy or product names.",
      inputSchema: {
        id: z.string().min(1).describe("Design ID (xd-xxxxxxxx) or a designmark.jp URL"),
      },
      annotations: ANNOTATIONS,
    },
    ({ id }) => guard(msg, () => fetchDesign(id)),
  );

  server.registerTool(
    "list_packs",
    {
      title: "List pattern packs",
      description:
        "List designmark pattern packs (pk-…): CC BY 4.0 DESIGN.md files synthesised from many Japanese landing pages per industry and mood. One line per pack: ID | title | number of designs it was synthesised from. Does not count toward the fetch limit.",
      inputSchema: {
        category: z
          .string()
          .optional()
          .describe('Industry name or slug, e.g. "cosmetics" or "化粧品・スキンケア"'),
      },
      annotations: ANNOTATIONS,
    },
    ({ category }) =>
      guard(msg, async () => {
        const loaded = await api.packs();
        let packs = loaded.data.packs;
        if (category !== undefined) {
          const wanted = categoryOf(category, categoriesOf(packs), msg);
          packs = packs.filter(
            (pack) => (pack.category_slug || pack.category) === (wanted.slug || wanted.name),
          );
        }
        if (packs.length === 0) return success(msg.noPacks);
        const lines = packs.map((pack) =>
          [pack.id, packTitle(pack, lang), msg.membersShort(pack.members)].join(separator),
        );
        lines.push(msg.mcpPacksFooter(packs.length));
        if (loaded.stale) lines.push(msg.stale(loaded.fetchedAt));
        return success(lines.join("\n"));
      }),
  );

  server.registerTool(
    "get_pack",
    {
      title: "Get a pattern pack DESIGN.md",
      description:
        "Fetch the full DESIGN.md of a designmark pattern pack (pk-…) by ID or designmark.jp URL: a design system synthesised from many Japanese landing pages of one industry and mood. Pattern packs are CC BY 4.0 (attribution required); the first line shows the license and an attribution example. Counts toward the fetch limit (30 per 10 minutes, at least 1 second apart).",
      inputSchema: {
        id: z.string().min(1).describe("Pattern pack ID (pk-…) or a designmark.jp URL"),
      },
      annotations: ANNOTATIONS,
    },
    ({ id }) => guard(msg, () => fetchDesign(id)),
  );

  /** get_design and get_pack: both accept either kind of ID and label the result accordingly. */
  async function fetchDesign(input: string): Promise<CallToolResult> {
    const ref = parseDesignRef(input, new URL(api.baseUrl).host);
    if (!ref) return failure(msg.invalidId(input));
    if (clock.now() < coolDownUntil) return failure(msg.mcpBlocked);
    const wait = limiter.take();
    if (wait > 0) return failure(msg.mcpRateLimited(wait));
    const result = await api.design(ref);
    if (result.ok) {
      const header = ref.kind === "pack" ? msg.mcpPackHeader : msg.notice;
      return success(`${header}\n\n${result.text}`);
    }
    if (result.reason === "withdrawn") return failure(msg.mcpNotFound);
    if (result.reason === "blocked") {
      coolDownUntil = clock.now() + COOL_DOWN_MS;
      return failure(msg.mcpBlocked);
    }
    return failure(msg.mcpFailed(result.detail));
  }

  return server;
}

export async function serveStdio(env: Env, lang: Lang): Promise<void> {
  const msg = messages(lang);
  const api = createApi({
    env,
    client: "mcp",
    msg,
    warn: (text) => process.stderr.write(`${text}\n`),
  });
  await createMcpServer({ api, lang }).connect(new StdioServerTransport());
}

function success(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}

function failure(text: string): CallToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

/** Turns thrown errors into tool errors (isError) with the same wording as the CLI. */
async function guard(msg: Messages, run: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof CliError) return failure(error.message);
    if (error instanceof HttpStatusError && [403, 404, 429].includes(error.status)) {
      return failure(`${msg.indexUnavailable(error.message)}${msg.mcpBlocked}`);
    }
    return failure(msg.mcpFailed(describeError(error)));
  }
}
