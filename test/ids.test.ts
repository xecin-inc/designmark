import assert from "node:assert/strict";
import { test } from "node:test";
import { designPath, pagePath, parseDesignRef } from "../src/ids.js";

test("LP and pattern-pack IDs (spec §3.2)", () => {
  assert.deepEqual(parseDesignRef("xd-12ab34cd"), { kind: "lp", id: "xd-12ab34cd" });
  assert.deepEqual(parseDesignRef("  XD-12AB34CD "), { kind: "lp", id: "xd-12ab34cd" });
  assert.deepEqual(parseDesignRef("pk-cosmetics-elegant"), {
    kind: "pack",
    id: "pk-cosmetics-elegant",
  });
  assert.deepEqual(parseDesignRef("pk-cosmetics-dark-luxury"), {
    kind: "pack",
    id: "pk-cosmetics-dark-luxury",
  });
});

test("designmark.jp URLs give their ID", () => {
  const cases: [string, string][] = [
    ["https://designmark.jp/d/xd-12ab34cd/", "xd-12ab34cd"],
    ["https://designmark.jp/d/xd-12ab34cd/DESIGN.md", "xd-12ab34cd"],
    ["https://designmark.jp/d/xd-12ab34cd", "xd-12ab34cd"],
    ["https://www.designmark.jp/d/xd-12ab34cd/?utm_source=x#colors", "xd-12ab34cd"],
    ["http://designmark.jp/packs/pk-cosmetics-elegant/", "pk-cosmetics-elegant"],
    ["https://designmark.jp/packs/pk-cosmetics-elegant/DESIGN.md", "pk-cosmetics-elegant"],
  ];
  for (const [input, id] of cases) assert.equal(parseDesignRef(input)?.id, id, input);
});

test("anything else is rejected (exit code 2 in the CLI)", () => {
  for (const input of [
    "",
    "xd-123",
    "xd-20c0664g",
    "xd-12ab34cd0",
    "pk-",
    "pk_cosmetics",
    "cosmetics",
    "https://example.com/d/xd-12ab34cd/",
    "https://designmark.jp/packs/xd-12ab34cd/",
    "https://designmark.jp/d/pk-cosmetics-elegant/",
    "https://designmark.jp/category/cosmetics/",
    "ftp://designmark.jp/d/xd-12ab34cd/",
  ]) {
    assert.equal(parseDesignRef(input), undefined, input);
  }
});

test("URLs of the configured API host are accepted only when passed in", () => {
  const url = "http://127.0.0.1:4321/d/xd-0000000a/";
  assert.equal(parseDesignRef(url), undefined);
  assert.deepEqual(parseDesignRef(url, "127.0.0.1:4321"), { kind: "lp", id: "xd-0000000a" });
});

test("paths on designmark.jp", () => {
  assert.equal(designPath({ kind: "lp", id: "xd-12ab34cd" }), "/d/xd-12ab34cd/DESIGN.md");
  assert.equal(designPath({ kind: "pack", id: "pk-a-b" }), "/packs/pk-a-b/DESIGN.md");
  assert.equal(pagePath({ kind: "lp", id: "xd-12ab34cd" }), "/d/xd-12ab34cd/");
  assert.equal(pagePath({ kind: "pack", id: "pk-a-b" }), "/packs/pk-a-b/");
});
