/**
 * One-shot structural repair for one known stale Saturday routine.
 *
 * Matches a fingerprint of the saved zombie plan, then replaces Dumbbell Kickback
 * with Dumbbell Seated Triceps Extension. Template weights on the exercises that
 * stay are copied through unchanged. workouts, exWeights, active, week, and every
 * other routine are not part of the result.
 *
 * Catalogue check for the replacement (EXDB 2188, "dumbbell seated triceps extension"):
 * sit on a bench, hold one dumbbell overhead, lower it behind the head.
 */

export const SATURDAY_CHEST_FINGERPRINT = {
  lifepilotProfileId: "seed-profile-ryan",
  openGymUserId: "tvcHeQncmW4X",
  weekdayIndex: "6",
  routineId: "msjz29hzc4kqr",
  routineName: "Saturday - Chest and Triceps",
  staleExerciseIds: ["0289", "0314", "0351", "0334", "0333"],
};

/** New fifth exercise. weight 0 is a template fallback, not a logged working load. */
export const SEATED_TRICEPS_EXTENSION = {
  id: "2188",
  sets: 3,
  mode: "reps",
  reps: 10,
  weight: 0,
};

const EXERCISE_NAMES = {
  "0289": "dumbbell bench press",
  "0314": "dumbbell incline bench press",
  "0351": "dumbbell lying triceps extension",
  "0334": "dumbbell lateral raise",
  "0333": "dumbbell kickback",
  "2188": "dumbbell seated triceps extension",
};

const UNTOUCHED_TOP_LEVEL = ["workouts", "exWeights", "active", "week"];

function exerciseIds(routine) {
  return (routine?.ex || []).map((entry) => String(entry.id));
}

function sameIds(left, right) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export function targetExerciseIds() {
  return [...SATURDAY_CHEST_FINGERPRINT.staleExerciseIds.slice(0, 4), SEATED_TRICEPS_EXTENSION.id];
}

export function proposedExercises(existing) {
  return [
    ...existing.slice(0, 4).map((entry) => ({ ...entry })),
    { ...SEATED_TRICEPS_EXTENSION },
  ];
}

function findUser(db, fingerprint) {
  return (db?.users || []).find((user) => user.lifepilotProfileId === fingerprint.lifepilotProfileId) || null;
}

function routineById(state, routineId) {
  return (state?.routines || []).find((routine) => routine.id === routineId) || null;
}

export function describeRoutine(routine) {
  if (!routine) return null;
  return {
    id: routine.id,
    name: routine.name,
    exercises: (routine.ex || []).map((entry) => ({
      id: String(entry.id),
      name: EXERCISE_NAMES[String(entry.id)] || null,
      sets: entry.sets,
      reps: entry.reps ?? null,
      weight: entry.weight ?? null,
    })),
  };
}

function stateMismatches(state, fingerprint) {
  const mismatches = [];
  const mappedId = state?.week?.[fingerprint.weekdayIndex];
  if (String(mappedId || "") !== fingerprint.routineId) {
    mismatches.push(
      `week[${fingerprint.weekdayIndex}] is ${mappedId || "unset"}, expected ${fingerprint.routineId}`,
    );
  }

  const routine = routineById(state, fingerprint.routineId);
  if (!routine) {
    mismatches.push(`routine ${fingerprint.routineId} is not in state.routines`);
    return mismatches;
  }

  if (routine.name !== fingerprint.routineName) {
    mismatches.push(`routine name is ${JSON.stringify(routine.name)}, expected ${JSON.stringify(fingerprint.routineName)}`);
  }

  const ids = exerciseIds(routine);
  if (!sameIds(ids, fingerprint.staleExerciseIds)) {
    mismatches.push(`exercise ids are ${ids.join(", ") || "(none)"}, expected ${fingerprint.staleExerciseIds.join(", ")}`);
  }

  if (ids.includes(SEATED_TRICEPS_EXTENSION.id)) {
    mismatches.push(`target exercise ${SEATED_TRICEPS_EXTENSION.id} is already on the routine`);
  }

  return mismatches;
}

/**
 * Decide whether this db+state pair is the known stale Saturday plan.
 * A miss returns the routines an operator needs to review and never a proposed write.
 */
