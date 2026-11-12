import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { beep } from "./sound.js";

describe("sound in LifePilot embed", () => {
  const sessionStore = {};
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", {
      getItem: (key) => sessionStore[key] ?? null,
      setItem: (key, value) => { sessionStore[key] = String(value); },
      removeItem: (key) => { delete sessionStore[key]; },
      clear: () => { Object.keys(sessionStore).forEach((key) => delete sessionStore[key]); },
    });
    vi.stubGlobal("AudioContext", vi.fn(() => ({
      createOscillator: () => ({
        connect: () => {},
        frequency: {},
        type: "",
        start: () => {},
        stop: () => {},
      }),
      createGain: () => ({
        connect: () => {},
        gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
      }),
      destination: {},
      currentTime: 0,
    })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.keys(sessionStore).forEach((key) => delete sessionStore[key]);
  });

  it("skips WebAudio beeps during hosted workout embed", () => {
    sessionStorage.setItem("lp_context", JSON.stringify({ mode: "workout" }));
    beep(true, 880, 0.12);
    expect(AudioContext).not.toHaveBeenCalled();
  });

});
