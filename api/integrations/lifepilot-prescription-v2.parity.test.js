import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
const here = path.dirname(fileURLToPath(import.meta.url));

test("MASIS-157 packaged api/lib validator matches frontend source", () => {
  const apiPath = path.join(here, "../lib/lifepilot-prescription-v2-validate.js");
  const fePath = path.join(here, "../../frontend/src/lib/lifepilot-prescription-v2-validate.js");
  const hash = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
  assert.equal(hash(apiPath), hash(fePath));
});