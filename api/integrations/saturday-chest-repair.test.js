import assert from "node:assert/strict";
import test from "node:test";
import {
  SATURDAY_CHEST_FINGERPRINT,
  SEATED_TRICEPS_EXTENSION,
  applySaturdayChestRepair,
  assessSaturdayChestRepair,
  formatSaturdayChestReport,
  targetExerciseIds,
  untouchedSnapshot,
} from "./saturday-chest-repair.js";

const STALE_EX = [
  { id: "0289", sets: 4, mode: "reps", reps: 10, weight: 18, inc: 2 },
  { id: "0314", sets: 3, mode: "reps", reps: 10, weight: 18, repsMin: 8 },
  { id: "0351", sets: 3, mode: "reps", reps: 12, weight: 13 },
  { id: "0334", sets: 3, mode: "reps", reps: 10, weight: 9, repsMin: 8 },
  { id: "0333", sets: 3, mode: "reps", reps: 10, weight: 15, repsMin: 8 },
];

function staleFixture() {
  return {
    db: {
      users: [
        {
          id: SATURDAY_CHEST_FINGERPRINT.openGymUserId,
          lifepilot: true,
          lifepilotProfileId: SATURDAY_CHEST_FINGERPRINT.lifepilotProfileId,
        },
        { id: "someone-else", lifepilot: true, lifepilotProfileId: "other-profile" },
      ],
    },
    state: {
      _ts: 100,
      workouts: [{ id: "w1", entries: [{ id: "0289", sets: [{ w: 34, r: 8, done: true }] }] }],
      exWeights: { "0289": { w: 34, d: "2026-09-29" } },
      active: { id: "in-progress", routineId: "other" },
      week: { 0: "sunday", 6: SATURDAY_CHEST_FINGERPRINT.routineId },
      routines: [
        {
          id: SATURDAY_CHEST_FINGERPRINT.routineId,
          name: SATURDAY_CHEST_FINGERPRINT.routineName,
          emoji: "barbell",
          prog: "double",
          ex: STALE_EX.map((entry) => ({ ...entry })),
        },
        { id: "sunday", name: "Sunday — Back + Biceps + Squat", ex: [{ id: "0292", sets: 3, reps: 12, weight: 18 }] },
      ],
    },
  };
}

test("catalogue replacement is the seated overhead triceps extension", () => {
  assert.equal(SEATED_TRICEPS_EXTENSION.id, "2188");
  assert.equal(SEATED_TRICEPS_EXTENSION.weight, 0);
  assert.deepEqual(targetExerciseIds(), ["0289", "0314", "0351", "0334", "2188"]);
  assert.equal(SATURDAY_CHEST_FINGERPRINT.staleExerciseIds.at(-1), "0333");
});

test("matching stale Saturday routine proposes a structural swap only", () => {
  const { db, state } = staleFixture();
  const assessment = assessSaturdayChestRepair({ db, state });

  assert.equal(assessment.matched, true);
  assert.deepEqual(
    assessment.proposed.exercises.map((exercise) => exercise.id),
    targetExerciseIds(),
  );
  assert.equal(assessment.proposed.exercises[4].weight, 0);
  assert.deepEqual(
    assessment.proposed.exercises.slice(0, 4).map((exercise) => exercise.weight),
    [18, 18, 13, 9],
  );
  assert.deepEqual(assessment.changedFields, ["routines[0].ex[4]", "_ts"]);

  const report = formatSaturdayChestReport(assessment);
  assert.match(report, /DRY RUN/);
  assert.match(report, /0333 dumbbell kickback/);
  assert.match(report, /2188 dumbbell seated triceps extension/);
  assert.match(report, /Untouched: workouts, exWeights, active, week/);
  assert.match(report, /Template weights are not rewritten/);
});

test("apply keeps history, progression cache, week, and the other routines", () => {
  const { state } = staleFixture();
  const before = untouchedSnapshot(state);
  const result = applySaturdayChestRepair(state, { now: 999 });

  assert.equal(result.ok, true);
  assert.equal(result.state._ts, 999);
  assert.deepEqual(result.state.routines[0].ex.slice(0, 4), STALE_EX.slice(0, 4));
  assert.deepEqual(result.state.routines[0].ex[4], SEATED_TRICEPS_EXTENSION);
  assert.equal(result.state.routines[0].id, SATURDAY_CHEST_FINGERPRINT.routineId);
  assert.equal(result.state.routines[0].prog, "double");
  assert.deepEqual(untouchedSnapshot(result.state), before);
  assert.deepEqual(state.routines[0].ex.map((entry) => entry.id), SATURDAY_CHEST_FINGERPRINT.staleExerciseIds);
});

test("a second run refuses once kickback is gone", () => {
  const { db, state } = staleFixture();
  const first = applySaturdayChestRepair(state, { now: 999 });
  const again = assessSaturdayChestRepair({ db, state: first.state });

  assert.equal(again.matched, false);
  assert.equal(applySaturdayChestRepair(first.state, { now: 1000 }).ok, false);
  assert.equal(first.state._ts, 999);
  assert.match(formatSaturdayChestReport(again, { apply: true }), /refused \(no write\)/);
  assert.match(formatSaturdayChestReport(again), /needs manual review/);
  assert.match(formatSaturdayChestReport(again), /already the repaired shape/);
});

test("profile and user mismatches refuse before any state write", () => {
  for (const mutate of [
    (fixture) => {
      fixture.db.users[0].lifepilotProfileId = "other-profile";
    },
    (fixture) => {
      fixture.db.users[0].id = "different-user";
    },
    (fixture) => {
      fixture.db.users[0].lifepilot = false;
    },
  ]) {
    const fixture = staleFixture();
    mutate(fixture);
    const before = JSON.stringify(fixture.state);
    const assessment = assessSaturdayChestRepair(fixture);
    assert.equal(assessment.matched, false, assessment.mismatches.join("; "));
    assert.equal(assessment.proposed, null);
    assert.equal(JSON.stringify(fixture.state), before);
    assert.match(formatSaturdayChestReport(assessment), /No write/);
  }
});

test("routine id, name, weekday, or exercise list mismatches do not write", () => {
  const cases = [
    (fixture) => {
      fixture.state.routines[0].id = "edited-id";
      fixture.state.week["6"] = "edited-id";
    },
    (fixture) => {
      fixture.state.routines[0].name = "Saturday - Push";
    },
    (fixture) => {
      fixture.state.week["6"] = "sunday";
    },
    (fixture) => {
      fixture.state.routines[0].ex.push({ id: "2188", sets: 3, reps: 10, weight: 0 });
    },
    (fixture) => {
      fixture.state.routines[0].ex[4] = { id: "2188", sets: 3, mode: "reps", reps: 10, weight: 0 };
    },
  ];

  for (const mutate of cases) {
    const fixture = staleFixture();
    mutate(fixture);
    const before = JSON.stringify(fixture.state);
    const assessment = assessSaturdayChestRepair(fixture);
    assert.equal(assessment.matched, false, assessment.mismatches.join("; "));
    assert.equal(assessment.proposed, null);
    assert.equal(applySaturdayChestRepair(fixture.state).ok, false);
    assert.equal(JSON.stringify(fixture.state), before);
    assert.match(formatSaturdayChestReport(assessment), /No write/);
  }
});
