import type { RepositoryFacts } from "../types.ts";

/** Adds only facts observed during repository inspection or verification. */
export function patchAgentsMd(document: string, facts: RepositoryFacts, gaps: string[]): string {
  let next = document;
  const additions: string[] = [];

  if (gaps.some((gap) => gap.includes("test command")) && facts.testCommands.length > 0) {
    for (const command of facts.testCommands) {
      if (!next.includes(command)) next = insertInSection(next, "Test", `\`\`\`sh\n${command}\n\`\`\``);
    }
  }
  if (gaps.some((gap) => gap.includes("dependencies") || gap.includes("command failed")) && facts.setupCommands.length > 0) {
    for (const command of facts.setupCommands) {
      if (!next.includes(command)) next = insertInSection(next, "Setup", `\`\`\`sh\n${command}\n\`\`\``);
    }
  }
  if (gaps.some((gap) => gap.includes("environment")) && facts.environmentFiles.length > 0) {
    const fileNames = facts.environmentFiles.map((file) => `\`${file}\``).join(", ");
    const keys = facts.environmentVariables.length ? ` Configure: ${facts.environmentVariables.map((name) => `\`${name}\``).join(", ")}.` : "";
    const note = `Before running commands, configure local values from ${fileNames}; do not commit secrets.${keys}`;
    if (!next.includes(note)) next = insertInSection(next, "Setup", note);
  }

  for (const gap of gaps) {
    const note = verificationNote(gap);
    if (note && !next.includes(note)) additions.push(`- ${note}`);
  }
  if (additions.length) {
    const heading = "## Verification notes";
    next = next.includes(heading) ? `${next.trimEnd()}\n${additions.join("\n")}\n` : `${next.trimEnd()}\n\n${heading}\n${additions.join("\n")}\n`;
  }
  return limitLines(next, 150);
}

function insertInSection(document: string, section: string, addition: string): string {
  const heading = `## ${section}`;
  const start = document.indexOf(heading);
  if (start === -1) return `${document.trimEnd()}\n\n${heading}\n${addition}\n`;
  const afterHeading = start + heading.length;
  return `${document.slice(0, afterHeading)}\n${addition}${document.slice(afterHeading)}`;
}

function verificationNote(gap: string): string | undefined {
  if (gap.includes("test command")) return "Use the exact test command listed above; do not infer a replacement test runner.";
  if (gap.includes("dependencies")) return "Install dependencies with the detected setup command before running build or test commands.";
  if (gap.includes("environment")) return "Environment configuration is required before the affected command can run.";
  if (gap.includes("clarification")) return "When a command is unclear, follow the explicit commands in this document rather than requesting undocumented project details.";
  if (gap.includes("command failed")) return "Read the captured failure output before changing configuration; do not claim a successful test run after a non-zero exit.";
  return undefined;
}

function limitLines(document: string, maxLines: number): string {
  const lines = document.trimEnd().split("\n");
  if (lines.length <= maxLines) return `${lines.join("\n")}\n`;
  return `${lines.slice(0, maxLines - 1).join("\n")}\n- Further verification notes were omitted to keep this file concise.\n`;
}
