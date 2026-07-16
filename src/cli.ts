import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { draftAgentsMd } from "./agents-md/draft.ts";
import { inspectRepository } from "./inspect/detectors.ts";
import { primeRepository, renderReport } from "./prime.ts";
import { resolveRepository } from "./inspect/repository.ts";

interface CommandOptions { task?: string; maxAttempts?: number; codexCommand?: string; }

function usage(): string {
  return [
    "Usage:",
    "  agent-primer scan <repo-path-or-git-url>",
    "  agent-primer verify <repo-path-or-git-url> [--task <text>] [--codex-command <path>]",
    "  agent-primer prime <repo-path-or-git-url> [--task <text>] [--max-attempts 1..3] [--codex-command <path>]",
    "",
    "scan prints an AGENTS.md draft. verify performs one isolated fresh-agent test without writing files. prime verifies, repairs up to three times, prints a verbatim report, and writes AGENTS.md for local repositories.",
  ].join("\n");
}

function parseOptions(values: string[]): CommandOptions {
  const options: CommandOptions = {};
  for (let index = 0; index < values.length; index += 2) {
    const flag = values[index];
    const value = values[index + 1];
    if (!value) throw new Error(`Missing value for ${flag}`);
    if (flag === "--task") options.task = value;
    else if (flag === "--max-attempts") {
      const attempts = Number(value);
      if (!Number.isInteger(attempts) || attempts < 1 || attempts > 3) throw new Error("--max-attempts must be an integer from 1 to 3");
      options.maxAttempts = attempts;
    } else if (flag === "--codex-command") options.codexCommand = value;
    else throw new Error(`Unknown option: ${flag}`);
  }
  return options;
}

function withRepository(input: string, action: (root: string, source: string) => number): number {
  let repository: ReturnType<typeof resolveRepository> | undefined;
  try {
    repository = resolveRepository(input);
    return action(repository.root, repository.source);
  } finally {
    repository?.cleanup();
  }
}

function main(arguments_: string[]): number {
  const [command, input, ...optionValues] = arguments_;
  if (command === "--help" || command === "-h" || !command) { console.log(usage()); return command ? 0 : 1; }
  if (!input || !["scan", "verify", "prime"].includes(command)) { console.error(usage()); return 1; }
  try {
    const options = parseOptions(optionValues);
    if (command === "scan") {
      if (optionValues.length) throw new Error("scan does not accept options");
      return withRepository(input, (root, source) => { console.log(draftAgentsMd(inspectRepository(root, source))); return 0; });
    }
    return withRepository(input, (root, source) => {
      if (command === "verify" && !existsSync(path.join(root, "AGENTS.md"))) throw new Error("verify requires an existing AGENTS.md; run `agent-primer scan` or `agent-primer prime` first.");
      const result = primeRepository({ root, source, task: options.task, maxAttempts: command === "verify" ? 1 : options.maxAttempts, codexCommand: options.codexCommand, write: command === "prime" });
      console.log(renderReport(result));
      return result.attempts.at(-1)?.status === "passed" ? 0 : 2;
    });
  } catch (error) {
    console.error(`agent-primer: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

process.exitCode = main(process.argv.slice(2));
