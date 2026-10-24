import assert from "node:assert/strict";
import { test } from "node:test";
import { colorTokens, frontMatter, frontMatterValue } from "../src/design-md.js";
import { designMd } from "./helpers/fixtures.js";

const SAMPLE = designMd({ id: "xd-0000000a", title: "架空のLP", style: "Imaginary LP" });

test("color tokens come from the YAML, roles from the Colors table", () => {
  assert.deepEqual(colorTokens(SAMPLE), [
    { token: "primary", hex: "#B89A7A", role: "ブランドの地" },
    { token: "background", hex: "#F7F3EC", role: "メインの背景" },
    { token: "text", hex: "#2B2B2B", role: "本文" },
    { token: "cta", hex: "#C9A86A", role: "購入ボタン" },
  ]);
});

test("tokens without a table row still show, and other YAML blocks are ignored", () => {
  const yamlOnly = [
    "---",
    "name: X",
    "colors:",
    '  primary: "#112233"',
    "  on-primary: '#FFFFFF'",
    "typography:",
    "  display:",
    "    fontSize: 28px",
    "---",
    "",
  ].join("\r\n");
  assert.deepEqual(colorTokens(yamlOnly), [
    { token: "primary", hex: "#112233", role: undefined },
    { token: "on-primary", hex: "#FFFFFF", role: undefined },
  ]);
});

test("front matter values and missing front matter", () => {
  assert.equal(frontMatterValue(SAMPLE, "name"), "Imaginary LP");
  assert.equal(frontMatterValue(SAMPLE, "version"), "alpha");
  assert.equal(frontMatterValue(SAMPLE, "missing"), undefined);
  assert.equal(frontMatter("# No front matter"), undefined);
  assert.deepEqual(colorTokens("# No front matter"), []);
});
