import assert from "node:assert/strict";
import test from "node:test";
import { applySeededRoutinesToState, routineMappingsFromState } from "./lifepilot-schedule.js";

test("routineMappingsFromState derives mappings from state.week", () => {
  const mappings = routineMappingsFromState({
    routines: [
      { id: "r1", name: "Dumbbell Day 1" },
      { id: "r2", name: "Pull Day" },
    ],
    week: { 1: "r1", 6: "r2" },
  });

  assert.deepEqual(mappings, [
    { weekdayIndex: 1, openGymRoutineId: "r1", routineName: "Dumbbell Day 1" },
    { weekdayIndex: 6, openGymRoutineId: "r2", routineName: "Pull Day" },
  ]);
});

test("routineMappingsFromState uses renamed routine names", () => {
  const mappings = routineMappingsFromState({
    routines: [{ id: "r1", name: "Renamed Routine" }],
    week: { 3: "r1" },
  });

  assert.equal(mappings[0]?.routineName, "Renamed Routine");
});

test("routineMappingsFromState omits removed weekday assignments", () => {
  const mappings = routineMappingsFromState({
    routines: [{ id: "r1", name: "Only Monday" }],
    week: { 1: "r1" },
  });

  assert.equal(mappings.length, 1);
  assert.equal(mappings[0]?.weekdayIndex, 1);
});

test("applySeededRoutinesToState keeps routine IDs aligned across routines and week", () => {
  const seeded = [
    {
      weekdayIndex: 1,
      openGymRoutineId: "abc",
      routineName: "Push Day",
      routine: { id: null, name: "Push Day", emoji: "barbell", ex: [] },
    },
    {
      weekdayIndex: 3,
      openGymRoutineId: "def",
      routineName: "Pull Day",
      routine: { id: null, name: "Pull Day", emoji: "pullup", ex: [] },
    },
  ];

  const state = applySeededRoutinesToState({ week: {}, routines: [] }, seeded);
  assert.equal(state.routines[0]?.id, "abc");
  assert.equal(state.week["1"], "abc");
  assert.equal(state.week["3"], "def");
  assert.deepEqual(routineMappingsFromState(state).map((row) => row.openGymRoutineId), ["abc", "def"]);
});
