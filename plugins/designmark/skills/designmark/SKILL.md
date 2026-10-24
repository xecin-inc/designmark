---
name: designmark
description: Find and apply a Japanese landing-page design system (DESIGN.md) from designmark.jp before building an LP. Use when the user asks to build a landing page / LP in a Japanese style, for a Japanese market, or mentions 日本のLP・ランディングページ・LP を作って・〇〇業種の LP・トンマナ.
---

# designmark

designmark.jp publishes DESIGN.md files analysed from public Japanese landing pages (colors, type, spacing, components, section structure), plus CC BY 4.0 "pattern packs" synthesised per industry and mood.

## Steps

1. Decide the industry and mood. Ask the user only if neither can be inferred.
   Mood slugs: natural, soft, elegant, minimal, pop, retro, cute, sporty, cool, dark-luxury, trust, handmade, wafu, fresh, bold, dense. Industries also accept Japanese names (e.g. 化粧品); an unknown value prints the accepted ones.
2. Search: `npx -y designmark@1 search <keywords> --category <slug> --mood <slug> --limit 5`
   (or the `search_designs` MCP tool if the designmark MCP server is connected).
3. Show the user up to 3 candidates (ID, title, palette). Prefer a pattern pack (`pk-…`) when the user has no specific reference.
4. Add the chosen one: `npx -y designmark@1 add <ID> --claude-md`
   (with the MCP server: `get_design` or `get_pack`, then save the DESIGN.md text that follows the first notice line as `DESIGN.md` in the project root).
5. Build the page following DESIGN.md: use only its tokens for color, type, radius and spacing; follow Page Structure for section order; start at 375px and widen per Responsive Behavior.

## Rules

- Never reuse logos, photos, copy or product names of the original pages. Use the user's own materials or placeholders.
- Fetch at most 3 designs per request. Do not mirror or bulk-download designmark.
- If the tool says a design was not found (exit code 3), it was withdrawn: search again and pick another.
- If the tool says it is temporarily unavailable (exit code 4), stop fetching for 5 minutes. Do not try other IDs in the meantime.
- Pattern packs are CC BY 4.0: keep an attribution such as "designmark (XECIN Inc.)" in the project's credits.
