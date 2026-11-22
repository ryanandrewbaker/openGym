import assert from "node:assert/strict";
import test from "node:test";
import {
  validateFullV2SessionPrescription as apiValidate,
} from "./lifepilot-prescription-v2.js";
import {
  validateFullV2SessionPrescription as embedValidate,
} from "../../frontend/src/lib/lifepilot-prescription-v2-validate.js";

test("MASIS-157 api bridge and embed import the same v2 validator", () => {
  assert.equal(apiValidate, embedValidate);
});