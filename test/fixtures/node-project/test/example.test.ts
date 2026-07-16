import test from "node:test";
import assert from "node:assert/strict";
import { value } from "../src/index.ts";

test("fixture value", () => {
  assert.equal(value, 1);
});
