import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import type { VerificationAttempt } from "../types.ts";

const DEFAULT_TASK = "Run the full test suite and report whether it passed.";

export interface RunnerOptions {
  repositoryRoot: string;
  agentsMd: string;
  task?: string;
  attempt: number;
  codexCommand?: string;
}

/**
 * Starts a fresh Codex CLI process in a disposable repository copy. No inspection
 * findings are sent to the child: its prompt contains only the task and AGENTS.md.
 */
export function runIsolatedVerification(options: RunnerOptions): VerificationAttempt {
  const workspace = mkdtempSync(path.join(tmpdir(), "agent-primer-verify-"));
  const repo = path.join(workspace, "repository");
  const task = options.task ?? DEFAULT_TASK;
  const command = resolveCodexCommand(options.codexCommand);
  try {
    cpSync(options.repositoryRoot, repo, { recursive: true, filter: (source) => !shouldIgnore(source) });
    writeFileSync(path.join(repo, "AGENTS.md"), options.agentsMd, "utf8");
    const prompt = verifierPrompt(task, options.agentsMd);
    const args = ["exec", "--json", "--skip-git-repo-check", "--sandbox", "workspace-write", "-"];
    const launch = windowsCommandShim(command, args);
    const result = spawnSync(launch.file, launch.args, {
      cwd: repo,
      encoding: "utf8",
      input: prompt,
      timeout: 120_000,
      env: minimalEnvironment(),
      windowsHide: true,
    });
    const stdout = result.stdout ?? "";
    const stderr = result.stderr ?? "";
    const startFailure = result.error?.message;
    const exitCode = typeof result.status === "number" ? result.status : null;
    const attempt: VerificationAttempt = {
      number: options.attempt,
      task,
      command: [command, ...args],
      exitCode,
      stdout,
      stderr: startFailure ? `${stderr}${stderr ? "\n" : ""}${startFailure}` : stderr,
      status: startFailure ? "unavailable" : "failed",
      gaps: [],
    };
    return attempt;
  } finally {
    try {
      rmSync(workspace, { recursive: true, force: true, maxRetries: 2, retryDelay: 200 });
    } catch {
      // A timed-out Windows child can retain a handle briefly. The transcript is more important than eager temp cleanup.
    }
  }
}

function resolveCodexCommand(configured: string | undefined): string {
  if (configured) return configured;
  const localCommand = path.join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "codex.cmd" : "codex");
  return existsSync(localCommand) ? localCommand : "codex";
}

function windowsCommandShim(command: string, args: string[]): { file: string; args: string[] } {
  if (process.platform !== "win32" || !command.toLowerCase().endsWith(".cmd")) return { file: command, args };
  // Passing the shim and its arguments separately lets cmd.exe apply Windows quoting correctly.
  return { file: process.env.ComSpec ?? "cmd.exe", args: ["/d", "/c", command, ...args] };
}

function verifierPrompt(task: string, agentsMd: string): string {
  return `You are a fresh, independent verification agent. You have no prior context about this repository.\n\nTask: ${task}\n\nUse ONLY the AGENTS.md below as operational guidance. You may inspect and execute commands in the repository, but do not use README files, package manifests, CI configuration, or outside knowledge to choose commands. Do not edit project files. Run the task if the AGENTS.md is sufficient. In your final response include exactly one marker: VERIFICATION_RESULT: PASS only if the task actually completed with a zero exit code; otherwise VERIFICATION_RESULT: FAIL. Include the command output you relied on.\n\n--- AGENTS.md ---\n${agentsMd}\n--- END AGENTS.md ---`;
}

function minimalEnvironment(): NodeJS.ProcessEnv {
  const keys = process.platform === "win32" ? ["PATH", "SystemRoot", "ComSpec", "PATHEXT", "TEMP", "TMP", "USERPROFILE", "APPDATA", "LOCALAPPDATA"] : ["PATH", "HOME", "TMPDIR", "LANG"];
  return Object.fromEntries(keys.flatMap((key) => process.env[key] === undefined ? [] : [[key, process.env[key]]]));
}

function shouldIgnore(source: string): boolean {
  const name = path.basename(source);
  return new Set([".git", "node_modules", "dist", "build", "coverage", ".next", ".venv", "venv", "__pycache__"]).has(name);
}
