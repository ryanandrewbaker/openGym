import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const MAX_INLINE_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

function defaultAtomicWrite(file, content) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

export function createLifePilotCompletionRelay({
  dataDir,
  serviceSecret,
  completionUrl,
  fetchFn = globalThis.fetch,
  atomicWrite = defaultAtomicWrite,
  readFileSync = fs.readFileSync,
  existsSync = fs.existsSync,
  mkdirSync = fs.mkdirSync,
  now = () => Date.now(),
  delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const pendingFile = path.join(dataDir, "lifepilot-pending-completions.json");
  mkdirSync(dataDir, { recursive: true });

  function loadPendingStore() {
    if (!existsSync(pendingFile)) {
      return [];
    }
    try {
      const data = JSON.parse(readFileSync(pendingFile, "utf8"));
      return Array.isArray(data.entries) ? data.entries : [];
    } catch {
      return [];
    }
  }

  function savePendingStore(entries) {
    atomicWrite(
      pendingFile,
      JSON.stringify(
        {
          entries,
          updatedAt: new Date(now()).toISOString(),
        },
        null,
        2,
      ),
    );
  }

  function signPayload(payload) {
    const rawBody = JSON.stringify(payload);
    const signature = crypto.createHmac("sha256", serviceSecret).update(rawBody).digest("hex");
    return {
      rawBody,
      signature,
      externalSessionId: String(payload.externalSessionId || ""),
    };
  }

  async function deliverSigned({ rawBody, signature }) {
    const response = await fetchFn(completionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-opengym-signature": signature,
      },
      body: rawBody,
    });
    if (response.ok) {
      return response.json();
    }
    const text = await response.text();
    const error = new Error(`LifePilot completion failed (${response.status}): ${text}`);
    error.status = response.status;
    throw error;
  }

  function queuePendingSigned({ rawBody, signature, externalSessionId, openGymUserId, profileId }) {
    if (!externalSessionId) {
      return;
    }
    const entries = loadPendingStore().filter((entry) => entry.externalSessionId !== externalSessionId);
    entries.push({
      externalSessionId,
      rawBody,
      signature,
      openGymUserId: openGymUserId || null,
      profileId: profileId || null,
      queuedAt: new Date(now()).toISOString(),
    });
    savePendingStore(entries);
  }

  function removePending(externalSessionId) {
    if (!externalSessionId) {
      return;
    }
    const entries = loadPendingStore();
    const next = entries.filter((entry) => entry.externalSessionId !== externalSessionId);
    if (next.length !== entries.length) {
      savePendingStore(next);
    }
  }

  async function deliverWithRetries(signed) {
    let lastError;
    for (let attempt = 1; attempt <= MAX_INLINE_ATTEMPTS; attempt++) {
      try {
        return await deliverSigned(signed);
      } catch (error) {
        lastError = error;
        const retryable = !error.status || error.status >= 500 || error.status === 429;
        if (retryable && attempt < MAX_INLINE_ATTEMPTS) {
          await delay(attempt * RETRY_DELAY_MS);
          continue;
        }
        if (!retryable) {
          throw error;
        }
      }
    }
    throw lastError ?? new Error("LifePilot completion failed after retries");
  }

  async function relayPayload(payload) {
    const signed = signPayload(payload);
    if (!signed.externalSessionId) {
      throw new Error("externalSessionId required for completion relay");
    }

    try {
      const result = await deliverWithRetries(signed);
      removePending(signed.externalSessionId);
      return result;
    } catch (error) {
      queuePendingSigned({
        ...signed,
        openGymUserId: payload.openGymUserId,
        profileId: payload.profileId,
      });
      throw error;
    }
  }

  async function flushPending() {
    const entries = loadPendingStore();
    if (!entries.length) {
      return { flushed: 0, remaining: 0 };
    }

    const remaining = [];
    let flushed = 0;
    for (const entry of entries) {
      try {
        await deliverSigned(entry);
        flushed += 1;
      } catch {
        remaining.push(entry);
      }
    }
    savePendingStore(remaining);
    return { flushed, remaining: remaining.length };
  }

  return {
    relayPayload,
    flushPending,
    flushPendingOnStartup: flushPending,
    pendingFile,
    loadPendingEntries: loadPendingStore,
  };
}
