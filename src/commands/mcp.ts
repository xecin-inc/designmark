// `designmark mcp` (spec §3.6, §4): the only command that loads the MCP SDK, and only now.

import type { Context } from "../context.js";
import { usageError } from "../errors.js";
import { parseCommand } from "./common.js";

export async function run(ctx: Context, args: readonly string[]): Promise<number> {
  const { positionals } = parseCommand(ctx, args, {});
  if (positionals[0] !== undefined) throw usageError(ctx.msg.unexpectedArgument(positionals[0]));
  const { serveStdio } = await import("../mcp.js");
  await serveStdio(ctx.io.env, ctx.lang);
  return 0;
}
