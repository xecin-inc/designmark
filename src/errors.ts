/** Exit codes (spec §3.1). */
export const ExitCode = {
  /** Success. */
  ok: 0,
  /** Failure: a file could not be written, or an unexpected network failure. */
  failure: 1,
  /** Wrong usage: unknown option, invalid ID, more than 3 IDs, … */
  usage: 2,
  /** Not in the latest index: withdrawn, or a wrong ID. */
  notFound: 3,
  /** Temporarily unavailable (rate limited or blocked). Wait about 5 minutes. */
  unavailable: 4,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

/** An error whose message is shown to the user as is; the command ends with `code`. */
export class CliError extends Error {
  readonly code: ExitCode;

  constructor(message: string, code: ExitCode) {
    super(message);
    this.name = "CliError";
    this.code = code;
  }
}

export function usageError(message: string): CliError {
  return new CliError(message, ExitCode.usage);
}

/** A short, single-line description of any thrown value. */
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