export function assessSaturdayChestRepair({ db, state, fingerprint = SATURDAY_CHEST_FINGERPRINT }) {
  const mismatches = [];
  const user = findUser(db, fingerprint);
  if (!user) {
    mismatches.push(`no openGym user for LifePilot profile ${fingerprint.lifepilotProfileId}`);
  } else if (user.id !== fingerprint.openGymUserId) {
    mismatches.push(`openGym user for that profile is ${user.id}, expected ${fingerprint.openGymUserId}`);
  } else if (user.lifepilot !== true) {
    mismatches.push(`openGym user ${user.id} is not a LifePilot profile`);
  }

  mismatches.push(...stateMismatches(state, fingerprint));

  const routine = routineById(state, fingerprint.routineId);
  const saturdayId = state?.week?.[fingerprint.weekdayIndex];
  const observed = {
    profileUser: user ? { id: user.id, lifepilotProfileId: user.lifepilotProfileId } : null,
    saturday: describeRoutine(routineById(state, saturdayId)),
    expectedRoutine: describeRoutine(routine),
  };

  if (mismatches.length > 0) {
    return {
      matched: false,
      mismatches,
      observed,
      current: describeRoutine(routine) || observed.saturday,
      proposed: null,
      changedFields: [],
    };
  }

  const index = state.routines.findIndex((entry) => entry.id === fingerprint.routineId);
  const proposedEx = proposedExercises(routine.ex);
  return {
    matched: true,
    mismatches: [],
    observed,
    current: describeRoutine(routine),
    proposed: describeRoutine({ ...routine, ex: proposedEx }),
    changedFields: [
      `routines[${index}].ex[4]`,
      "_ts",
    ],
    routineIndex: index,
    proposedEx,
  };
}

export function untouchedSnapshot(state, routineId = SATURDAY_CHEST_FINGERPRINT.routineId) {
  const routine = routineById(state, routineId);
  const { ex, ...routineMeta } = routine || {};
  return {
    workouts: state?.workouts ?? null,
    exWeights: state?.exWeights ?? null,
    active: state?.active ?? null,
    week: state?.week ?? null,
    otherRoutines: (state?.routines || []).filter((entry) => entry.id !== routineId),
    routineMeta: routine ? routineMeta : null,
    keptExercises: ex ? ex.slice(0, 4) : null,
  };
}

/**
 * Return a new state with only the fingerprinted routine's exercise list and _ts changed.
 * Refuses when the state itself no longer matches, even if the caller skipped the profile check.
 */
export function applySaturdayChestRepair(state, { now = Date.now(), fingerprint = SATURDAY_CHEST_FINGERPRINT } = {}) {
  const mismatches = stateMismatches(state, fingerprint);
  if (mismatches.length > 0) {
    return { ok: false, mismatches, state };
  }

  const next = structuredClone(state);
  const routine = routineById(next, fingerprint.routineId);
  routine.ex = proposedExercises(routine.ex);
  next._ts = now;
  return { ok: true, mismatches: [], state: next };
}

function exerciseLine(exercise, index) {
  const name = exercise.name || EXERCISE_NAMES[exercise.id] || "unknown exercise";
  const reps = exercise.reps == null ? "" : ` × ${exercise.reps}`;
  const weight = exercise.weight == null ? "" : ` · template ${exercise.weight} kg`;
  return `  ${index + 1}. ${exercise.id} ${name} — ${exercise.sets}${reps}${weight}`;
}

export function formatSaturdayChestReport(assessment, { apply = false, now = null } = {}) {
  const lines = [];
  lines.push(
    assessment.matched
      ? (apply ? "Saturday chest repair: APPLY" : "Saturday chest repair: DRY RUN (no write)")
      : "Saturday chest repair: refused (no write)",
  );
  if (!assessment.matched) {
    lines.push("");
    lines.push("No write. This state does not match the stale Saturday fingerprint and needs manual review.");
    for (const mismatch of assessment.mismatches) lines.push(`- ${mismatch}`);
    lines.push("");
    lines.push("Current routine:");
    const current = assessment.current;
    if (!current) {
      lines.push("  (no matching routine found)");
    } else {
      lines.push(`  ${current.id} ${JSON.stringify(current.name)}`);
      current.exercises.forEach((exercise, index) => lines.push(exerciseLine(exercise, index)));
    }
    if (sameIds(current?.exercises?.map((exercise) => exercise.id) || [], targetExerciseIds())) {
      lines.push("");
      lines.push("The exercise list is already the repaired shape. Nothing further is required for this fingerprint.");
    }
    return lines.join("\n");
  }

  lines.push("Fingerprint matched.");
  lines.push("");
  lines.push(`Current routine ${assessment.current.id} ${JSON.stringify(assessment.current.name)}`);
  assessment.current.exercises.forEach((exercise, index) => lines.push(exerciseLine(exercise, index)));
  lines.push("");
  lines.push("Proposed routine");
  assessment.proposed.exercises.forEach((exercise, index) => lines.push(exerciseLine(exercise, index)));
  lines.push("");
  lines.push("JSON fields that will change:");
  lines.push(`- ${assessment.changedFields[0]}: remove 0333 dumbbell kickback; insert 2188 dumbbell seated triceps extension`);
  lines.push(`- _ts: ${apply ? `set to ${now}` : "set to the apply timestamp"}`);
  lines.push("");
  lines.push("Untouched: workouts, exWeights, active, week, other routines, routine id, routine name, and template weights on the four exercises that stay.");
  lines.push("Template weights are not rewritten from workout history.");
  return lines.join("\n");
}

export { UNTOUCHED_TOP_LEVEL };
