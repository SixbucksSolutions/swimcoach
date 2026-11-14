// expectClose: the fixtures' comparison rule (contract/fixtures/README.md): numbers within an
// absolute 1e-9, everything else exactly. Objects are compared key for key over the EXPECTED
// side's keys, so a state milestone that carries more than a fixture names still matches.
import assert from "node:assert/strict";
import { isRecord } from "./json.ts";

const TOLERANCE = 1e-9;

function closeNumber(actual: unknown, expected: number, path: string): void {
  assert.equal(
    typeof actual,
    "number",
    `${path}: expected a number, got ${JSON.stringify(actual)}`,
  );
  assert.ok(
    Math.abs(Number(actual) - expected) <= TOLERANCE,
    `${path}: expected ${expected} within ${TOLERANCE}, got ${String(actual)}`,
  );
}

function closeArray(actual: unknown, expected: readonly unknown[], path: string): void {
  assert.ok(Array.isArray(actual), `${path}: expected an array, got ${JSON.stringify(actual)}`);
  assert.equal(actual.length, expected.length, `${path}: array length`);
  expected.forEach((item, index) => {
    expectClose(actual[index], item, `${path}[${index}]`);
  });
}

function closeObject(
  actual: unknown,
  expected: Readonly<Record<string, unknown>>,
  path: string,
): void {
  assert.ok(isRecord(actual), `${path}: expected an object, got ${JSON.stringify(actual)}`);
  for (const [key, value] of Object.entries(expected)) {
    assert.ok(key in actual, `${path}.${key}: the key is missing`);
    expectClose(actual[key], value, `${path}.${key}`);
  }
}

function expectClose(actual: unknown, expected: unknown, path: string): void {
  if (typeof expected === "number") {
    closeNumber(actual, expected, path);
  } else if (Array.isArray(expected)) {
    closeArray(actual, expected, path);
  } else if (isRecord(expected)) {
    closeObject(actual, expected, path);
  } else {
    assert.deepStrictEqual(actual, expected, `${path}: expected ${JSON.stringify(expected)}`);
  }
}

export { expectClose };
