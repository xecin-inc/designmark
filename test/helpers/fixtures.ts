// Synthetic test data in the format of the public API (spec §2). Every title, ID and DESIGN.md
// here is made up: no real landing-page data is stored in this repository.

import type { Category, LpItem, PackItem } from "../../src/api.js";

const CATEGORY_NAMES: Record<string, string> = {
  cosmetics: "化粧品・スキンケア",
  health: "健康食品・サプリ",
  medical: "医療・クリニック",
};

function lp(
  id: string,
  title: string,
  style: string,
  slug: string,
  moods: string[],
  keywords: string[],
  colorFamily: string,
  views: string[],
  publishedAt: string,
): LpItem {
  return {
    id,
    title,
    style,
    category: CATEGORY_NAMES[slug] ?? slug,
    category_slug: slug,
    moods,
    keywords,
    palette: ["#F7F3EC", "#FFFFFF", "#B89A7A", "#2B2B2B", "#C9A86A"],
    color_family: colorFamily,
    views,
    published_at: publishedAt,
  };
}

function pack(
  id: string,
  title: string,
  style: string,
  slug: string,
  mood: string,
  moodSlug: string,
  members: number,
): PackItem {
  return {
    id,
    title,
    style,
    category: CATEGORY_NAMES[slug] ?? slug,
    category_slug: slug,
    mood,
    mood_slug: moodSlug,
    members,
    palette: ["#F7F3EC", "#FFFFFF", "#B89A7A", "#2B2B2B", "#C9A86A"],
    version: "2026.11",
    updated_at: "2026-11-01",
  };
}

export const LP_ITEMS: readonly LpItem[] = [
  lp(
    "xd-0000000a",
    "生成りと金の上品な化粧水LP",
    "Ivory Gold Lotion LP",
    "cosmetics",
    ["上品・高級", "やさしい・柔らかい"],
    ["生成り", "金", "明朝見出し"],
    "orange",
    ["sp", "pc"],
    "2026-10-20",
  ),
  lp(
    "xd-0000000b",
    "淡いピンクのかわいいコスメLP",
    "Soft Pink Cute Cosmetics LP",
    "cosmetics",
    ["かわいい", "ポップ・元気"],
    ["ピンク", "丸ゴシック"],
    "pink",
    ["sp", "pc"],
    "2026-10-19",
  ),
  lp(
    "xd-0000000c",
    "黒と金のラグジュアリー美容液LP",
    "Black Gold Serum LP",
    "cosmetics",
    ["ラグジュアリー・ダーク", "上品・高級"],
    ["黒", "金", "セリフ"],
    "black",
    ["pc"],
    "2026-10-18",
  ),
  lp(
    "xd-0000000d",
    "青い余白のクリニック予約LP",
    "Calm Blue Clinic LP",
    "medical",
    ["信頼・誠実", "清潔・爽やか"],
    ["青", "余白多め"],
    "blue",
    ["sp"],
    "2026-10-17",
  ),
  lp(
    "xd-0000000e",
    "緑の手作り感ある青汁LP",
    "Green Handmade Aojiru LP",
    "health",
    ["親しみ・手作り感", "ナチュラル"],
    ["緑", "手書き"],
    "green",
    ["sp", "pc"],
    "2026-10-16",
  ),
  lp(
    "xd-0000000f",
    "ＬＰ全角テスト用の上品な美容LP",
    "Fullwidth Test LP",
    "cosmetics",
    ["上品・高級"],
    ["全角"],
    "white",
    ["sp"],
    "2026-10-15",
  ),
];

export const PACKS: readonly PackItem[] = [
  pack(
    "pk-cosmetics-elegant",
    "化粧品の上品・高級な LP の型",
    "Elegant Japanese Cosmetics LP Pattern",
    "cosmetics",
    "上品・高級",
    "elegant",
    60,
  ),
  pack(
    "pk-cosmetics-cute",
    "化粧品のかわいい LP の型",
    "Cute Japanese Cosmetics LP Pattern",
    "cosmetics",
    "かわいい",
    "cute",
    41,
  ),
  pack(
    "pk-medical-trust",
    "医療の信頼・誠実な LP の型",
    "Trustworthy Japanese Medical LP Pattern",
    "medical",
    "信頼・誠実",
    "trust",
    33,
  ),
  pack(
    "pk-health-natural",
    "健康食品のナチュラルな LP の型",
    "Natural Japanese Health Food LP Pattern",
    "health",
    "ナチュラル",
    "natural",
    25,
  ),
];

/** Site navigation order (deliberately not the order of PACKS). */
export const CATEGORIES: readonly Category[] = [
  { name: CATEGORY_NAMES.cosmetics as string, slug: "cosmetics", count: 4 },
  { name: CATEGORY_NAMES.health as string, slug: "health", count: 1 },
  { name: CATEGORY_NAMES.medical as string, slug: "medical", count: 1 },
];

/** A made-up DESIGN.md in the published layout: YAML front matter, then the Markdown body. */
export function designMd(entry: { id: string; title: string; style: string }): string {
  return [
    "---",
    "version: alpha",
    `name: ${entry.style}`,
    "description: テスト用の架空の設計書です。",
    "colors:",
    "  primary: '#B89A7A'",
    "  background: '#F7F3EC'",
    "  text: '#2B2B2B'",
    "  cta: '#C9A86A'",
    "typography:",
    "  display:",
    "    fontFamily: Noto Serif JP",
    "    fontSize: 28px",
    "rounded:",
    "  md: 8px",
    "---",
    "",
    `# DESIGN.md — ${entry.title}（${entry.style}）`,
    "",
    "## Colors",
    "",
    "| Token | HEX | 役割 | 面積の目安 | 値の出どころ |",
    "|---|---|---|---|---|",
    "| `primary` | `#B89A7A` | ブランドの地 | 12% | 画素の実測 |",
    "| `background` | `#F7F3EC` | メインの背景 | 40% | 画素の実測 |",
    "| `text` | `#2B2B2B` | 本文 | 3% | 画素の実測 |",
    "| `cta` | `#C9A86A` | 購入ボタン | 2% | 画素の実測 |",
    "",
    "## Provenance",
    "",
    `- **ID**: \`${entry.id}\``,
    "",
  ].join("\n");
}

/** A large index (about the size of the real one) for the speed test. */
export function bigIndex(count: number): LpItem[] {
  const slugs = Object.keys(CATEGORY_NAMES);
  const moods = ["上品・高級", "やさしい・柔らかい", "ナチュラル", "かわいい", "信頼・誠実"];
  const families = ["orange", "pink", "blue", "green", "white"];
  const items: LpItem[] = [];
  for (let i = 0; i < count; i++) {
    items.push(
      lp(
        `xd-${(0x100000 + i).toString(16).padStart(8, "0")}`,
        `架空のテスト用LP ${i} 番`,
        `Synthetic Test LP ${i}`,
        slugs[i % slugs.length] as string,
        [moods[i % moods.length] as string, moods[(i + 2) % moods.length] as string],
        ["テスト", `キーワード${i % 50}`, "余白多め", "写真大きめ", "明朝見出し", "淡い色"],
        families[i % families.length] as string,
        i % 3 === 0 ? ["sp"] : ["sp", "pc"],
        `2026-${String(1 + (i % 9)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`,
      ),
    );
  }
  return items;
}
