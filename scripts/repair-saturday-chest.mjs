#!/usr/bin/env node
/**
 * Fingerprinted structural repair for the stale Saturday chest routine.
 *
 * Dry-run is the default. --apply writes only when the live db + state still
 * match the known zombie fingerprint.
 *
 *   node scripts/repair-saturday-chest.mjs --data-dir /data
 *   node scripts/repair-saturday-chest.mjs --data-dir /data --apply
 */
import fs from "node:fs";
import path from "node:path";
import {
  SATURDAY_CHEST_FINGERPRINT,
  applySaturdayChestRepair,
  assessSaturdayChestRepair,
  formatSaturdayChestReport,
  untouchedSnapshot,
} from "../api/integrations/saturday-chest-repair.js";

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  return process.argv[index + 1] || null;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function atomicWrite(file, content) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

const dataDir = argValue("--data-dir");
const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run") || !apply;

if (!dataDir) {
  console.error("Usage: node scripts/repair-saturday-chest.mjs --data-dir <path> [--dry-run|--apply]");
  process.exit(1);
}
if (apply && process.argv.includes("--dry-run")) {
  console.error("Pass only one of --dry-run or --apply");
  process.exit(1);
}

const dbFile = path.join(dataDir, "db.json");
const stateFile = path.join(dataDir, `state-${SATURDAY_CHEST_FINGERPRINT.openGymUserId}.json`);

let db;
let state;
try {
  db = readJson(dbFile);
  state = readJson(stateFile);
} catch (error) {
  console.error(`No write. Could not read openGym data: ${error.message}`);
  process.exit(1);
}

const before = untouchedSnapshot(state);
const assessment = assessSaturdayChestRepair({ db, state });
if (!assessment.matched) {
  console.log(formatSaturdayChestReport(assessment, { apply }));
  process.exit(2);
}

if (dryRun) {
  console.log(formatSaturdayChestReport(assessment));
  process.exit(0);
}

const now = Date.now();
const result = applySaturdayChestRepair(state, { now });
if (!result.ok) {
  console.log(formatSaturdayChestReport({ ...assessment, matched: false, mismatches: result.mismatches, proposed: null }));
  process.exit(2);
}

const after = untouchedSnapshot(result.state);
if (JSON.stringify(before) !== JSON.stringify(after)) {
  console.error("No write. Repair would have changed workouts, exWeights, active, week, or another routine.");
  process.exit(1);
}

atomicWrite(stateFile, JSON.stringify(result.state));
console.log(formatSaturdayChestReport(assessment, { apply: true, now }));
console.log(`Wrote ${stateFile}`);
