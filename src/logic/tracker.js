import { config } from '../config.js';
import { state } from '../state.js';
import { injectToggleButton } from '../ui/toggle.js';
import { handleDetectionResults, resetCaptionPosition } from './positioning.js';

export function startDetectionLoop() {
    if (!state.faceDetector || state.isDetecting) return;
    state.isDetecting = true;

    let lastProcessedTimeMs = -1;

    const loop = (timestamp) => {
        injectToggleButton();

        // Calculate target FPS dynamically based on user config smoothness
        const targetFPS = config.POSITION_UPDATE_THRESHOLD < 50 ? 60 : 5;
        const frameIntervalMs = 1000 / targetFPS;

        // CPU Optimization: Stop completely if the user switches to a different browser tab
        // Also pause if the user disabled the extension via the player toggle button
        if (!state.isDetecting || document.hidden || !state.extensionEnabled) {
            if (!state.extensionEnabled && (state.lastCaptionX !== null || state.lastCaptionY !== null)) {
                state.lastCaptionX = null;
                state.lastCaptionY = null;
                resetCaptionPosition();
            }
            state.animationFrameId = requestAnimationFrame(loop);
            return;
        }

        const videoElement = document.querySelector('video.html5-main-video');

        // Grab ALL active caption windows. YouTube often keeps ghost elements in the DOM.
        // We must apply positions to all of them so the actual visible one isn't missed.
        const activeCaptionWindows = Array.from(document.querySelectorAll('.caption-window'))
            .filter(cw => cw.style.display !== 'none' && window.getComputedStyle(cw).display !== 'none');

        // Wait until the video is fully loaded and has non-zero dimensions
        if (videoElement && !videoElement.paused && videoElement.readyState >= 2 && videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
            if (timestamp - lastProcessedTimeMs >= frameIntervalMs) {
                lastProcessedTimeMs = timestamp;

                try {
                    const results = state.faceDetector.detectForVideo(videoElement, performance.now());
                    handleDetectionResults(results, videoElement, activeCaptionWindows);
                } catch (e) {
                    console.error("[Dynamic Captions] Detection error:", e);
                }
            }
        } else {
            resetCaptionPosition();
        }

        state.animationFrameId = requestAnimationFrame(loop);
    };

    state.animationFrameId = requestAnimationFrame(loop);
}
