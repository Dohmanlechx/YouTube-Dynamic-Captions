import { config } from '../config.js';

export function drawDebugBox(videoRect, playerContainer, bbox, scaleX, scaleY) {
    if (!config.DEBUG_DRAW_FACE) return;

    let debugBox = document.getElementById('dynamic-captions-debug-box');
    if (!debugBox) {
        debugBox = document.createElement('div');
        debugBox.id = 'dynamic-captions-debug-box';
        debugBox.style.position = 'absolute';
        debugBox.style.border = '4px solid red';
        debugBox.style.pointerEvents = 'none'; // Don't block clicks on the player
        debugBox.style.zIndex = '999999';
        playerContainer.appendChild(debugBox);
    }

    // Convert the MediaPipe bbox (intrinsic) into playerContainer-relative pixels
    const width = bbox.width * scaleX;
    const height = bbox.height * scaleY;
    const left = (videoRect.left + (bbox.originX * scaleX)) - playerContainer.getBoundingClientRect().left;
    const top = (videoRect.top + (bbox.originY * scaleY)) - playerContainer.getBoundingClientRect().top;

    debugBox.style.width = `${width}px`;
    debugBox.style.height = `${height}px`;
    debugBox.style.left = `${left}px`;
    debugBox.style.top = `${top}px`;
}

export function clearDebugBox() {
    const debugBox = document.getElementById('dynamic-captions-debug-box');
    if (debugBox) {
        debugBox.remove();
    }
}
