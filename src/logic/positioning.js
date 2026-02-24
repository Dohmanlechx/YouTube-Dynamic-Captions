import { config } from '../config.js';
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
    // Only track when EXACTLY 1 face is visible.
    // 0 faces = nobody on screen, 2+ faces = conversation/crowd — both reset to default.
    if (!results.detections || results.detections.length !== 1) {
        clearDebugBox();

        // Record when we first lost the face
        if (state.lastFaceSeenAt !== null) {
            const elapsedMs = Date.now() - state.lastFaceSeenAt;
            if (elapsedMs >= config.RESET_DELAY_SECONDS * 1000) {
                state.lastCaptionX = null;
                state.lastCaptionY = null;
                state.lastFaceSeenAt = null;
                resetCaptionPosition();
            }
        }
        return;
    }

    // Face is visible — record the timestamp
    state.lastFaceSeenAt = Date.now();

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

    // Calculate video bounds relative to the player container
    const videoRelativeLeft = videoRect.left - playerRect.left;
    const videoRelativeTop = videoRect.top - playerRect.top;
    const videoRelativeWidth = videoRect.width;
    const videoRelativeHeight = videoRect.height;

    // Draw visual debugging rectangle if enabled
    drawDebugBox(videoRect, playerContainer, bbox, scaleX, scaleY);

    // Add some spacing to separate the text from the chin
    const verticalOffset = 20;

    // Use the first active caption window to gauge the text box dimensions
    const sampleWindow = activeCaptionWindows[0];
    let halfWidth = 80; // safe default fallback (reduced from 100)
    let captionHeight = 40;

    if (sampleWindow) {
        const rect = sampleWindow.getBoundingClientRect();
        if (rect.width > 50) { // Only use if we have a reasonable size
            halfWidth = rect.width / 2;
            captionHeight = rect.height;
        }
    }

    // Ensure minimum bounds based on expected caption size
    const minHalfWidth = 50;
    halfWidth = Math.max(halfWidth, minHalfWidth);

    // Dynamic Edge Bounding:
    // First, calculate the ideal position based on face location
    let targetX = relativeX;
    let targetY = relativeY + verticalOffset;

    // Get the video boundaries within the player container
    const videoLeft = videoRect.left - playerRect.left;
    const videoRight = videoLeft + videoRect.width;
    const videoTop = videoRect.top - playerRect.top;
    const videoBottom = videoTop + videoRect.height;

    // Check and correct for left edge collision
    const captionLeftEdge = targetX - halfWidth;
    if (captionLeftEdge < videoLeft) {
        targetX = videoLeft + halfWidth;
    }

    // Check and correct for right edge collision
    const captionRightEdge = targetX + halfWidth;
    if (captionRightEdge > videoRight) {
        targetX = videoRight - halfWidth;
    }

    // Ensure it doesn't clip off the top or bottom
    if (targetY < videoTop) {
        targetY = videoTop;
    }
    if (targetY + captionHeight > videoBottom) {
        targetY = videoBottom - captionHeight;
    }

    let updateRequired = false;

    if (state.lastCaptionX === null || state.lastCaptionY === null) {
        state.lastCaptionX = targetX;
        state.lastCaptionY = targetY;
        updateRequired = true;
    } else {
        const dx = targetX - state.lastCaptionX;
        const dy = targetY - state.lastCaptionY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (config.POSITION_UPDATE_THRESHOLD < 50) {
            // Premium smooth tracking (Lerp): Move a percentage of the distance per frame
            if (distance > 1.0) {
                // 0.15 lerp factor at 60fps produces a very smooth, "gimbal-like" camera follow effect
                state.lastCaptionX += dx * 0.15;
                state.lastCaptionY += dy * 0.15;
                updateRequired = true;
            }
        } else {
            // Battery-saving snap: Only update position if moved significantly
            if (distance > config.POSITION_UPDATE_THRESHOLD) {
                state.lastCaptionX = targetX;
                state.lastCaptionY = targetY;
                updateRequired = true;
            }
        }
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
