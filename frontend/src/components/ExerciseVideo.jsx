import { useEffect, useRef, useState } from 'react'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'
import { Button } from './ui.jsx'
import {
  EXERCISE_VIDEO_LOAD_FAILED,
  EXERCISE_VIDEO_UNAVAILABLE,
  exerciseVideoEligible,
  exerciseVideoUrl,
} from '../lib/exercise-videos.js'

const LOAD_TIMEOUT_MS = 20_000
const HAVE_METADATA = 1

function videoDebugEnabled() {
  if (import.meta.env?.DEV) return true
  try {
    return globalThis.localStorage?.getItem('lpVideoDebug') === '1'
  } catch {
    return false
  }
}

function logVideoDiagnostic(video, label, url) {
  if (!videoDebugEnabled()) return
  const err = video.error
  const path = typeof url === 'string' ? url.replace(/^.*\/video\//, '/video/') : null
  console.info('[MASIS-82 video]', label, {
    path,
    networkState: video.networkState,
    readyState: video.readyState,
    errorCode: err?.code ?? null,
    errorMessage: err?.message ?? null,
  })
}

export function ExerciseVideoPanel({ exerciseId, exerciseName, close }) {
  const url = exerciseVideoUrl(exerciseId)
  const eligible = exerciseVideoEligible(exerciseId)
  const [phase, setPhase] = useState(url ? 'loading' : 'unavailable')
  const videoRef = useRef(null)

  useEffect(() => {
    if (!url) {
      setPhase('unavailable')
      return
    }
    setPhase('loading')
  }, [url, exerciseId])

  useEffect(() => {
    if (phase !== 'loading' || !url) return undefined
    const timeoutId = setTimeout(() => {
      const video = videoRef.current
      if (video) logVideoDiagnostic(video, 'load-timeout', url)
      setPhase('error')
    }, LOAD_TIMEOUT_MS)
    return () => clearTimeout(timeoutId)
  }, [phase, url, exerciseId])

  useEffect(() => {
    if (!url) return undefined
    const video = videoRef.current
    if (!video) return undefined

    const promoteIfBuffered = eventLabel => {
      if (video.readyState >= HAVE_METADATA) {
        logVideoDiagnostic(video, eventLabel, url)
        setPhase('ready')
      }
    }

    const onMeta = () => promoteIfBuffered('loadedmetadata')
    const onData = () => promoteIfBuffered('loadeddata')
    const onCanPlay = () => promoteIfBuffered('canplay')
    const onPlaying = () => setPhase('ready')
    const onErr = () => {
      logVideoDiagnostic(video, 'error', url)
      setPhase('error')
    }

    video.addEventListener('loadedmetadata', onMeta)
    video.addEventListener('loadeddata', onData)
    video.addEventListener('canplay', onCanPlay)
    video.addEventListener('playing', onPlaying)
    video.addEventListener('error', onErr)
    promoteIfBuffered('mount-check')

    return () => {
      video.removeEventListener('loadedmetadata', onMeta)
      video.removeEventListener('loadeddata', onData)
      video.removeEventListener('canplay', onCanPlay)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('error', onErr)
    }
  }, [url, exerciseId])

  const markReady = () => setPhase('ready')

  const onError = () => {
    const video = videoRef.current
    if (video) logVideoDiagnostic(video, 'onError', url)
    setPhase('error')
  }

  const retry = () => {
    if (!url) return
    setPhase('loading')
    const video = videoRef.current
    if (!video) return
    video.src = url
    video.load()
  }

  return (
    <div className="exvideo-sheet" data-nodrag>
      <div className="row between" style={{ marginBottom: 10 }}>
        <h3 className="capitalize" style={{ margin: 0 }}>{exerciseName}</h3>
        <button type="button" className="iconbtn" aria-label={t('Close')} onClick={close} data-nodrag>
          <Icon name="xmark" />
        </button>
      </div>
      {!eligible || !url ? (
        <p className="exvideo-msg">{EXERCISE_VIDEO_UNAVAILABLE}</p>
      ) : (
        <>
          <div className="exvideo-frame">
            <video
              ref={videoRef}
              key={url}
              className="exvideo-player"
              src={url}
              controls
              playsInline
              preload="auto"
              onLoadedMetadata={markReady}
              onLoadedData={markReady}
              onCanPlay={markReady}
              onPlaying={markReady}
              onError={onError}
              data-nodrag
            />
            {phase === 'loading' && (
              <div className="exvideo-overlay dim" aria-hidden="true">{t('Loading…')}</div>
            )}
            {phase === 'error' && (
              <div className="exvideo-overlay">
                <p className="exvideo-msg">{EXERCISE_VIDEO_LOAD_FAILED}</p>
                <Button size="sm" icon="reset" onClick={retry}>{t('Retry')}</Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export function openExerciseVideoSheet(exerciseId, exerciseName) {
  useUI.getState().openSheet(
    close => <ExerciseVideoPanel exerciseId={exerciseId} exerciseName={exerciseName} close={close} />,
    { locked: false },
  )
}

export function ExerciseVideoButton({ exerciseId, exerciseName }) {
  const open = e => {
    e.stopPropagation()
    openExerciseVideoSheet(exerciseId, exerciseName)
  }
  return (
    <button type="button" className="tag acc nocap" aria-label={t('Video')} onClick={open} data-nodrag>
      <Icon name="play" />{t('Video')}
    </button>
  )
}
