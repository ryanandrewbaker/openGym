import crypto from "node:crypto";
import { openGymExerciseName, openGymExerciseNames } from "../lib/exercise-names.js";
import { createLifePilotCompletionRelay } from "./lifepilot-completion-relay.js";
import { applySeededRoutinesToState, routineMappingsFromState } from "./lifepilot-schedule.js";

const LIFEPILOT_MODE = /^(1|true|yes|on)$/i.test(process.env.LIFEPILOT_MODE || "");
const SERVICE_SECRET = process.env.LIFEPILOT_OPENGYM_SERVICE_SECRET || process.env.OPENGYM_SERVICE_SECRET || "";
const COMPLETION_URL =
  process.env.LIFEPILOT_COMPLETION_URL || "http://host.docker.internal:3000/api/integrations/opengym/completions";

const STARTER_SPEC = [
  {
    weekdayIndex: 1,
    name: "Push Day",
    emoji: "barbell",
    exercises: [
      ["0025", 4, 8],
      ["0047", 3, 10],
      ["0426", 3, 10],
      ["0334", 3, 12],
      ["0241", 3, 12],
      ["0251", 3, 10],
    ],
  },
  {
    weekdayIndex: 3,
    name: "Pull Day",
    emoji: "pullup",
    exercises: [
      ["2330", 4, 10],
      ["0027", 4, 8],
      ["1323", 3, 10],
      ["0031", 3, 10],
      ["0313", 3, 12],
    ],
  },
  {
    weekdayIndex: 5,
    name: "Leg Day",
    emoji: "legs",
    exercises: [
      ["0043", 4, 8],
      ["0085", 3, 10],
      ["0739", 3, 12],
      ["0585", 3, 12],
      ["0586", 3, 12],
      ["0605", 4, 15],
    ],
  },
];

function uid() {
  return crypto.randomBytes(9).toString("base64url");
}

function verifyServiceAuth(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return false;
  const token = header.slice(7).trim();
  if (!SERVICE_SECRET || token.length !== SERVICE_SECRET.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(SERVICE_SECRET));
  } catch {
    return false;
  }
}

function starterRoutines() {
  return STARTER_SPEC.map((spec) => ({
    weekdayIndex: spec.weekdayIndex,
    openGymRoutineId: uid(),
    routineName: spec.name,
    routine: {
      id: null,
      name: spec.name,
      emoji: spec.emoji,
      ex: spec.exercises.map(([id, sets, reps]) => ({ id, sets, reps, weight: 0 })),
    },
  }));
}

function buildInitialState(bodyweightKg, seeded = null) {
  const state = {
    unit: "kg",
    restSec: 90,
    sound: true,
    keepAwake: true,
    lang: "en",
    theme: "dark",
    accent: "lime",
    body: "male",
    targetW: null,
    bodyweight: bodyweightKg != null ? [{ d: new Date().toISOString().slice(0, 10), w: bodyweightKg }] : [],
    routines: [],
    week: {},
    dayPlan: {},
    exWeights: {},
    workouts: [],
    active: null,
    customEx: [],
    gifSize: "full",
    reminder: { on: false, time: "08:00", tz: null },
    effort: null,
    lifepilot: true,
    _ts: Date.now(),
  };

  if (seeded) {
    applySeededRoutinesToState(state, seeded);
  }

  return state;
}

function normalizeWorkoutCompletion(workout, context) {
  const exercises = (workout.entries || []).map((entry, index) => {
    const sets = (entry.sets || [])
      .filter((set) => set.done)
      .map((set, setIndex) => ({
        setNumber: setIndex + 1,
        weightKg: set.w != null ? Number(set.w) : null,
        reps: set.r != null ? Number(set.r) : null,
        seconds: set.sec != null ? Number(set.sec) : null,
        rir: set.rir != null ? Number(set.rir) : null,
        rpe: set.rpe != null ? Number(set.rpe) : null,
        completed: true,
        warmup: !!set.warmup,
      }));

    return {
      exerciseId: entry.id,
      exerciseName: entry.name || openGymExerciseName(entry.id),
      sets,
      sortOrder: index,
    };
  });

  return {
    externalSessionId: workout.id,
    profileId: context.profileId,
    openGymUserId: context.openGymUserId,
    wellnessOccurrenceId: context.wellnessOccurrenceId || null,
    externalRoutineId: workout.routineId || context.routineId || null,
    routineName: workout.name || null,
    startedAt: new Date(workout.start).toISOString(),
    completedAt: new Date(workout.end || Date.now()).toISOString(),
    durationSeconds: Math.max(0, Math.round(((workout.end || Date.now()) - workout.start) / 1000)),
    exercises,
    rawEnginePayload: workout,
  };
}

function schedulePendingFlush(completionRelay) {
  void completionRelay.flushPending().catch((error) => {
    console.error("lifepilot pending completion flush failed", error);
  });
}

