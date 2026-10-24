// cli.ts imports this module before anything else, so it must not import other modules and must
// only use syntax and APIs that old Node.js versions understand.

export const MIN_NODE_MAJOR = 20;

/** Returns the message to show when `version` (e.g. "v18.19.0") is too old, otherwise undefined. */
export function nodeVersionProblem(version: string, lang: "ja" | "en"): string | undefined {
  const major = Number.parseInt(version.replace(/^v/, ""), 10);
  if (major >= MIN_NODE_MAJOR) return undefined;
  return lang === "ja"
    ? `designmark には Node.js ${MIN_NODE_MAJOR} 以上が必要です（今の版: ${version}）。`
    : `designmark requires Node.js ${MIN_NODE_MAJOR} or later (current: ${version}).`;
}
