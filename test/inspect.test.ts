import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { draftAgentsMd } from "../src/agents-md/draft.ts";
import { inspectRepository } from "../src/inspect/detectors.ts";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

test("detects Node setup, scripts, and environment template", () => {
  const facts = inspectRepository(path.join(fixtures, "node-project"), "fixture");
  assert.equal(facts.packageManager, "npm");
  assert.deepEqual(facts.setupCommands, ["npm ci"]);
  assert.deepEqual(facts.testCommands, ["npm test"]);
  assert.deepEqual(facts.runCommands, ["npm run dev"]);
  assert.deepEqual(facts.environmentVariables, ["API_URL", "API_TOKEN"]);
  const draft = draftAgentsMd(facts);
  assert.match(draft, /## Test[\s\S]*npm test/);
  assert.match(draft, /API_TOKEN/);
});

test("detects a standard-library Python unittest project", () => {
  const facts = inspectRepository(path.join(fixtures, "python-project"), "fixture");
  assert.equal(facts.packageManager, "pip");
  assert.ok(facts.setupCommands.includes("python -m pip install -r requirements.txt"));
  assert.deepEqual(facts.testCommands, ["python -m unittest discover"]);
});
