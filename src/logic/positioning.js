import { POSITION_UPDATE_THRESHOLD } from '../config.js';
import { state } from '../state.js';
import { clearDebugBox, drawDebugBox } from '../ui/debug.js';

export function resetCaptionPosition() {
    clearDebugBox();

    // We intentionally DO NOT reset lastCaptionX and lastCaptionY here.
    // Preserving them allows the MutationObserver to instantly restore 
    // the caption's position when YouTube reconstructs the caption element

    const captionWindows = document.querySelectorAll('.caption-window');
    for (const captionWindow of captionWindows) {
        if (captionWindow.classList.contains('dynamic-positioned')) {
            captionWindow.classList.remove('dynamic-positioned');
            captionWindow.style.removeProperty('--caption-left');
            captionWindow.style.removeProperty('--caption-top');
        }
    }
}

export function handleDetectionResults(results, videoElement, activeCaptionWindows) {
    // If no face is found, wait a few frames before resetting to YouTube's default
    if (!results.detections || results.detections.length !== 1) {
        clearDebugBox();
        state.consecutiveFramesWithoutFace++;
        // 3 consecutive frames (approx 3 seconds) without a face
        if (state.consecutiveFramesWithoutFace >= 3) {
            state.lastCaptionX = null;
            state.lastCaptionY = null;
            resetCaptionPosition();
        }
        return;
    }

    state.consecutiveFramesWithoutFace = 0;

    // Pick the largest face if multiple detections occur (e.g. background faces)
    let face = results.detections[0];
    if (results.detections.length > 1) {
        face = results.detections.reduce((prev, current) => {
            const prevArea = prev.boundingBox.width * prev.boundingBox.height;
            const currentArea = current.boundingBox.width * current.boundingBox.height;
            return (prevArea > currentArea) ? prev : current;
        });
    }

    const bbox = face.boundingBox;

    const videoRect = videoElement.getBoundingClientRect();

    // playerContainer is a much safer anchor because its bounds are static,
    // preventing the trackpoint from shifting erratically.
    const playerContainer = document.querySelector('.html5-video-player') || document.body;
    const playerRect = playerContainer.getBoundingClientRect();

    // MediaPipe bounding box coordinates are relative to intrinsic video size
    const scaleX = videoRect.width / videoElement.videoWidth;
    const scaleY = videoRect.height / videoElement.videoHeight;

    // Calculate screen-space coordinates of the face
    // 1. Center of the face horizontally:
    const faceCenterXScreen = videoRect.left + (bbox.originX + bbox.width / 2) * scaleX;

    // 2. Bottom of the face vertically:
    const faceBottomYScreen = videoRect.top + (bbox.originY + bbox.height) * scaleY;

    // Convert screen-space coordinates to be relative to the player container
    const relativeX = faceCenterXScreen - playerRect.left;
    const relativeY = faceBottomYScreen - playerRect.top;

    // Draw visual debugging rectangle if enabled
    drawDebugBox(videoRect, playerContainer, bbox, scaleX, scaleY);

    // Add some spacing to separate the text from the chin
    const verticalOffset = 20;

    // Use the first active caption window to gauge the text box dimensions
    const sampleWindow = activeCaptionWindows[0];
    let halfWidth = 100; // safe default fallback
    let captionHeight = 40;

    if (sampleWindow) {
        const rect = sampleWindow.getBoundingClientRect();
        if (rect.width > 0) {
            halfWidth = rect.width / 2;
            captionHeight = rect.height;
        }
    }

    // Dynamic Edge Bounding:
    // Ensure the text box doesn't get clipped by the left or right edges of the player
    // This prevents YouTube's overlap-detection scripts from resetting it.
    const padding = 50; // Increased padding to prevent edge bleeding
    const minSafeX = halfWidth + padding;
    const maxSafeX = playerRect.width - halfWidth - padding;

    // Ensure it doesn't clip off the top or bottom either
    const minSafeY = padding;
    const maxSafeY = playerRect.height - captionHeight - padding;

    const targetX = Math.max(minSafeX, Math.min(relativeX, maxSafeX));
    const targetY = Math.max(minSafeY, Math.min(relativeY + verticalOffset, maxSafeY));

    let updateRequired = false;

    if (state.lastCaptionX === null || state.lastCaptionY === null) {
        updateRequired = true;
    } else {
        const dx = targetX - state.lastCaptionX;
        const dy = targetY - state.lastCaptionY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > POSITION_UPDATE_THRESHOLD) {
            updateRequired = true;
        }
    }

    if (updateRequired) {
        state.lastCaptionX = targetX;
        state.lastCaptionY = targetY;
    }

    // Apply custom variables to ALL identified active caption windows
    for (const captionWindow of activeCaptionWindows) {
        let positionJustApplied = false;

        // Always ensure the CSS class is applied as long as a single face is visible
        if (!captionWindow.classList.contains('dynamic-positioned')) {
            captionWindow.classList.add('no-transition');
            captionWindow.classList.add('dynamic-positioned');
            positionJustApplied = true;
        }

        // Always ensure the CSS variables are present. If we just re-applied the class,
        // or if updateRequired is true, we must inject the properties.
        if (positionJustApplied || updateRequired) {
            captionWindow.style.setProperty('--caption-left', `${state.lastCaptionX}px`);
            captionWindow.style.setProperty('--caption-top', `${state.lastCaptionY}px`);
        }

        // Force the browser to render the styles instantly without animation
        if (positionJustApplied) {
            captionWindow.offsetHeight; // Force reflow
            captionWindow.classList.remove('no-transition');
        }
    }
}
