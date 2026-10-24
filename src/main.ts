// Argument handling and dispatch (spec §3.1). Commands are imported on demand, so only
// `designmark mcp` loads the MCP SDK.

import { type Context, createContext, type Io, processIo } from "./context.js";
import { CliError, describeError, ExitCode } from "./errors.js";
import { type CommandName, commandHelp, globalHelp } from "./help.js";
import { detectLang, langFlag, type Messages, messages } from "./i18n.js";
import { VERSION } from "./version.js";

interface CommandModule {
  run(ctx: Context, args: readonly string[]): Promise<number>;
}

const COMMANDS = new Map<CommandName, () => Promise<CommandModule>>([
  ["search", () => import("./commands/search.js")],
  ["show", () => import("./commands/show.js")],
  ["add", () => import("./commands/add.js")],
  ["packs", () => import("./commands/packs.js")],
  ["open", () => import("./commands/open.js")],
  ["mcp", () => import("./commands/mcp.js")],
]);

export async function main(argv: readonly string[], io: Io = processIo()): Promise<number> {
  const lang = detectLang(argv, io.env);
  const msg = messages(lang);
  try {
    const flag = langFlag(argv);
    if (flag !== undefined && flag !== "ja" && flag !== "en") {
      throw new CliError(msg.badLang, ExitCode.usage);
    }
    const options = argv.slice(0, endOfOptions(argv));
    if (options.includes("--version") || options.includes("-v")) {
      io.stdout(`${VERSION}\n`);
      return ExitCode.ok;
    }
    const wantsHelp = options.includes("--help") || options.includes("-h");
    const { command, rest } = splitCommand(argv);
    if (command === undefined) {
      if (wantsHelp) {
        io.stdout(globalHelp(lang));
        return ExitCode.ok;
      }
      io.stderr(globalHelp(lang));
      return ExitCode.usage;
    }
    const load = COMMANDS.get(command as CommandName);
    if (!load) throw new CliError(`${msg.unknownCommand(command)}\n${msg.seeHelp}`, ExitCode.usage);
    if (wantsHelp) {
      io.stdout(commandHelp(command as CommandName, lang));
      return ExitCode.ok;
    }
    const { run } = await load();
    return await run(createContext(io, lang), rest);
  } catch (error) {
    return report(error, io, msg);
  }
}

function endOfOptions(argv: readonly string[]): number {
  const index = argv.indexOf("--");
  return index < 0 ? argv.length : index;
}

/** The first argument that is not an option (or the value of --lang) is the command. */
function splitCommand(argv: readonly string[]): { command?: string; rest: string[] } {
  for (let i = 0; i < endOfOptions(argv); i++) {
    const arg = argv[i] as string;
    if (arg === "--lang") {
      i++;
      continue;
    }
    if (arg.startsWith("-")) continue;
    return { command: arg, rest: [...argv.slice(0, i), ...argv.slice(i + 1)] };
  }
  return { rest: [...argv] };
}

function report(error: unknown, io: Io, msg: Messages): number {
  if (error instanceof CliError) {
    io.stderr(`${error.message}\n`);
    return error.code;
  }
  io.stderr(`${msg.unexpected(describeError(error))}\n`);
  return ExitCode.failure;
}
