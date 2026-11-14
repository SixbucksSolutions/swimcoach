// Schema checks against contract/schemas, read as data (the suite never imports MVP code). Ajv in
// its 2020 dialect: the engine the contract's name patterns were proven in (their `u` flag is
// Ajv's default).
import { AssertionError } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";

const SCHEMA_DIR = new URL("../../contract/schemas/", import.meta.url);
const SCHEMA_FILES = ["report.schema.json", "state.schema.json"] as const;
/** The directory in the schemas' own $id, which their relative $refs resolve against. */
const ID_BASE =
  "https://raw.githubusercontent.com/SixbucksSolutions/swimcoach/main/contract/schemas/";

type Validate = ((data: unknown) => boolean) & { errors?: unknown };

interface Compiler {
  getSchema: (ref: string) => Validate | undefined;
  errorsText: (errors: unknown) => string;
}

function buildCompiler(): Compiler {
  // strictTypes is off because state.schema.json states `maxItems` inside an `if` without a
  // `type`, which is valid JSON Schema and which Ajv's strictTypes refuses. Every other strict
  // check stays on, so a typo in a schema keyword still fails loudly.
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false });
  for (const file of SCHEMA_FILES) {
    ajv.addSchema(JSON.parse(readFileSync(new URL(file, SCHEMA_DIR), "utf8")) as object);
  }
  return ajv as Compiler;
}

let compiler: Compiler | undefined;

/**
 * Asserts that `body` matches the schema at `ref`, for example
 * "report.schema.json#/$defs/errorResponse" or "state.schema.json".
 */
function expectSchema(ref: string, body: unknown): void {
  compiler ??= buildCompiler();
  const validate = compiler.getSchema(new URL(ref, ID_BASE).href);
  if (validate === undefined) {
    throw new Error(`No schema is known for ${ref}.`);
  }
  const valid: boolean = validate(body);
  if (valid) {
    return;
  }
  throw new AssertionError({
    message: `The body does not match ${ref}: ${compiler.errorsText(validate.errors)}`,
    actual: body,
  });
}

export { expectSchema };
