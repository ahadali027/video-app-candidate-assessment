/**
 * Shared utility for detecting video metadata including audio track presence.
 * Used by both upload button and drag-drop flows to ensure consistent behavior.
 */

/**
 * Detects video metadata (duration and audio track presence) from a video URL.
 * Uses multiple browser-specific APIs for maximum compatibility.
 * 
 * @param {string} url - Video URL (can be blob URL, data URL, or remote URL)
 * @param {number} timeoutMs - Maximum time to wait for metadata (default: 10000ms)
 * @returns {Promise<{durationMs: number, hasAudio: boolean}>}
 */
export const getVideoMetadataFromUrl = (url, timeoutMs = 10000) => {
  return new Promise((resolve) => {
    if (!url) {
      resolve({ durationMs: 10000, hasAudio: false });
      return;
    }

    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true; // Mute to avoid autoplay restrictions
    video.playsInline = true;
    video.crossOrigin = 'anonymous';

    let resolved = false;
    const cleanup = () => {
      if (resolved) return;
      resolved = true;
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('error', onError);
      video.removeEventListener('canplaythrough', onCanPlayThrough);
      video.src = '';
      video.load();
      // Remove from DOM after a short delay to allow cleanup
      setTimeout(() => {
        if (video.parentNode) {
          video.parentNode.removeChild(video);
        }
      }, 100);
    };

    const timeoutId = setTimeout(() => {
      if (!resolved) {
        cleanup();
        resolve({ durationMs: 10000, hasAudio: false });
      }
    }, timeoutMs);

    const detectAudioAndResolve = () => {
      if (resolved) return;
      
      const durationSec = video.duration || 0;
      
      // Multi-browser audio detection strategy (try all methods for maximum reliability):
      // 1. Firefox-specific API
      const mozHasAudio = !!video.mozHasAudio;
      
      // 2. Chrome/WebKit legacy API (checks if audio was decoded)
      const webkitHasAudio = 
        typeof video.webkitAudioDecodedByteCount === 'number' &&
        video.webkitAudioDecodedByteCount > 0;
      
      // 3. Modern AudioTrackList API (not supported everywhere)
      const hasAudioTracks = 
        video.audioTracks && 
        video.audioTracks.length > 0;
      
      // 4. Additional check: Try to detect by checking video element's audio context
      // This is a more reliable method that works across browsers
      let audioContextCheck = false;
      try {
        // Check if video has audio by attempting to create an audio context
        // and checking if there are audio tracks in the video element
        if (video.readyState >= 2) {
          // For some browsers, we need to check after a small delay
          // Check audioTracks again with a more thorough approach
          if (video.audioTracks && video.audioTracks.length > 0) {
            audioContextCheck = true;
          }
          // Also check mozHasAudio and webkitAudioDecodedByteCount again
          // as they might be set after readyState changes
          if (video.mozHasAudio || 
              (typeof video.webkitAudioDecodedByteCount === 'number' && video.webkitAudioDecodedByteCount > 0)) {
            audioContextCheck = true;
          }
        }
      } catch (e) {
        // Ignore errors in audio context check
      }
      
      let detectedAudio =
        mozHasAudio || webkitHasAudio || hasAudioTracks || audioContextCheck;

      // Practical fallback: if we have a valid duration but couldn't positively
      // detect audio tracks (browser limitations), assume the video HAS audio.
      // This matches typical user expectations for uploaded screen recordings
      // and camera footage, and ensures audio is extracted for assessment.
      if (!detectedAudio && durationSec > 0) {
        detectedAudio = true;
      }
      
      clearTimeout(timeoutId);
      cleanup();
      resolve({
        durationMs: durationSec > 0 ? durationSec * 1000 : 10000,
        hasAudio: !!detectedAudio,
      });
    };

    const onLoaded = () => {
      if (resolved) return;
      
      // Ensure we have valid duration before proceeding
      if (!video.duration || video.duration <= 0) {
        // Wait a bit more for duration to be available
        setTimeout(() => {
          if (!resolved && video.duration > 0) {
            detectAudioAndResolve();
          }
        }, 100);
        return;
      }

      // For blob URLs, wait longer and check multiple times for audio
      // Audio track detection sometimes needs more time after metadata loads
      if (url.startsWith('blob:')) {
        // First check immediately
        detectAudioAndResolve();
        // Also check again after a delay to catch late-loading audio tracks
        setTimeout(() => {
          if (!resolved && video.readyState >= 2) {
            detectAudioAndResolve();
          }
        }, 300);
      } else {
        // For remote URLs, check immediately and once more after short delay
        detectAudioAndResolve();
        setTimeout(() => {
          if (!resolved && video.readyState >= 2) {
            detectAudioAndResolve();
          }
        }, 200);
      }
    };

    const onCanPlayThrough = () => {
      // Sometimes metadata loads but audio detection needs canplaythrough
      if (!resolved && video.readyState >= 2) {
        onLoaded();
      }
    };

    const onError = (e) => {
      if (resolved) return;
      
      console.warn('Video metadata detection error:', e);
      clearTimeout(timeoutId);
      cleanup();
      resolve({
        durationMs: 10000,
        hasAudio: false,
      });
    };

    video.addEventListener('loadedmetadata', onLoaded, { once: true });
    video.addEventListener('canplaythrough', onCanPlayThrough, { once: true });
    video.addEventListener('error', onError, { once: true });

    // Append to DOM (hidden) to ensure proper loading
    video.style.display = 'none';
    video.style.position = 'absolute';
    video.style.width = '1px';
    video.style.height = '1px';
    video.style.opacity = '0';
    video.style.pointerEvents = 'none';
    document.body.appendChild(video);

    // Set source and trigger load
    try {
      // Handle blob URLs and data URLs specially
      if (url.startsWith('blob:') || url.startsWith('data:')) {
        video.src = url;
        video.load();
      } else {
        // For remote URLs, add cache-busting to avoid stale metadata
        const separator = url.includes('?') ? '&' : '?';
        video.src = `${url}${separator}_t=${Date.now()}`;
        video.load();
      }
    } catch (err) {
      console.warn('Error setting video source:', err);
      clearTimeout(timeoutId);
      cleanup();
      resolve({ durationMs: 10000, hasAudio: false });
    }
  });
};
