import { readFileSync } from "node:fs";
import Ajv from "ajv/dist/2020.js";
const schema = JSON.parse(
  readFileSync(
    new URL("../shared/contracts/handoff-v2.schema.json", import.meta.url),
  ),
);
const ajv = new Ajv({ allErrors: true });
ajv.addSchema(schema);
export const validators = Object.fromEntries(
  Object.keys(schema.$defs).map((k) => [
    k,
    ajv.getSchema(`${schema.$id}#/$defs/${k}`),
  ]),
);
export function assertContract(name, value) {
  if (!validators[name](value))
    throw new Error(`${name}: ${ajv.errorsText(validators[name].errors)}`);
  return value;
}
