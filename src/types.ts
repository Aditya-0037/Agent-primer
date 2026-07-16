export type PackageManager = "npm" | "pnpm" | "yarn" | "bun" | "pip" | "poetry" | "uv" | "unknown";

export interface RepositoryFacts {
  root: string;
  source: string;
  languages: string[];
  packageManager: PackageManager;
  setupCommands: string[];
  buildCommands: string[];
  testCommands: string[];
  runCommands: string[];
  environmentFiles: string[];
  environmentVariables: string[];
  topLevelDirectories: string[];
  entryPoints: string[];
  conventions: string[];
  gotchas: string[];
}

export type VerificationStatus = "passed" | "failed" | "unavailable";

export interface VerificationAttempt {
  number: number;
  task: string;
  command: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  status: VerificationStatus;
  gaps: string[];
}

export interface PrimeResult {
  source: string;
  task: string;
  before: string;
  after: string;
  attempts: VerificationAttempt[];
  wroteAgentsFile: boolean;
}
