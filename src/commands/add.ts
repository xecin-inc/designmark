// `designmark add <ID...>` (spec §3.5).

import { resolve } from "node:path";
import type { Context } from "../context.js";
import { CliError, describeError, ExitCode, usageError } from "../errors.js";
import type { DesignRef } from "../ids.js";
import {
  addClaudeMdImport,
  type ClaudeMdChange,
  fileExists,
  isDirectory,
  planTargets,
  type Target,
  writeDesign,
} from "../project.js";
import { designFailure, parseCommand, printJson, toRef } from "./common.js";

/** Designs per run (spec §3.5 step 1, terms of use article 2 paragraph 3). */
export const MAX_IDS = 3;

type Status = "written" | "withdrawn" | "blocked" | "failed" | "skipped";

interface Outcome {
  readonly target: Target;
  readonly status: Status;
}

export async function run(ctx: Context, args: readonly string[]): Promise<number> {
  const { values, positionals } = parseCommand(ctx, args, {
    dir: { type: "string" },
    out: { type: "string" },
    force: { type: "boolean" },
    "claude-md": { type: "boolean" },
  });
  const { msg } = ctx;
  const json = values.json === true;
  const force = values.force === true;

  if (positionals.length === 0) throw usageError(`${msg.needIds}\n${msg.seeHelp}`);
  if (positionals.length > MAX_IDS) throw usageError(msg.tooMany);
  const refs = unique(positionals.map((input) => toRef(ctx, input)));
  if (values.out !== undefined && refs.length > 1) throw usageError(msg.outWithMany);

  const baseDir = resolve(ctx.io.cwd, values.dir ?? ".");
  if (!isDirectory(baseDir)) throw new CliError(msg.dirMissing(baseDir), ExitCode.failure);
  const targets = planTargets(baseDir, refs, values.out);

  // Step 3 is checked before any request, so that nothing is fetched in vain.
  if (!force) {
    const existing = targets.filter((target) => fileExists(target.path));
    if (existing.length > 0) {
      throw new CliError(
        existing.map((target) => msg.exists(target.rel)).join("\n"),
        ExitCode.failure,
      );
    }
  }

  // Step 2: one at a time (the HTTP client keeps them at least 1 second apart).
  const api = ctx.api();
  const outcomes: Outcome[] = [];
  let stop: CliError | undefined;
  for (const target of targets) {
    if (stop) {
      outcomes.push({ target, status: "skipped" });
      continue;
    }
    const result = await api.design(target.ref);
    if (!result.ok) {
      outcomes.push({ target, status: result.reason });
      if (result.reason === "withdrawn") ctx.warn(msg.notFound(target.ref.id));
      else stop = designFailure(result, msg);
      continue;
    }
    try {
      writeDesign(target, result.bytes, force);
    } catch (error) {
      outcomes.push({ target, status: "failed" });
      stop =
        (error as NodeJS.ErrnoException).code === "EEXIST"
          ? new CliError(msg.exists(target.rel), ExitCode.failure)
          : new CliError(msg.writeFailed(target.rel, describeError(error)), ExitCode.failure);
      continue;
    }
    outcomes.push({ target, status: "written" });
    if (!json) ctx.io.stdout(`${msg.saved(target.rel, target.ref.id)}\n`);
  }

  const written = outcomes.filter((o) => o.status === "written").map((o) => o.target);
  const claudeMd = values["claude-md"] ? updateClaudeMd(ctx, baseDir, written, json) : undefined;
  if (!json && !values["claude-md"]) {
    for (const target of written) ctx.io.stdout(`${msg.claudeHint(`@${target.rel}`)}\n`);
  }

  // Step 6: the notice once (and the license for pattern packs).
  const notes: string[] = [];
  if (written.some((target) => target.ref.kind === "lp")) notes.push(msg.notice);
  if (written.some((target) => target.ref.kind === "pack")) notes.push(msg.packLicense);

  if (stop) {
    ctx.warn(stop.message);
    const skipped = outcomes.filter((o) => o.status === "skipped").map((o) => o.target.ref.id);
    if (skipped.length > 0) ctx.warn(msg.skippedRest(skipped.join(", ")));
  }

  if (json) {
    printJson(ctx, {
      results: outcomes.map((o) => ({
        id: o.target.ref.id,
        kind: o.target.ref.kind,
        status: o.status,
        path: o.target.rel,
      })),
      claude_md: claudeMd ?? null,
      notices: notes,
    });
  } else if (notes.length > 0) {
    ctx.io.stdout(`${notes.join("\n")}\n`);
  }

  if (stop) return stop.code;
  return outcomes.some((o) => o.status === "withdrawn") ? ExitCode.notFound : ExitCode.ok;
}

function updateClaudeMd(
  ctx: Context,
  baseDir: string,
  written: readonly Target[],
  json: boolean,
): ClaudeMdChange[] {
  const changes: ClaudeMdChange[] = [];
  for (const target of written) {
    const line = `@${target.rel}`;
    let change: ClaudeMdChange;
    try {
      change = addClaudeMdImport(baseDir, target.rel);
    } catch (error) {
      throw new CliError(ctx.msg.writeFailed("CLAUDE.md", describeError(error)), ExitCode.failure);
    }
    changes.push(change);
    if (json) continue;
    const text =
      change === "created"
        ? ctx.msg.claudeCreated(line)
        : change === "added"
          ? ctx.msg.claudeAdded(line)
          : ctx.msg.claudePresent(line);
    ctx.io.stdout(`${text}\n`);
  }
  return changes;
}

function unique(refs: readonly DesignRef[]): DesignRef[] {
  const seen = new Set<string>();
  return refs.filter((ref) => !seen.has(ref.id) && seen.add(ref.id) !== undefined);
}
