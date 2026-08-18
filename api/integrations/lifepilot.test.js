import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { registerLifePilotRoutes } from "./lifepilot.js";
import { routineMappingsFromState } from "./lifepilot-schedule.js";

const SERVICE_SECRET = "test-service-secret";

function makeHarness() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "opengym-lp-"));
  const SECRET = "bridge-secret";
  const db = { users: [], creds: [], subs: [], invites: [] };
  const routes = {};
  let lastResponse = null;

  const json = (_res, status, body, headers = {}) => {
    lastResponse = { status, body, headers };
    return lastResponse;
  };

  registerLifePilotRoutes(routes, {
    db,
    saveDb: () => {},
    stateFile: (uid) => path.join(dataDir, `state-${uid}.json`),
    readState(uid) {
      try {
        return JSON.parse(fs.readFileSync(path.join(dataDir, `state-${uid}.json`), "utf8"));
      } catch {
        return null;
      }
    },
    atomicWrite(file, content) {
      fs.writeFileSync(file, content);
    },
    json,
    readBody: async (req) => req.body,
    makeSession: () => "session",
    sessionCookie: () => "session=1",
    SECRET,
    dataDir,
    readSession: () => null,
  });

  async function call(route, body, { auth = true } = {}) {
    const req = {
      headers: auth ? { authorization: `Bearer ${SERVICE_SECRET}` } : {},
      body,
    };
    await routes[route](req, json);
    return lastResponse;
  }

  return { db, call, dataDir, SECRET };
}

test("manage-session token exchanges without workout fields", async () => {
  const { call } = makeHarness();

  const provisioned = await call("POST /integrations/lifepilot/provision", {
    profileId: "profile-manage",
    displayName: "Ryan",
  });
  assert.equal(provisioned.status, 200);

  const manage = await call("POST /integrations/lifepilot/manage-session", {
    profileId: "profile-manage",
    openGymUserId: provisioned.body.openGymUserId,
  });
  assert.equal(manage.status, 200);
  assert.ok(manage.body.token);

  const exchanged = await call(
    "POST /integrations/lifepilot/exchange-token",
    { token: manage.body.token },
    { auth: false },
  );
  assert.equal(exchanged.status, 200);
  assert.equal(exchanged.body.context.mode, "manage");
  assert.equal(exchanged.body.context.profileId, "profile-manage");
  assert.equal(exchanged.body.context.externalSessionId, null);
  assert.equal(exchanged.body.context.routineId, null);
  assert.equal(exchanged.body.context.wellnessOccurrenceId, null);
});

test("workout session token includes mode workout and requires session context", async () => {
  const { call } = makeHarness();

  const provisioned = await call("POST /integrations/lifepilot/provision", {
    profileId: "profile-workout",
    displayName: "Ryan",
  });

  const session = await call("POST /integrations/lifepilot/session", {
    profileId: "profile-workout",
    openGymUserId: provisioned.body.openGymUserId,
    externalSessionId: "ext-1",
    routineId: provisioned.body.routines[0].openGymRoutineId,
    wellnessOccurrenceId: "occ-1",
  });
  assert.equal(session.status, 200);

  const exchanged = await call(
    "POST /integrations/lifepilot/exchange-token",
    { token: session.body.token },
    { auth: false },
  );
  assert.equal(exchanged.status, 200);
  assert.equal(exchanged.body.context.mode, "workout");
  assert.equal(exchanged.body.context.externalSessionId, "ext-1");
});

test("routines endpoint reflects state.week including renamed and moved routines", async () => {
  const { call, dataDir } = makeHarness();

  const provisioned = await call("POST /integrations/lifepilot/provision", {
    profileId: "profile-routines",
    displayName: "Ryan",
  });
  const userId = provisioned.body.openGymUserId;

  const customState = {
    routines: [{ id: "r1", name: "Dumbbell Day 1", emoji: "barbell", ex: [] }],
    week: { 6: "r1" },
  };
  fs.writeFileSync(path.join(dataDir, `state-${userId}.json`), JSON.stringify(customState));

  const routines = await call("POST /integrations/lifepilot/routines", {
    profileId: "profile-routines",
    openGymUserId: userId,
  });
  assert.equal(routines.status, 200);
  assert.deepEqual(routines.body.routines, [
    { weekdayIndex: 6, openGymRoutineId: "r1", routineName: "Dumbbell Day 1" },
  ]);
});

test("routine endpoint returns planned exercises for a routine", async () => {
  const { call, dataDir } = makeHarness();

  const provisioned = await call("POST /integrations/lifepilot/provision", {
    profileId: "profile-routine-detail",
    displayName: "Ryan",
  });
  const userId = provisioned.body.openGymUserId;
  const routineId = provisioned.body.routines[0].openGymRoutineId;

  const routine = await call("POST /integrations/lifepilot/routine", {
    profileId: "profile-routine-detail",
    openGymUserId: userId,
    routineId,
  });

  assert.equal(routine.status, 200);
  assert.equal(routine.body.id, routineId);
  assert.ok(Array.isArray(routine.body.exercises));
  assert.ok(routine.body.exercises.length > 0);
  assert.ok(routine.body.exercises[0].exerciseId);
  assert.ok(routine.body.exercises[0].exerciseName);
});

test("existing provisioned user keeps custom routines and schedule", async () => {
  const { call, db, dataDir } = makeHarness();

  const first = await call("POST /integrations/lifepilot/provision", {
    profileId: "profile-existing",
    displayName: "Ryan",
  });
  const userId = first.body.openGymUserId;

  const customState = {
    routines: [
      { id: "custom-1", name: "My Custom Routine", emoji: "barbell", ex: [] },
      { id: "custom-2", name: "Another", emoji: "pullup", ex: [] },
    ],
    week: { 2: "custom-1" },
  };
  fs.writeFileSync(path.join(dataDir, `state-${userId}.json`), JSON.stringify(customState));

  const second = await call("POST /integrations/lifepilot/provision", {
    profileId: "profile-existing",
    displayName: "Ryan",
  });
  assert.equal(second.status, 200);
  assert.deepEqual(second.body.routines, routineMappingsFromState(customState));
  assert.equal(db.users.filter((user) => user.lifepilotProfileId === "profile-existing").length, 1);
});

test("new provision seeds week mappings from generated routine IDs", async () => {
  const { call, dataDir } = makeHarness();

  const provisioned = await call("POST /integrations/lifepilot/provision", {
    profileId: "profile-seed",
    displayName: "Ryan",
  });
  assert.equal(provisioned.status, 200);
  assert.equal(provisioned.body.routines.length, 3);

  const state = JSON.parse(
    fs.readFileSync(path.join(dataDir, `state-${provisioned.body.openGymUserId}.json`), "utf8"),
  );
  for (const mapping of provisioned.body.routines) {
    assert.equal(state.week[String(mapping.weekdayIndex)], mapping.openGymRoutineId);
    assert.ok(state.routines.some((routine) => routine.id === mapping.openGymRoutineId));
  }
});
