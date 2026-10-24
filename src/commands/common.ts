// Helpers shared by the commands: option parsing, ID handling and turning failures into exit codes.

import { parseArgs } from "node:util";
import type { DesignResult, Loaded } from "../api.js";
import type { Context } from "../context.js";
import { CliError, describeError, ExitCode, usageError } from "../errors.js";
import { HttpStatusError } from "../http.js";
import type { Messages } from "../i18n.js";
import { type DesignRef, parseDesignRef } from "../ids.js";

interface OptionSpec {
  readonly type: "string" | "boolean";
  readonly multiple?: boolean;
  readonly short?: string;
}

/** Accepted by every command (--help and --version are handled before the command runs). */
const COMMON_OPTIONS = {
  json: { type: "boolean" },
  lang: { type: "string" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
} as const;

export function parseCommand<const T extends Record<string, OptionSpec>>(
  ctx: Context,
  args: readonly string[],
  options: T,
) {
  try {
    return parseArgs({
      args: [...args],
      options: { ...COMMON_OPTIONS, ...options },
      allowPositionals: true,
      strict: true,
    });
  } catch (error) {
    throw toUsageError(error, ctx.msg);
  }
}

function toUsageError(error: unknown, msg: Messages): CliError {
  const code = (error as { code?: unknown }).code;
  const text = describeError(error);
  const option = /'(-{1,2}[^' ]+)/.exec(text)?.[1] ?? text;
  if (code === "ERR_PARSE_ARGS_UNKNOWN_OPTION") {
    return usageError(`${msg.unknownOption(option)}\n${msg.seeHelp}`);
  }
  if (code === "ERR_PARSE_ARGS_INVALID_OPTION_VALUE") {
    return usageError(`${msg.badOptionValue(option)}\n${msg.seeHelp}`);
  }
  return usageError(`${text}\n${msg.seeHelp}`);
}

/** Exactly one ID (show, open). */
export function singleRef(ctx: Context, positionals: readonly string[]): DesignRef {
  const [input, extra] = positionals;
  if (input === undefined) throw usageError(`${ctx.msg.needOneId}\n${ctx.msg.seeHelp}`);
  if (extra !== undefined) throw usageError(ctx.msg.unexpectedArgument(extra));
  return toRef(ctx, input);
}

/** An ID or a designmark URL; anything else is a usage error (spec §3.2). */
export function toRef(ctx: Context, input: string): DesignRef {
  const ref = parseDesignRef(input, new URL(ctx.api().baseUrl).host);
  if (!ref) throw usageError(ctx.msg.invalidId(input));
  return ref;
}

/** Exit code and message for a DESIGN.md that could not be fetched (spec §3.1, §3.5). */
export function designFailure(
  result: Extract<DesignResult, { ok: false }>,
  msg: Messages,
): CliError {
  if (result.reason === "withdrawn")
    return new CliError(msg.notFound(result.ref.id), ExitCode.notFound);
  if (result.reason === "blocked") return new CliError(msg.unavailable, ExitCode.unavailable);
  return new CliError(msg.failed(result.detail), ExitCode.failure);
}

/** Exit code and message for an index that could not be loaded and is not cached. */
export function indexFailure(error: unknown, msg: Messages): CliError {
  if (error instanceof HttpStatusError && [403, 404, 429].includes(error.status)) {
    return new CliError(
      `${msg.indexUnavailable(error.message)}${msg.unavailable}`,
      ExitCode.unavailable,
    );
  }
  return new CliError(msg.failed(describeError(error)), ExitCode.failure);
}

/** Spec §3.8: say when results come from an expired cache (one line per distinct fetch time). */
export function warnIfStale(ctx: Context, ...loaded: (Loaded<unknown> | undefined)[]): void {
  const times = new Set(loaded.filter((entry) => entry?.stale).map((entry) => entry?.fetchedAt));
  for (const time of times) if (time) ctx.warn(ctx.msg.stale(time));
}

export function printJson(ctx: Context, value: unknown): void {
  ctx.io.stdout(`${JSON.stringify(value, null, 2)}\n`);
}

export function printLines(ctx: Context, lines: readonly string[]): void {
  ctx.io.stdout(`${lines.join("\n")}\n`);
}
