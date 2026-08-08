import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createLifePilotCompletionRelay } from "./lifepilot-completion-relay.js";

function samplePayload(overrides = {}) {
  return {
    externalSessionId: "ext-session-restart-1",
    profileId: "profile-1",
    openGymUserId: "og-user-1",
    wellnessOccurrenceId: "occ-1",
    externalRoutineId: "routine-1",
    routineName: "Push Day",
    startedAt: "2026-08-08T01:00:00.000Z",
    completedAt: "2026-08-08T02:00:00.000Z",
    durationSeconds: 3600,
    exercises: [],
    ...overrides,
  };
}

function makeTempDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "opengym-relay-"));
}

test("persists signed completion after inline retries fail and delivers after restart", async () => {
  const dataDir = makeTempDataDir();
  let fetchCalls = 0;

  const failingFetch = async () => {
    fetchCalls += 1;
    return {
      ok: false,
      status: 503,
      text: async () => "LifePilot unavailable",
    };
  };

  const relayBeforeRestart = createLifePilotCompletionRelay({
    dataDir,
    serviceSecret: "test-secret",
    completionUrl: "http://lifepilot.test/api/integrations/opengym/completions",
    fetchFn: failingFetch,
    delay: async () => {},
  });

  await assert.rejects(
    () => relayBeforeRestart.relayPayload(samplePayload()),
    /LifePilot completion failed/,
  );

  assert.equal(fetchCalls, 3, "inline relay should retry three times before persisting");
  const pendingAfterFailure = relayBeforeRestart.loadPendingEntries();
  assert.equal(pendingAfterFailure.length, 1);
  assert.equal(pendingAfterFailure[0].externalSessionId, "ext-session-restart-1");
  assert.ok(pendingAfterFailure[0].rawBody.includes("ext-session-restart-1"));
  assert.equal(typeof pendingAfterFailure[0].signature, "string");
  assert.ok(fs.existsSync(relayBeforeRestart.pendingFile));

  fetchCalls = 0;
  const succeedingFetch = async (_url, init) => {
    fetchCalls += 1;
    const body = JSON.parse(init.body);
    assert.equal(body.externalSessionId, "ext-session-restart-1");
    assert.equal(init.headers["x-opengym-signature"], pendingAfterFailure[0].signature);
    assert.equal(init.body, pendingAfterFailure[0].rawBody);
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, sessionId: "session-1", status: "completed" }),
    };
  };

  const relayAfterRestart = createLifePilotCompletionRelay({
    dataDir,
    serviceSecret: "test-secret",
    completionUrl: "http://lifepilot.test/api/integrations/opengym/completions",
    fetchFn: succeedingFetch,
    delay: async () => {},
  });

  const flushResult = await relayAfterRestart.flushPendingOnStartup();
  assert.equal(flushResult.flushed, 1);
  assert.equal(flushResult.remaining, 0);
  assert.equal(fetchCalls, 1);
  assert.equal(relayAfterRestart.loadPendingEntries().length, 0);
});

test("removes pending entry only after a successful 2xx delivery", async () => {
  const dataDir = makeTempDataDir();
  let shouldFail = true;

  const fetchFn = async () => {
    if (shouldFail) {
      return {
        ok: false,
        status: 503,
        text: async () => "temporary outage",
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    };
  };

  const relay = createLifePilotCompletionRelay({
    dataDir,
    serviceSecret: "test-secret",
    completionUrl: "http://lifepilot.test/api/integrations/opengym/completions",
    fetchFn,
    delay: async () => {},
  });

  await assert.rejects(() => relay.relayPayload(samplePayload({ externalSessionId: "ext-2" })));
  assert.equal(relay.loadPendingEntries().length, 1);

  const stillPending = await relay.flushPending();
  assert.equal(stillPending.flushed, 0);
  assert.equal(stillPending.remaining, 1);
  assert.equal(relay.loadPendingEntries().length, 1);

  shouldFail = false;
  const delivered = await relay.flushPending();
  assert.equal(delivered.flushed, 1);
  assert.equal(delivered.remaining, 0);
  assert.equal(relay.loadPendingEntries().length, 0);
});

test("deduplicates pending entries by externalSessionId", async () => {
  const dataDir = makeTempDataDir();
  const fetchFn = async () => ({
    ok: false,
    status: 503,
    text: async () => "down",
  });

  const relay = createLifePilotCompletionRelay({
    dataDir,
    serviceSecret: "test-secret",
    completionUrl: "http://lifepilot.test/api/integrations/opengym/completions",
    fetchFn,
    delay: async () => {},
  });

  await assert.rejects(() => relay.relayPayload(samplePayload({ externalSessionId: "ext-dup" })));
  await assert.rejects(() =>
    relay.relayPayload(samplePayload({ externalSessionId: "ext-dup", routineName: "Updated Name" })),
  );

  const pending = relay.loadPendingEntries();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].externalSessionId, "ext-dup");
  assert.ok(pending[0].rawBody.includes("Updated Name"));
});
