import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const schemaUrl = new URL(
  "./schemas/goldset-schema-v1.0.json",
  import.meta.url,
);
const schema = JSON.parse(await readFile(schemaUrl, "utf8"));

function visit(value, callback) {
  if (Array.isArray(value)) {
    for (const item of value) visit(item, callback);
    return;
  }
  if (!value || typeof value !== "object") return;
  callback(value);
  for (const child of Object.values(value)) visit(child, callback);
}

const references = [];
visit(schema, (value) => {
  if (typeof value.$ref === "string") references.push(value.$ref);
});

for (const reference of references) {
  assert.match(reference, /^#\/\$defs\/[A-Za-z][A-Za-z0-9]*$/);
  const definition = reference.split("/").at(-1);
  assert.ok(
    schema.$defs[definition],
    `Unresolved schema reference: ${reference}`,
  );
}

assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
assert.equal(
  schema.properties.contract_version.const,
  "annotation-contract-v1.0",
);
assert.equal(schema.properties.guideline_version.const, "guidelines-v1.0");
assert.deepEqual(schema.$defs.nullReason.enum, [
  "absent_in_source",
  "illegible",
  "ambiguous",
  null,
]);
assert.deepEqual(Object.keys(schema.properties.annotations.properties).sort(), [
  "diagnoses",
  "labs",
  "medications",
]);

const adjudication = schema.$defs.review.properties.adjudication.oneOf[1];
assert.ok(adjudication.required.includes("reviewer_ids"));
assert.equal(adjudication.properties.reviewer_ids.minItems, 2);
assert.equal(adjudication.properties.reviewer_ids.uniqueItems, true);

console.log("CLINICAL_EVALUATION_CONTRACT_VALID=true");
console.log(`SCHEMA_ID=${schema.$id}`);
console.log(`LOCAL_REFERENCES_VALIDATED=${references.length}`);