export function registerLifePilotRoutes(routes, deps) {
  const {
    db,
    saveDb,
    stateFile,
    readState,
    atomicWrite,
    json,
    readBody,
    makeSession,
    sessionCookie,
    SECRET,
    dataDir,
  } = deps;

  const completionRelay = createLifePilotCompletionRelay({
    dataDir,
    serviceSecret: SERVICE_SECRET,
    completionUrl: COMPLETION_URL,
    atomicWrite,
  });

  function signBridgeToken(payload) {
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
    return `${body}.${sig}`;
  }

  function verifyBridgeToken(token) {
    const i = token.lastIndexOf(".");
    if (i < 0) return null;
    const body = token.slice(0, i);
    const sig = token.slice(i + 1);
    const expected = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
    try {
      if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    } catch {
      return null;
    }
    try {
      const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
      if (!payload.exp || payload.exp < Date.now()) return null;
      return payload;
    } catch {
      return null;
    }
  }

  routes["POST /integrations/lifepilot/provision"] = async (req, res) => {
    if (!verifyServiceAuth(req)) return json(res, 401, { error: "unauthorized" });
    schedulePendingFlush(completionRelay);
    const body = await readBody(req);
    const profileId = String(body.profileId || "").trim();
    const displayName = String(body.displayName || "Athlete").trim().slice(0, 40);
    const bodyweightKg = body.bodyweightKg != null ? Number(body.bodyweightKg) : null;
    if (!profileId) return json(res, 400, { error: "profileId required" });

    let user = db.users.find((u) => u.lifepilotProfileId === profileId);
    if (!user) {
      user = {
        id: uid(),
        name: displayName,
        created: new Date().toISOString(),
        lifepilot: true,
        lifepilotProfileId: profileId,
        sv: 0,
      };
      db.users.push(user);
      saveDb();

      const seeded = starterRoutines();
      const state = buildInitialState(bodyweightKg, seeded);
      atomicWrite(stateFile(user.id), JSON.stringify(state));

      json(res, 200, {
        openGymUserId: user.id,
        routines: routineMappingsFromState(state),
      });
      return;
    }

    const state = readState(user.id) || buildInitialState(bodyweightKg);
    if (!state.routines?.length) {
      const seeded = starterRoutines();
      applySeededRoutinesToState(state, seeded);
      state._ts = Date.now();
      atomicWrite(stateFile(user.id), JSON.stringify(state));
      json(res, 200, {
        openGymUserId: user.id,
        routines: routineMappingsFromState(state),
      });
      return;
    }

    json(res, 200, { openGymUserId: user.id, routines: routineMappingsFromState(state) });
  };

  routes["POST /integrations/lifepilot/routines"] = async (req, res) => {
    if (!verifyServiceAuth(req)) return json(res, 401, { error: "unauthorized" });
    schedulePendingFlush(completionRelay);
    const body = await readBody(req);
    const openGymUserId = String(body.openGymUserId || "");
    const profileId = String(body.profileId || "");
    if (!openGymUserId || !profileId) {
      return json(res, 400, { error: "openGymUserId and profileId required" });
    }

    const user = db.users.find((u) => u.id === openGymUserId && u.lifepilotProfileId === profileId);
    if (!user) return json(res, 404, { error: "user not found" });

    const state = readState(user.id);
    if (!state) return json(res, 404, { error: "state not found" });

    json(res, 200, { routines: routineMappingsFromState(state) });
  };

  routes["POST /integrations/lifepilot/manage-session"] = async (req, res) => {
    if (!verifyServiceAuth(req)) return json(res, 401, { error: "unauthorized" });
    schedulePendingFlush(completionRelay);
    const body = await readBody(req);
    const openGymUserId = String(body.openGymUserId || "");
    const profileId = String(body.profileId || "");
    if (!openGymUserId || !profileId) {
      return json(res, 400, { error: "openGymUserId and profileId required" });
    }

    const user = db.users.find((u) => u.id === openGymUserId && u.lifepilotProfileId === profileId);
    if (!user) return json(res, 404, { error: "user not found" });

    const exp = Date.now() + 5 * 60 * 1000;
    const token = signBridgeToken({
      mode: "manage",
      openGymUserId,
      profileId,
      exp,
    });

    json(res, 200, { token, openGymUserId, expiresAt: exp });
  };

  routes["POST /integrations/lifepilot/session"] = async (req, res) => {
    if (!verifyServiceAuth(req)) return json(res, 401, { error: "unauthorized" });
    schedulePendingFlush(completionRelay);
    const body = await readBody(req);
    const openGymUserId = String(body.openGymUserId || "");
    const profileId = String(body.profileId || "");
    const externalSessionId = String(body.externalSessionId || "");
    const routineId = String(body.routineId || "");
    if (!openGymUserId || !profileId || !externalSessionId || !routineId) {
      return json(res, 400, { error: "missing required fields" });
    }

    const user = db.users.find((u) => u.id === openGymUserId && u.lifepilotProfileId === profileId);
    if (!user) return json(res, 404, { error: "user not found" });

    const exp = Date.now() + 5 * 60 * 1000;
    const token = signBridgeToken({
      mode: "workout",
      openGymUserId,
      profileId,
      externalSessionId,
      routineId,
      wellnessOccurrenceId: body.wellnessOccurrenceId || null,
      bodyweightKg: body.bodyweightKg != null ? Number(body.bodyweightKg) : null,
      exp,
    });

    json(res, 200, { token, openGymUserId, expiresAt: exp });
  };

  routes["POST /integrations/lifepilot/exchange-token"] = async (req, res) => {
    schedulePendingFlush(completionRelay);
    const body = await readBody(req);
    const payload = verifyBridgeToken(String(body.token || ""));
    if (!payload) return json(res, 401, { error: "invalid token" });

    const user = db.users.find((u) => u.id === payload.openGymUserId);
    if (!user) return json(res, 404, { error: "user not found" });
    if (user.lifepilotProfileId !== payload.profileId) {
      return json(res, 403, { error: "profile mismatch" });
    }

    const mode = payload.mode === "manage" ? "manage" : "workout";
    if (mode === "workout") {
      if (!payload.externalSessionId || !payload.routineId) {
        return json(res, 400, { error: "workout token missing session context" });
      }
      if (payload.bodyweightKg != null) {
        const state = readState(user.id) || buildInitialState(payload.bodyweightKg);
        const today = new Date().toISOString().slice(0, 10);
        const existing = (state.bodyweight || []).filter((entry) => entry.d !== today);
        state.bodyweight = [...existing, { d: today, w: payload.bodyweightKg }];
        atomicWrite(stateFile(user.id), JSON.stringify(state));
      }
    }

    json(
      res,
      200,
      {
        user: { id: user.id, name: user.name, admin: false },
        context: {
          mode,
          profileId: payload.profileId,
          openGymUserId: payload.openGymUserId,
          externalSessionId: payload.externalSessionId || null,
          routineId: payload.routineId || null,
          wellnessOccurrenceId: payload.wellnessOccurrenceId || null,
          bodyweightKg: payload.bodyweightKg ?? null,
        },
      },
      { "Set-Cookie": sessionCookie(user) },
    );
  };

  routes["POST /integrations/lifepilot/bodyweight"] = async (req, res) => {
    if (!verifyServiceAuth(req)) return json(res, 401, { error: "unauthorized" });
    schedulePendingFlush(completionRelay);
    const body = await readBody(req);
    const openGymUserId = String(body.openGymUserId || "");
    const bodyweightKg = Number(body.bodyweightKg);
    const recordedDate = String(body.recordedDate || new Date().toISOString().slice(0, 10));
    if (!openGymUserId || !Number.isFinite(bodyweightKg)) {
      return json(res, 400, { error: "invalid bodyweight payload" });
    }

    const state = readState(openGymUserId);
    if (!state) return json(res, 404, { error: "state not found" });
    const existing = (state.bodyweight || []).filter((entry) => entry.d !== recordedDate);
    state.bodyweight = [...existing, { d: recordedDate, w: bodyweightKg }];
    state._ts = Date.now();
    atomicWrite(stateFile(openGymUserId), JSON.stringify(state));
    json(res, 200, { ok: true });
  };

  routes["POST /integrations/lifepilot/exercise-names"] = async (req, res) => {
    if (!verifyServiceAuth(req)) return json(res, 401, { error: "unauthorized" });
    schedulePendingFlush(completionRelay);
    const body = await readBody(req);
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
    json(res, 200, { names: openGymExerciseNames(ids) });
  };

  routes["POST /integrations/lifepilot/complete"] = async (req, res) => {
    schedulePendingFlush(completionRelay);
    const user = deps.readSession(req);
    if (!user || !user.lifepilot) return json(res, 401, { error: "not signed in" });
    const body = await readBody(req);
    const workout = body.workout;
    const context = body.context;
    if (!workout || !context) return json(res, 400, { error: "workout and context required" });

    try {
      const payload = normalizeWorkoutCompletion(workout, {
        ...context,
        openGymUserId: user.id,
        profileId: user.lifepilotProfileId,
      });
      const result = await completionRelay.relayPayload(payload);
      json(res, 200, { ok: true, lifepilot: result });
    } catch (error) {
      console.error("lifepilot completion relay failed", error);
      json(res, 502, { error: "completion relay failed", queued: true });
    }
  };

  return { LIFEPILOT_MODE, completionRelay };
}
