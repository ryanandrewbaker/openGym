import { useEffect, useRef, useState } from 'react'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'
import { Button } from './ui.jsx'
import { EXERCISE_VIDEO_UNAVAILABLE, exerciseVideoEligible, exerciseVideoUrl } from '../lib/exercise-videos.js'

function ExerciseVideoPanel({ exerciseId, exerciseName, close }) {
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
    const video = videoRef.current
    if (video) {
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
  }, [url, exerciseId])

  const onLoaded = () => setPhase('ready')
  const onError = () => setPhase('error')

  const retry = () => {
    if (!url) return
    setPhase('loading')
    const video = videoRef.current
    if (!video) return
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
              preload="metadata"
              onLoadedData={onLoaded}
              onError={onError}
              data-nodrag
            />
            {phase === 'loading' && <div className="exvideo-overlay dim">{t('Loading…')}</div>}
            {phase === 'error' && (
              <div className="exvideo-overlay">
                <p className="exvideo-msg">{EXERCISE_VIDEO_UNAVAILABLE}</p>
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
