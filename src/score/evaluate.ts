import type { VerificationAttempt, VerificationStatus } from "../types.ts";

export function scoreAttempt(attempt: VerificationAttempt, documentedTestCommands: string[]): VerificationAttempt {
  const transcript = `${attempt.stdout}\n${attempt.stderr}`;
  const lower = transcript.toLowerCase();
  const gaps: string[] = [];
  let status: VerificationStatus = attempt.status;
  if (status === "unavailable") {
    gaps.push("verification agent unavailable");
  } else if (/(api\.openai\.com|stream disconnected before completion|socket .*forbidden|os error 10013)/i.test(transcript)) {
    status = "unavailable";
    gaps.push("verification agent network unavailable");
  } else {
    const passMarker = /VERIFICATION_RESULT:\s*PASS\b/.test(transcript);
    const failMarker = /VERIFICATION_RESULT:\s*FAIL\b/.test(transcript);
    const commandEvidence = executedCommands(attempt.stdout).some((executed) => documentedTestCommands.some((documented) => executed.includes(documented)));
    if (attempt.exitCode !== 0) gaps.push("verification command failed");
    if (/(environment variable|env(?:ironment)? .*?(?:missing|required)|(?:[A-Z][A-Z0-9_]{2,}).{0,40}(?:not set|required))/i.test(transcript)) gaps.push("missing environment guidance");
    if (/(command not found|not recognized as|no such file or directory|module not found|cannot find module|no module named)/i.test(transcript)) gaps.push("dependencies or command unavailable");
    if (/(please provide|need (?:more )?(?:information|details)|clarif)/i.test(transcript)) gaps.push("agent requested clarification");
    if (!commandEvidence) gaps.push("no documented test command execution was captured");
    if (!passMarker || failMarker) gaps.push("agent did not report a verified pass");
    status = gaps.length === 0 ? "passed" : "failed";
  }
  return { ...attempt, status, gaps: unique(gaps) };
}

function unique(values: string[]): string[] { return [...new Set(values)]; }

function executedCommands(jsonLines: string): string[] {
  const commands: string[] = [];
  for (const line of jsonLines.split(/\r?\n/)) {
    try {
      const event = JSON.parse(line) as { type?: string; item?: { type?: string; command?: string } };
      if (event.type === "item.completed" && event.item?.type === "command_execution" && typeof event.item.command === "string") commands.push(event.item.command);
    } catch {
      // A malformed progress line is retained verbatim in the report but is not evidence of command execution.
    }
  }
  return commands;
}
