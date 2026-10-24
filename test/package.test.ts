// Repository-level checks: one version everywhere, the plugin files, the dependency rule (NFR-6),
// the lazy MCP import, and the README UTM swap used for the npm package.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { test } from "node:test";
import { VERSION } from "../src/version.js";
import { ROOT, removeDir, tempDir } from "./helpers/cli.js";

const json = (path: string) => JSON.parse(readFileSync(join(ROOT, path), "utf8"));
const PLUGIN = "plugins/designmark";

test("one version: package.json, the code and the plugin manifest", () => {
  const pkg = json("package.json");
  assert.equal(VERSION, pkg.version);
  assert.equal(json(`${PLUGIN}/.claude-plugin/plugin.json`).version, pkg.version);
});

test("MCP Registry: server.json matches package.json (name = mcpName, npm identifier and versions)", () => {
  const pkg = json("package.json");
  const server = json("server.json");
  assert.equal(
    server.name,
    pkg.mcpName,
    "the registry verifies mcpName in the published npm package",
  );
  assert.match(server.name, /^io\.github\.[^/]+\/designmark$/);
  assert.equal(server.version, pkg.version);
  assert.equal(server.packages.length, 1);
  assert.equal(server.packages[0].registryType, "npm");
  assert.equal(server.packages[0].identifier, pkg.name);
  assert.equal(server.packages[0].version, pkg.version);
  assert.equal(server.packages[0].transport.type, "stdio");
});

test("package.json: bin, engines, ESM and only two runtime dependencies", () => {
  const pkg = json("package.json");
  assert.equal(pkg.name, "designmark");
  assert.deepEqual(pkg.bin, { designmark: "dist/cli.js" });
  assert.equal(pkg.engines.node, ">=20");
  assert.equal(pkg.type, "module");
  assert.equal(pkg.license, "MIT");
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ["@modelcontextprotocol/sdk", "zod"]);
});

test("Claude Code plugin: marketplace entry, manifest, MCP server and skill", () => {
  const marketplace = json(".claude-plugin/marketplace.json");
  assert.equal(marketplace.name, "designmark");
  assert.equal(marketplace.owner.name, "XECIN Inc.");
  const [entry] = marketplace.plugins;
  assert.equal(entry.name, "designmark");
  assert.equal(entry.source, `./${PLUGIN}`);
  assert.equal(entry.version, undefined, "the version lives in plugin.json only");

  const manifest = json(`${PLUGIN}/.claude-plugin/plugin.json`);
  assert.equal(manifest.name, entry.name, "entry name and manifest name must match");
  assert.deepEqual(json(`${PLUGIN}/.mcp.json`), {
    mcpServers: { designmark: { command: "npx", args: ["-y", "designmark@1", "mcp"] } },
  });

  const skill = readFileSync(join(ROOT, PLUGIN, "skills/designmark/SKILL.md"), "utf8");
  assert.ok(skill.startsWith("---\nname: designmark\n"), "YAML front matter on the first line");
  const front = /^---\n([\s\S]*?)\n---\n/.exec(skill)?.[1] ?? "";
  const description = /^description: (.+)$/m.exec(front)?.[1] ?? "";
  assert.ok(description.length > 50 && description.length <= 1024, description);

  // A plugin root with package.json + a lockfile makes Claude Code install npm packages into the
  // plugin cache; the plugin only needs npx, so its folder holds no package.json.
  assert.ok(!readdirSync(join(ROOT, PLUGIN)).includes("package.json"));
});

test("only `designmark mcp` loads the MCP SDK and zod", () => {
  const dir = join(ROOT, ".test-dist", "src");
  for (const file of listJs(dir)) {
    const rel = relative(dir, file).split(sep).join("/");
    if (rel === "mcp.js") continue;
    const code = readFileSync(file, "utf8");
    const imports = [...code.matchAll(/^import\s[^;]*?from\s+"([^"]+)"/gm)].map((m) => m[1] ?? "");
    for (const specifier of imports) {
      assert.ok(
        !specifier.startsWith("@modelcontextprotocol/") &&
          specifier !== "zod" &&
          !specifier.endsWith("/mcp.js"),
        `${rel} statically imports ${specifier}`,
      );
    }
  }
});

test("README links say utm_source=github; the pack/publish scripts swap it for npm and back", () => {
  const work = tempDir();
  const readmes = ["README.md", "README_ja.md"];
  try {
    for (const file of readmes) {
      const text = readFileSync(join(ROOT, file), "utf8");
      assert.ok(text.includes("utm_source=github&utm_medium=readme&utm_campaign=tools"), file);
      assert.ok(!text.includes("utm_source=npm"), file);
      copyFileSync(join(ROOT, file), join(work, file));
    }
    const script = join(ROOT, "scripts", "readme-utm.mjs");
    const run = (args: string[], npmCommand: string) =>
      execFileSync(process.execPath, [script, ...args], {
        cwd: work,
        env: { ...process.env, npm_command: npmCommand },
      });
    const readme = () => readFileSync(join(work, "README.md"), "utf8");

    run(["npm"], "pack"); // prepack
    assert.ok(readme().includes("utm_source=npm&utm_medium=readme"));
    assert.ok(!readme().includes("utm_source=github"));
    run(["github", "--after-pack"], "publish"); // postpack of `npm publish`: keep it for npm
    assert.ok(readme().includes("utm_source=npm&utm_medium=readme"));
    run(["github"], "publish"); // postpublish
    run(["npm"], "pack");
    run(["github", "--after-pack"], "pack"); // postpack of `npm pack`: restore now
    for (const file of readmes) {
      assert.equal(readFileSync(join(work, file), "utf8"), readFileSync(join(ROOT, file), "utf8"));
    }
  } finally {
    removeDir(work);
  }
});

test("only README.md matches npm's README lookup ({README,README.*}), so npmjs.com shows English", () => {
  const candidates = readdirSync(ROOT).filter((name) => /^readme(\..*)?$/i.test(name));
  assert.deepEqual(candidates, ["README.md"]);
});

function listJs(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listJs(path);
    return name.endsWith(".js") ? [path] : [];
  });
}
