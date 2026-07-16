import type { PrimeResult, VerificationAttempt } from "../types.ts";

export function renderReport(result: PrimeResult): string {
  const success = result.attempts.at(-1)?.status === "passed";
  const lines = [
    "# Agent-Primer verification report",
    "",
    `- Repository: \`${result.source}\``,
    `- Task: ${result.task}`,
    `- Outcome: **${success ? "passed" : "not verified"}** after ${result.attempts.length} attempt(s).`,
    `- AGENTS.md ${result.wroteAgentsFile ? "was written to the local repository" : "was not written (remote source or verification-only run)"}.`,
    "",
    "## AGENTS.md diff",
    "```diff",
    unifiedDiff(result.before, result.after),
    "```",
    "",
    "## Verbatim verification attempts",
    "",
    ...result.attempts.flatMap(renderAttempt),
    "",
    "## Final AGENTS.md",
    "```md",
    result.after.trimEnd(),
    "```",
    "",
  ];
  return lines.join("\n");
}

function renderAttempt(attempt: VerificationAttempt): string[] {
  return [
    `### Attempt ${attempt.number}: ${attempt.status.toUpperCase()}`,
    "",
    `Exit code: ${attempt.exitCode ?? "not started"}`,
    `Detected gaps: ${attempt.gaps.length ? attempt.gaps.join("; ") : "none"}`,
    "",
    "```text",
    `$ ${attempt.command.join(" ")}`,
    "--- stdout ---",
    attempt.stdout || "<empty>",
    "--- stderr ---",
    attempt.stderr || "<empty>",
    "```",
    "",
  ];
}

/** A compact, deterministic line diff suited to concise AGENTS.md files. */
export function unifiedDiff(before: string, after: string): string {
  const oldLines = before.trimEnd().split("\n");
  const newLines = after.trimEnd().split("\n");
  const table = Array.from({ length: oldLines.length + 1 }, () => Array<number>(newLines.length + 1).fill(0));
  for (let i = oldLines.length - 1; i >= 0; i--) for (let j = newLines.length - 1; j >= 0; j--) table[i][j] = oldLines[i] === newLines[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  const output = ["--- AGENTS.md (before)", "+++ AGENTS.md (after)"];
  let i = 0, j = 0;
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) { output.push(` ${oldLines[i++]}`); j++; }
    else if (j < newLines.length && (i === oldLines.length || table[i][j + 1] >= table[i + 1][j])) output.push(`+${newLines[j++]}`);
    else output.push(`-${oldLines[i++]}`);
  }
  return output.join("\n");
}
