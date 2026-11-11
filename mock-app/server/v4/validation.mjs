import { readFileSync } from "node:fs";
import Ajv from "ajv/dist/2020.js";
const schema = JSON.parse(
  readFileSync(
    new URL("../../shared/contracts/handoff-v4.schema.json", import.meta.url),
  ),
);
const ajv = new Ajv({ allErrors: true });
ajv.addSchema(schema);
export function assertContract(name, value) {
  const v = ajv.getSchema(`${schema.$id}#/$defs/${name}`);
  if (!v(value)) throw new Error(`${name}: ${ajv.errorsText(v.errors)}`);
  return value;
}
