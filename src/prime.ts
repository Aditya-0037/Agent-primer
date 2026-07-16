import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { draftAgentsMd } from "./agents-md/draft.ts";
import { patchAgentsMd } from "./agents-md/patch.ts";
import { inspectRepository } from "./inspect/detectors.ts";
import { isGitUrl } from "./inspect/repository.ts";
import { renderReport } from "./report/render.ts";
import { scoreAttempt } from "./score/evaluate.ts";
import type { PrimeResult } from "./types.ts";
import { runIsolatedVerification } from "./verify/isolated-runner.ts";

export interface PrimeOptions { root: string; source: string; task?: string; maxAttempts?: number; codexCommand?: string; write?: boolean; }

export function primeRepository(options: PrimeOptions): PrimeResult {
  const facts = inspectRepository(options.root, options.source);
  const agentsPath = path.join(options.root, "AGENTS.md");
  const before = existsSync(agentsPath) ? readFileSync(agentsPath, "utf8") : draftAgentsMd(facts);
  let current = before;
  const attempts = [];
  const task = options.task ?? "Run the full test suite and report whether it passed.";
  const limit = Math.max(1, Math.min(options.maxAttempts ?? 3, 3));
  for (let number = 1; number <= limit; number++) {
    const attempt = scoreAttempt(runIsolatedVerification({ repositoryRoot: options.root, agentsMd: current, task, attempt: number, codexCommand: options.codexCommand }), facts.testCommands);
    attempts.push(attempt);
    if (attempt.status === "passed" || attempt.status === "unavailable") break;
    const patched = patchAgentsMd(current, facts, attempt.gaps);
    if (patched === current) break;
    current = patched;
  }
  const writable = options.write !== false && !isGitUrl(options.source);
  if (writable) writeFileSync(agentsPath, current, "utf8");
  return { source: options.source, task, before, after: current, attempts, wroteAgentsFile: writable };
}

export { renderReport };
