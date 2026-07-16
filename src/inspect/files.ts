import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const IGNORED_DIRECTORIES = new Set([
  ".git", "node_modules", ".next", ".nuxt", "dist", "build", "coverage", ".venv", "venv", "__pycache__", ".tox", ".mypy_cache",
]);
const MAX_FILES = 600;

export function listProjectFiles(root: string): string[] {
  const files: string[] = [];
  const walk = (relative: string): void => {
    if (files.length >= MAX_FILES) return;
    for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true })) {
      if (files.length >= MAX_FILES) return;
      const child = path.join(relative, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) walk(child);
      } else if (entry.isFile()) {
        files.push(child.replaceAll("\\", "/"));
      }
    }
  };
  walk("");
  return files;
}

export function readText(root: string, relativePath: string): string | undefined {
  try {
    return readFileSync(path.join(root, relativePath), "utf8");
  } catch {
    return undefined;
  }
}

export function topLevelDirectories(root: string): string[] {
  return readdirSync(root)
    .filter((name) => !name.startsWith(".") && !IGNORED_DIRECTORIES.has(name))
    .filter((name) => statSync(path.join(root, name)).isDirectory())
    .slice(0, 12);
}
