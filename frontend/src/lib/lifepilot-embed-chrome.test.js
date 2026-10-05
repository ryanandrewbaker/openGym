import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";

const memory = new Map();

function memoryStorage() {
  return {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: (key) => memory.delete(key),
    clear: () => memory.clear(),
  };
}

let applyLifePilotEmbedChrome;
let stashLifePilotEmbedParams;
let syncHostedChrome;
let locationRef;

function installBrowser({ search = "", htmlAttrs = "" } = {}) {
  memory.clear();
  const store = memoryStorage();
  const { document, window } = parseHTML(
    `<!DOCTYPE html><html ${htmlAttrs}><head><meta name="theme-color" content="#000000"></head><body></body></html>`,
  );
  locationRef = { search, href: `https://example.test/${search}` };
  Object.defineProperty(window, "location", {
    configurable: true,
    get() {
      return locationRef;
    },
  });
  window.sessionStorage = store;
  window.localStorage = store;
  window.history = { replaceState() {} };
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", window);
  vi.stubGlobal("sessionStorage", store);
  vi.stubGlobal("localStorage", store);
}

async function loadChrome() {
  ({ applyLifePilotEmbedChrome, stashLifePilotEmbedParams, syncHostedChrome } = await import("./lifepilot.js"));
}

function root() {
  return document.documentElement;
}

describe("LifePilot embed chrome", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    memory.clear();
  });

  it("marks the document from embed=lifepilot and clears session theme and accent attributes", async () => {
    installBrowser({
      search: "?embed=lifepilot",
      htmlAttrs: 'data-theme="light" data-accent="lime"',
    });
    await loadChrome();

    expect(stashLifePilotEmbedParams()).toBe(true);
    expect(root().dataset.embed).toBe("lifepilot");
    expect(root().hasAttribute("data-theme")).toBe(false);
    expect(root().hasAttribute("data-accent")).toBe(false);
    expect(document.body.classList.contains("lp-embed")).toBe(true);
    expect(document.querySelector('meta[name="theme-color"]').content).toBe("#0B1E3A");
    expect(sessionStorage.getItem("gym_state_v1")).toBe(null);
    expect(sessionStorage.getItem("lp_embed_request")).toBe("1");
  });

  it("leaves theme and accent absent when chrome is applied again", async () => {
    installBrowser({
      htmlAttrs: 'data-theme="light" data-accent="sky"',
    });
    await loadChrome();

    applyLifePilotEmbedChrome();
    applyLifePilotEmbedChrome();

    expect(root().dataset.embed).toBe("lifepilot");
    expect(root().hasAttribute("data-theme")).toBe(false);
    expect(root().hasAttribute("data-accent")).toBe(false);
  });

  it("sets data-lp-mode=workout from the embed URL", async () => {
    installBrowser({ search: "?embed=lifepilot&lp_mode=workout" });
    await loadChrome();

    expect(stashLifePilotEmbedParams()).toBe(true);
    expect(root().dataset.lpMode).toBe("workout");
    expect(document.body.classList.contains("lp-hosted-workout")).toBe(true);
  });

  it("sets data-lp-mode=manage from the embed URL", async () => {
    installBrowser({ search: "?embed=lifepilot&lp_mode=manage" });
    await loadChrome();

    expect(stashLifePilotEmbedParams()).toBe(true);
    expect(root().dataset.lpMode).toBe("manage");
    expect(document.body.classList.contains("lp-hosted-workout")).toBe(false);
  });

  it("does not mark a standalone URL or clear an existing theme", async () => {
    installBrowser({
      search: "?foo=1",
      htmlAttrs: 'data-theme="dark" data-accent="orange"',
    });
    await loadChrome();

    expect(stashLifePilotEmbedParams()).toBe(false);
    expect(root().hasAttribute("data-embed")).toBe(false);
    expect(root().dataset.theme).toBe("dark");
    expect(root().dataset.accent).toBe("orange");
    expect(document.body.classList.contains("lp-embed")).toBe(false);
  });

  it("syncHostedChrome writes workout and manage modes onto the document", async () => {
    installBrowser();
    await loadChrome();

    syncHostedChrome("workout");
    expect(root().dataset.lpMode).toBe("workout");

    syncHostedChrome("manage");
    expect(root().dataset.lpMode).toBe("manage");
    expect(document.body.classList.contains("lp-hosted-workout")).toBe(false);
  });
});
