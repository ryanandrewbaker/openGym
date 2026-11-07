import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { parseHTML } from 'linkedom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EXERCISE_VIDEO_LOAD_FAILED,
  EXERCISE_VIDEO_UNAVAILABLE,
  exerciseVideoUrl,
} from '../lib/exercise-videos.js'

vi.mock('../store/useUI.js', () => ({
  useUI: { getState: () => ({ openSheet: vi.fn() }) },
}))
vi.mock('../components/Icon.jsx', () => ({
  default: props => React.createElement('span', props),
}))
vi.mock('../components/ui.jsx', () => ({
  Button: ({ children, onClick }) => React.createElement('button', { type: 'button', onClick }, children),
}))

const { ExerciseVideoPanel } = await import('./ExerciseVideo.jsx')

let dom
let root
let container

describe('ExerciseVideoPanel', () => {
  beforeEach(() => {
    dom = parseHTML('<!doctype html><html><body></body></html>')
    global.document = dom.document
    global.window = dom.window
    global.Node = dom.window.Node
    global.HTMLElement = dom.window.HTMLElement
    global.HTMLVideoElement = dom.window.HTMLVideoElement
    container = dom.document.createElement('div')
    dom.document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  it('shows catalogue unavailable copy when exercise has no approved video', () => {
    act(() => {
      root.render(
        <ExerciseVideoPanel exerciseId="9999" exerciseName="Unknown" close={() => {}} />,
      )
    })
    expect(container.textContent).toContain(EXERCISE_VIDEO_UNAVAILABLE)
    expect(container.querySelector('video')).toBeNull()
  })

  it('retains the mp4 src after mount so the element can load (MASIS-82)', async () => {
    const url = exerciseVideoUrl('0334')
    expect(url).toMatch(/cfe63ff8dd124526\.mp4$/)

    act(() => {
      root.render(
        <ExerciseVideoPanel exerciseId="0334" exerciseName="Lateral Raise" close={() => {}} />,
      )
    })
    await act(async () => {
      await Promise.resolve()
    })

    const video = container.querySelector('video')
    expect(video).not.toBeNull()
    expect(video.getAttribute('src')).toBe(url)
    expect(container.textContent).toContain('Loading')
  })

  it('shows playback failure copy and retry after load timeout', () => {
    vi.useFakeTimers()
    act(() => {
      root.render(
        <ExerciseVideoPanel exerciseId="0334" exerciseName="Lateral Raise" close={() => {}} />,
      )
    })
    act(() => {
      vi.advanceTimersByTime(20_001)
    })
    expect(container.textContent).toContain(EXERCISE_VIDEO_LOAD_FAILED)
    expect(container.textContent).toContain('Retry')
  })
})
