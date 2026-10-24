// `designmark open <ID>` (spec §3.6): opens the detail page with the system's opener (Windows
// `start`, macOS `open`, Linux `xdg-open`) and prints the URL when that is not possible.

import { spawn } from "node:child_process";
import type { Context } from "../context.js";
import { parseCommand, singleRef } from "./common.js";

/** Characters that are safe inside a quoted cmd.exe argument (no quote, %, ^, &, |, <, >). */
const SAFE_URL = /^https?:\/\/[\w.~:/?#@!$'()*+,;=[\]-]+$/;
const OPENER_TIMEOUT_MS = 3000;

export async function run(ctx: Context, args: readonly string[]): Promise<number> {
  const { positionals } = parseCommand(ctx, args, {});
  const ref = singleRef(ctx, positionals);
  const url = ctx.api().pageUrl(ref);
  // BROWSER=none (a common convention) only prints the URL.
  if (ctx.io.env.BROWSER === "none") {
    ctx.io.stdout(`${url}\n`);
    return 0;
  }
  const opened = await openInBrowser(url, ctx.io.platform);
  ctx.io.stdout(`${opened ? ctx.msg.opened(url) : ctx.msg.openFailed(url)}\n`);
  return 0;
}

export function openerCommand(
  url: string,
  platform: NodeJS.Platform,
): { command: string; args: string[] } {
  if (platform === "win32") {
    // cmd /s strips the outer quotes: start "" "<url>"
    return { command: "cmd.exe", args: ["/d", "/s", "/c", `"start "" "${url}""`] };
  }
  if (platform === "darwin") return { command: "open", args: [url] };
  return { command: "xdg-open", args: [url] };
}

function openInBrowser(url: string, platform: NodeJS.Platform): Promise<boolean> {
  if (!SAFE_URL.test(url)) return Promise.resolve(false);
  const { command, args } = openerCommand(url, platform);
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: "ignore",
      detached: platform !== "win32",
      windowsHide: true,
      windowsVerbatimArguments: platform === "win32",
    });
    const timer = setTimeout(() => {
      child.unref();
      resolve(true);
    }, OPENER_TIMEOUT_MS);
    child.once("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}
