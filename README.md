# Agent-Primer

Agent-Primer inspects a repository, generates or repairs a concise `AGENTS.md`, then gives a fresh Codex CLI session a real test task in a disposable copy of the repository. It records every verifier command, stdout, and stderr verbatim, patches only detected documentation gaps, and retries at most three times.

## Current milestone

The CLI is intentionally core-loop-only: no UI. A successful verification requires both a clean independent Codex process exit and the verifier's `VERIFICATION_RESULT: PASS` marker with captured command evidence. If Codex cannot start, the report says so; Agent-Primer never fabricates a result.

## Requirements

- Node.js 22.6 or newer (Node 24 recommended)
- Git, only when scanning a Git URL

## Usage

```sh
node --experimental-strip-types src/cli.ts scan <repo-path-or-git-url>
```

Or, after linking/installing the package:

```sh
agent-primer scan <repo-path-or-git-url>
```

The generated document is written to standard output so it can be reviewed or redirected intentionally:

```sh
node --experimental-strip-types src/cli.ts scan ../some-project > AGENTS.md
```

Verify an existing document once without modifying the repository:

```sh
node --experimental-strip-types src/cli.ts verify ../some-project
```

Run the complete draft/verify/score/iterate/report loop. For a local source this writes the final candidate to `AGENTS.md`; for a Git URL it prints the final document and cannot push upstream changes.

```sh
node --experimental-strip-types src/cli.ts prime ../some-project
```

By default the verifier runs `codex exec --json --skip-git-repo-check --sandbox workspace-write` in a temporary copy of the repository. This is the isolation boundary: the new process gets the task and the candidate `AGENTS.md`, not Agent-Primer's inspection results. Use `--codex-command <path>` only when the Codex executable is not on `PATH`.

The default task is the full test suite. A different bounded task can be supplied:

```sh
node --experimental-strip-types src/cli.ts prime ../some-project --task "Run the full test suite and report pass/fail."
```

## Test

```sh
node --experimental-strip-types --test test/inspect.test.ts
```
