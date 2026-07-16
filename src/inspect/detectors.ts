import { readText, listProjectFiles, topLevelDirectories } from "./files.ts";
import type { PackageManager, RepositoryFacts } from "../types.ts";

interface NodeManifest {
  scripts?: Record<string, string>;
  packageManager?: string;
  engines?: Record<string, string>;
}

const ENV_EXCLUSIONS = new Set(["NODE_ENV", "PATH", "HOME", "USER", "TODO", "FIXME", "README", "AGENTS"]);

export function inspectRepository(root: string, source: string): RepositoryFacts {
  const files = listProjectFiles(root);
  const fileSet = new Set(files);
  const languages = detectLanguages(files);
  const packageManager = detectPackageManager(files, readText(root, "package.json"));
  const node = readNodeManifest(readText(root, "package.json"));
  const environmentFiles = files.filter((file) => /(^|\/)\.env(\.|$)|env\.example$|example\.env$/i.test(file));
  const environmentVariables = detectEnvironmentVariables(root, environmentFiles);
  const setupCommands: string[] = [];
  const buildCommands: string[] = [];
  const testCommands: string[] = [];
  const runCommands: string[] = [];
  const conventions: string[] = [];
  const gotchas: string[] = [];

  if (fileSet.has("package.json")) {
    addNodeCommands(packageManager, node, files, setupCommands, buildCommands, testCommands, runCommands, conventions, gotchas);
  }
  if (fileSet.has("pyproject.toml") || fileSet.has("requirements.txt") || fileSet.has("setup.py") || fileSet.has("pytest.ini")) {
    addPythonCommands(packageManager, root, files, setupCommands, buildCommands, testCommands, runCommands, conventions, gotchas);
  }
  if (fileSet.has("Cargo.toml")) addRustCommands(setupCommands, buildCommands, testCommands, runCommands);
  if (fileSet.has("go.mod")) addGoCommands(setupCommands, buildCommands, testCommands, runCommands);
  if (testCommands.length === 0) gotchas.push("No test command was detected; inspect project documentation before claiming tests passed.");
  if (environmentVariables.length > 0) gotchas.push("Required environment values are not inferred; use local secrets and never commit a populated .env file.");

  return {
    root, source, languages: languages.length ? languages : ["Unknown"], packageManager,
    setupCommands: unique(setupCommands), buildCommands: unique(buildCommands), testCommands: unique(testCommands), runCommands: unique(runCommands),
    environmentFiles, environmentVariables, topLevelDirectories: topLevelDirectories(root), entryPoints: detectEntryPoints(files, node),
    conventions: unique(conventions), gotchas: unique(gotchas),
  };
}

function detectLanguages(files: string[]): string[] {
  const kinds: Array<[string, RegExp]> = [["TypeScript", /\.tsx?$/], ["JavaScript", /\.[cm]?jsx?$/], ["Python", /\.py$/], ["Go", /\.go$/], ["Rust", /\.rs$/], ["Java", /\.java$/], ["Ruby", /\.rb$/]];
  return kinds.filter(([, pattern]) => files.some((file) => pattern.test(file))).map(([name]) => name);
}

function detectPackageManager(files: string[], packageText: string | undefined): PackageManager {
  if (files.includes("pnpm-lock.yaml")) return "pnpm";
  if (files.includes("yarn.lock")) return "yarn";
  if (files.includes("bun.lockb") || files.includes("bun.lock")) return "bun";
  if (files.includes("package-lock.json") || files.includes("npm-shrinkwrap.json")) return "npm";
  if (files.includes("poetry.lock")) return "poetry";
  if (files.includes("uv.lock")) return "uv";
  if (files.includes("requirements.txt") || files.includes("pyproject.toml")) return "pip";
  if (packageText) return "npm";
  return "unknown";
}

function readNodeManifest(text: string | undefined): NodeManifest | undefined {
  if (!text) return undefined;
  try { return JSON.parse(text) as NodeManifest; } catch { return undefined; }
}

function addNodeCommands(manager: PackageManager, node: NodeManifest | undefined, files: string[], setup: string[], build: string[], test: string[], run: string[], conventions: string[], gotchas: string[]): void {
  const command = manager === "pnpm" ? "pnpm" : manager === "yarn" ? "yarn" : manager === "bun" ? "bun" : "npm";
  setup.push(manager === "npm" && files.includes("package-lock.json") ? "npm ci" : `${command} install`);
  const scripts = node?.scripts ?? {};
  if (scripts.build) build.push(`${command} run build`);
  if (scripts.test) test.push(command === "npm" ? "npm test" : `${command} test`);
  if (scripts.start) run.push(`${command} run start`);
  else if (scripts.dev) run.push(`${command} run dev`);
  if (files.some((file) => /(^|\/)(\.eslintrc|eslint\.config\.|prettier\.config\.|\.prettierrc)/.test(file))) conventions.push("Run the configured lint/format tooling before submitting changes.");
  if (node?.engines?.node) gotchas.push(`Use the Node version requested in package.json (${node.engines.node}).`);
}

function addPythonCommands(manager: PackageManager, root: string, files: string[], setup: string[], build: string[], test: string[], run: string[], conventions: string[], gotchas: string[]): void {
  const pyproject = readText(root, "pyproject.toml") ?? "";
  if (manager === "poetry") setup.push("poetry install");
  else if (manager === "uv") setup.push("uv sync");
  else if (files.includes("requirements.txt")) setup.push("python -m pip install -r requirements.txt");
  else setup.push("python -m pip install -e .");
  const pythonTests = files.filter((file) => /(^|\/)test_.*\.py$|(^|\/).*_test\.py$/.test(file));
  const usesPytest = files.includes("pytest.ini") || /\[tool\.pytest/.test(pyproject) || (readText(root, "requirements.txt") ?? "").includes("pytest") || pythonTests.some((file) => (readText(root, file) ?? "").includes("pytest"));
  if (pythonTests.length || files.includes("pytest.ini")) test.push(usesPytest ? "python -m pytest" : "python -m unittest discover");
  if (/\[tool\.ruff/.test(pyproject)) conventions.push("Run Ruff for linting and formatting when modifying Python code.");
  if (/\[tool\.pytest/.test(pyproject)) gotchas.push("Pytest options are configured in pyproject.toml; use `python -m pytest` from the repository root.");
  if (files.includes("main.py")) run.push("python main.py");
  if (files.includes("Makefile")) build.push("make");
}

function addRustCommands(setup: string[], build: string[], test: string[], run: string[]): void { setup.push("cargo fetch"); build.push("cargo build"); test.push("cargo test"); run.push("cargo run"); }
function addGoCommands(setup: string[], build: string[], test: string[], run: string[]): void { setup.push("go mod download"); build.push("go build ./..."); test.push("go test ./..."); run.push("go run ."); }

function detectEnvironmentVariables(root: string, environmentFiles: string[]): string[] {
  const values = new Set<string>();
  for (const file of environmentFiles) {
    const text = readText(root, file) ?? "";
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/);
      if (match) values.add(match[1]);
    }
  }
  return [...values].filter((name) => !ENV_EXCLUSIONS.has(name)).slice(0, 20);
}

function detectEntryPoints(files: string[], node: NodeManifest | undefined): string[] {
  const entries = files.filter((file) => /(^|\/)(main|index|app|server)\.(ts|tsx|js|jsx|py|go)$/.test(file));
  if (node?.scripts?.start) entries.unshift("package.json:start script");
  return unique(entries).slice(0, 10);
}

function unique(values: string[]): string[] { return [...new Set(values)]; }
