import assert from "node:assert/strict";
import { test } from "node:test";
import { detectLang, langFlag, messages } from "../src/i18n.js";
import { nodeVersionProblem } from "../src/node-check.js";

test("--lang wins over everything", () => {
  assert.equal(detectLang(["search", "--lang", "ja"], { DESIGNMARK_LANG: "en" }, "en-US"), "ja");
  assert.equal(
    detectLang(["--lang=en"], { DESIGNMARK_LANG: "ja", LANG: "ja_JP.UTF-8" }, "ja-JP"),
    "en",
  );
  assert.equal(langFlag(["search", "--", "--lang", "ja"]), undefined);
});

test("then DESIGNMARK_LANG", () => {
  assert.equal(detectLang([], { DESIGNMARK_LANG: "ja" }, "en-US"), "ja");
  assert.equal(detectLang([], { DESIGNMARK_LANG: "en", LANG: "ja_JP.UTF-8" }, "ja-JP"), "en");
});

test("then LC_ALL / LC_MESSAGES / LANG starting with ja", () => {
  assert.equal(detectLang([], { LANG: "ja_JP.UTF-8" }, "en-US"), "ja");
  assert.equal(detectLang([], { LC_MESSAGES: "ja_JP" }, "en-US"), "ja");
  // LC_ALL takes precedence over LANG, as in POSIX.
  assert.equal(detectLang([], { LC_ALL: "C", LANG: "ja_JP.UTF-8" }, "en-US"), "en");
});

test("then the Intl locale, else English", () => {
  assert.equal(detectLang([], {}, "ja-JP"), "ja");
  assert.equal(detectLang([], {}, "en-US"), "en");
  assert.equal(detectLang([], {}, ""), "en");
});

test("Japanese and English have the same messages", () => {
  assert.deepEqual(Object.keys(messages("en")).sort(), Object.keys(messages("ja")).sort());
  assert.equal(
    messages("ja").notice,
    "非公式の分析資料です。元 LP のロゴ・写真・文章・商品名は使わず、自社の素材に置き換えてください。",
  );
});

test("Node.js older than 20 gets a message with its version (spec §3.1)", () => {
  assert.match(
    nodeVersionProblem("v18.19.0", "en") ?? "",
    /Node\.js 20 or later \(current: v18\.19\.0\)/,
  );
  assert.match(nodeVersionProblem("v16.20.2", "ja") ?? "", /Node\.js 20 以上/);
  assert.equal(nodeVersionProblem("v20.0.0", "en"), undefined);
  assert.equal(nodeVersionProblem("v22.14.0", "en"), undefined);
});
