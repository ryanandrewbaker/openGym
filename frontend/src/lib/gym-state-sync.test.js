import { describe, expect, it } from "vitest"
import {
  shouldApplyRemoteGymState,
  shouldKeepLocalActiveWorkout,
} from "./gym-state-sync.js"

describe("shouldApplyRemoteGymState", () => {
  it("always applies the server plan in a LifePilot embed", () => {
    expect(
      shouldApplyRemoteGymState({
        embed: true,
        dirty: true,
        hasLocalData: true,
        hasRemote: true,
        localTs: 9,
        remoteTs: 1,
      }),
    ).toBe(true)
  })

  it("does not push-win over a newer server plan when the phone copy is stale", () => {
    expect(
      shouldApplyRemoteGymState({
        embed: false,
        dirty: false,
        hasLocalData: true,
        hasRemote: true,
        localTs: 1,
        remoteTs: 9,
      }),
    ).toBe(true)
  })

  it("keeps dirty standalone local data until it can upload", () => {
    expect(
      shouldApplyRemoteGymState({
        embed: false,
        dirty: true,
        hasLocalData: true,
        hasRemote: true,
        localTs: 9,
        remoteTs: 1,
      }),
    ).toBe(false)
  })
})

describe("shouldKeepLocalActiveWorkout", () => {
  it("drops a leftover in-progress snapshot in LifePilot embed", () => {
    expect(shouldKeepLocalActiveWorkout(true)).toBe(false)
  })

  it("keeps an in-progress snapshot in standalone openGym", () => {
    expect(shouldKeepLocalActiveWorkout(false)).toBe(true)
  })
})
