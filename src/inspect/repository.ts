import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export interface ResolvedRepository {
  root: string;
  source: string;
  cleanup: () => void;
}

export function isGitUrl(value: string): boolean {
  return /^(https?:\/\/|git@|ssh:\/\/).+/.test(value) || value.endsWith(".git");
}

export function resolveRepository(input: string): ResolvedRepository {
  if (!isGitUrl(input)) {
    const root = path.resolve(input);
    if (!existsSync(root) || !lstatSync(root).isDirectory()) {
      throw new Error(`Repository path does not exist or is not a directory: ${input}`);
    }
    return { root, source: root, cleanup: () => undefined };
  }

  const destination = mkdtempSync(path.join(tmpdir(), "agent-primer-"));
  try {
    execFileSync("git", ["clone", "--depth", "1", input, destination], { stdio: "pipe" });
  } catch (error) {
    rmSync(destination, { recursive: true, force: true });
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to clone ${input}: ${detail}`);
  }
  return {
    root: destination,
    source: input,
    cleanup: () => rmSync(destination, { recursive: true, force: true }),
  };
}
