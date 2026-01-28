import React, { useMemo } from 'react';
import { observer } from 'mobx-react';
import { StoreContext } from '../../mobx';
import styles from './Timeline.module.scss';

/**
 * TimelineRuler - Professional timeline ruler showing time markers
 * Displays time markers above the timeline for precise editing
 */
const TimelineRuler = observer(({ scale = 1 }) => {
  const store = React.useContext(StoreContext);
  const timelineGridRef = React.useRef(null);

  // Calculate ruler markers based on zoom level and max time
  // Enhanced with frame-accurate markers for professional video editing
  const rulerMarkers = useMemo(() => {
    if (!store || !store.maxTime) return [];

    const markers = [];
    const maxTimeSeconds = store.maxTime / 1000;
    const fps = store.fps || 30; // Default to 30fps if not set
    const frameDuration = 1 / fps; // Duration of one frame in seconds
    
    // Determine interval based on zoom level
    // At higher zoom (larger scale), show more detailed markers including frames
    let intervalSeconds = 10; // Default: 10 second intervals
    let showFrames = false; // Whether to show frame markers
    let frameInterval = 1; // Show every Nth frame
    
    if (scale > 30) {
      // Very zoomed in: Show individual frames
      intervalSeconds = frameDuration;
      showFrames = true;
      frameInterval = 1;
    } else if (scale > 20) {
      // Very zoomed in: Show every 5 frames or 0.1s intervals
      intervalSeconds = Math.max(frameDuration * 5, 0.1);
      showFrames = true;
      frameInterval = 5;
    } else if (scale > 15) {
      // Zoomed in: Show every 10 frames or 0.2s intervals
      intervalSeconds = Math.max(frameDuration * 10, 0.2);
      showFrames = true;
      frameInterval = 10;
    } else if (scale > 10) {
      intervalSeconds = 1; // 1 second intervals
      showFrames = false;
    } else if (scale > 5) {
      intervalSeconds = 5; // 5 second intervals
      showFrames = false;
    } else if (scale > 2) {
      intervalSeconds = 10; // 10 second intervals
      showFrames = false;
    } else if (scale > 1) {
      intervalSeconds = 30; // 30 second intervals
      showFrames = false;
    } else {
      intervalSeconds = 60; // 1 minute intervals
      showFrames = false;
    }

    // Generate markers
    if (showFrames) {
      // Frame-accurate markers
      const maxFrames = Math.ceil(maxTimeSeconds * fps);
      for (let frame = 0; frame <= maxFrames; frame += frameInterval) {
        const timeSeconds = frame * frameDuration;
        const timeMs = timeSeconds * 1000;
        const position = (timeMs / store.maxTime) * 100;
        
        // Major markers every second (or every 30 frames at 30fps)
        const isMajor = frame % fps === 0;
        // Minor markers every 10 frames
        const isMinor = frame % (fps / 3) === 0;
        
        markers.push({
          time: timeSeconds,
          timeMs,
          position,
          frame,
          isMajor,
          isMinor,
          isFrame: true,
        });
      }
    } else {
      // Time-based markers (seconds/minutes)
      for (let time = 0; time <= maxTimeSeconds; time += intervalSeconds) {
        const timeMs = time * 1000;
        const position = (timeMs / store.maxTime) * 100;
        
        // Major markers every 5 intervals
        const isMajor = time % (intervalSeconds * 5) === 0;
        
        markers.push({
          time,
          timeMs,
          position,
          isMajor,
          isMinor: !isMajor,
          isFrame: false,
        });
      }
    }

    return markers;
  }, [store?.maxTime, store?.fps, scale]);

  // Format time for display with frame support
  const formatTime = (seconds, frame = null, fps = 30) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    
    if (frame !== null && scale > 15) {
      // Show frame number when very zoomed in
      return `${mins}:${secs.toString().padStart(2, '0')}:${frame.toString().padStart(2, '0')}`;
    } else if (scale > 20) {
      // Show milliseconds when very zoomed in
      return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    } else if (scale > 10) {
      // Show seconds
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    } else {
      // Show minutes:seconds
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
  };

  if (!store || !store.maxTime) return null;

  const fps = store?.fps || 30;

  return (
    <div className={styles.timelineRuler} ref={timelineGridRef}>
      <div className={styles.rulerContainer}>
        {rulerMarkers.map((marker, index) => (
          <div
            key={`marker-${marker.timeMs}-${marker.frame || 0}-${index}`}
            className={`${styles.rulerMarker} ${
              marker.isMajor ? styles.majorMarker : marker.isMinor ? styles.minorMarker : styles.frameMarker
            }`}
            style={{
              left: `${marker.position}%`,
            }}
          >
            <div className={styles.rulerLine} />
            {(marker.isMajor || (marker.isMinor && scale > 15)) && (
              <div className={styles.rulerLabel}>
                {formatTime(marker.time, marker.frame, fps)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
});

export default TimelineRuler;
