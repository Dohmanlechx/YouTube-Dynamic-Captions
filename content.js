let faceDetector = null;
let isDetecting = false;
let isInitializing = false;
let animationFrameId = null;
let extensionEnabled = true;

// Load the saved user preference
chrome.storage.local.get(['dynamicCaptionsEnabled'], (result) => {
    if (result.dynamicCaptionsEnabled !== undefined) {
        extensionEnabled = result.dynamicCaptionsEnabled;
    }
});

async function initFaceDetector() {
    if (isInitializing || faceDetector) return;
    isInitializing = true;
    try {
        const extensionUrl = chrome.runtime.getURL('');
        const visionModuleUrl = extensionUrl + 'lib/vision_bundle.mjs';
        console.log("[Dynamic Captions] Importing Vision Module from:", visionModuleUrl);

        // Define globalThis.Module to avoid MediaPipe's "ModuleFactory not set" error
        // caused by Manifest V3 CSP restricting `eval()` inside isolated content scripts.
        if (typeof globalThis.Module === 'undefined') {
            globalThis.Module = {};
        }

        // Emscripten runtime bug in strict mode: `custom_dbg` block-scoped function declaration
        if (typeof globalThis.custom_dbg === 'undefined') {
            globalThis.custom_dbg = function (...args) {
                // Filter out harmless WebGL/OpenGL warnings on video change
                if (args[0] && typeof args[0] === 'string' && args[0].includes("OpenGL error checking is disabled")) {
                    return;
                }
                console.warn(...args);
            };
        }

        // Import the locally bundled module
        const { FaceDetector, FilesetResolver } = await import(visionModuleUrl);

        const vision = await FilesetResolver.forVisionTasks(extensionUrl + 'lib');

        // Due to Manifest V3 Isolated World issues, we cannot allow the
        // WebAssembly module to fetch the 'vision_wasm_internal.wasm' using a relative
        // URL as it will trigger an "Extension context invalidated" or "Trusted Types" block
        // on YouTube. We MUST dynamically resolve the absolute Extension URL explicitly.

        // Ensure WebAssembly binary is referenced by absolute URL
        vision.wasmBinaryPath = extensionUrl + 'lib/vision_wasm_internal.wasm';

        // Load the WASM loader script MANUALLY into the isolated world using dynamic import
        // Since we patched it with `globalThis.ModuleFactory = ModuleFactory`, this will
        // expose ModuleFactory to our current isolated world.
        await import(extensionUrl + 'lib/vision_wasm_internal.js');

        // Trick MediaPipe into skipping the `<script>` injection which breaks in MV3
        // because it tries to evaluate in the Main World.
        vision.wasmLoaderPath = undefined;

        // Create the face detector instance
        faceDetector = await FaceDetector.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: extensionUrl + 'models/blaze_face_short_range.tflite',
                delegate: "GPU"
            },
            runningMode: "VIDEO",
            minDetectionConfidence: 0.5
        });

        console.log("[Dynamic Captions] FaceDetector initialized.");
        isInitializing = false;
        startDetectionLoop();
    } catch (error) {
        console.error("[Dynamic Captions] Error initializing FaceDetector:", error);
        isInitializing = false;
    }
}

function startDetectionLoop() {
    if (!faceDetector || isDetecting) return;
    isDetecting = true;

    let lastProcessedTimeMs = -1;
    const targetFPS = 10; // Capped at 10 FPS for massive CPU savings
    const frameIntervalMs = 1000 / targetFPS;

    const loop = (timestamp) => {
        injectToggleButton();

        // CPU Optimization: Stop completely if the user switches to a different browser tab
        // Also pause if the user disabled the extension via the player toggle button
        if (!isDetecting || document.hidden || !extensionEnabled) {
            if (!extensionEnabled && (lastCaptionX !== null || lastCaptionY !== null)) {
                lastCaptionX = null;
                lastCaptionY = null;
                resetCaptionPosition();
            }
            animationFrameId = requestAnimationFrame(loop);
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
                    const results = faceDetector.detectForVideo(videoElement, performance.now());
                    handleDetectionResults(results, videoElement, activeCaptionWindows);
                } catch (e) {
                    console.error("[Dynamic Captions] Detection error:", e);
                }
            }
        } else {
            resetCaptionPosition();
        }

        animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
}
let lastCaptionX = null;
let lastCaptionY = null;
let consecutiveFramesWithoutFace = 0;
const POSITION_UPDATE_THRESHOLD = 100;
const DEBUG_DRAW_FACE = true; // Set to true to see the face bounding box

function drawDebugBox(videoRect, playerContainer, bbox, scaleX, scaleY) {
    if (!DEBUG_DRAW_FACE) return;

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

function clearDebugBox() {
    const debugBox = document.getElementById('dynamic-captions-debug-box');
    if (debugBox) {
        debugBox.remove();
    }
}

function injectToggleButton() {
    if (document.getElementById('dynamic-captions-toggle')) return;
    const controls = document.querySelector('.ytp-right-controls');
    if (!controls) return;

    const btn = document.createElement('button');
    btn.id = 'dynamic-captions-toggle';
    btn.className = 'ytp-button';

    // We remove the hardcoded inline styles (padding, margin, verticalAlign) 
    // to allow YouTube's native `.ytp-button` CSS class to auto-center the SVG.
    // We only enforce a standard width if necessary, but standard class is usually enough.

    // Make sure this runs once when creating the button
    btn.style.display = "flex";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";

    const updateIcon = () => {
        const color = extensionEnabled ? '#fff' : '#aaa';
        const opacity = extensionEnabled ? '1.0' : '0.5';
        const strokeLine = !extensionEnabled
            ? `<line x1="5" y1="5" x2="31" y2="31" stroke="#f00" stroke-width="2.5" />`
            : '';

        btn.innerHTML = `
        <svg viewBox="0 0 36 36" width="36" height="36"
             style="opacity:${opacity};">
            <rect x="6" y="6" width="24" height="24"
                  fill="none" stroke="${color}" stroke-width="2" rx="3" ry="3"/>
            <circle cx="13" cy="15" r="2.2" fill="${color}"/>
            <circle cx="23" cy="15" r="2.2" fill="${color}"/>
            <path d="M11 23 q7 6 14 0"
                  fill="none" stroke="${color}" stroke-width="1.5"/>
            ${strokeLine}
        </svg>
    `;

        btn.title = extensionEnabled ? 'Dynamic Captions: ON' : 'Dynamic Captions: OFF';
    };

    updateIcon();

    btn.onclick = () => {
        extensionEnabled = !extensionEnabled;
        chrome.storage.local.set({ dynamicCaptionsEnabled: extensionEnabled });
        updateIcon();
    };

    // Insert right before the settings gear (which is usually the first or second element)
    controls.insertBefore(btn, controls.firstChild);
}

function handleDetectionResults(results, videoElement, activeCaptionWindows) {
    // If no face is found, wait a few frames before resetting to YouTube's default
    if (!results.detections || results.detections.length !== 1) {
        clearDebugBox();
        consecutiveFramesWithoutFace++;
        // 3 consecutive frames (approx 3 seconds) without a face
        if (consecutiveFramesWithoutFace >= 3) {
            lastCaptionX = null;
            lastCaptionY = null;
            resetCaptionPosition();
        }
        return;
    }

    consecutiveFramesWithoutFace = 0;

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

    if (lastCaptionX === null || lastCaptionY === null) {
        updateRequired = true;
    } else {
        const dx = targetX - lastCaptionX;
        const dy = targetY - lastCaptionY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > POSITION_UPDATE_THRESHOLD) {
            updateRequired = true;
        }
    }

    if (updateRequired) {
        lastCaptionX = targetX;
        lastCaptionY = targetY;
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
            captionWindow.style.setProperty('--caption-left', `${lastCaptionX}px`);
            captionWindow.style.setProperty('--caption-top', `${lastCaptionY}px`);
        }

        // Force the browser to render the styles instantly without animation
        if (positionJustApplied) {
            captionWindow.offsetHeight; // Force reflow
            captionWindow.classList.remove('no-transition');
        }
    }
}

function resetCaptionPosition() {
    clearDebugBox();

    // We intentionally DO NOT reset lastCaptionX and lastCaptionY here.
    // Preserving them allows the MutationObserver to instantly restore 
    // the caption's position when YouTube reconstructs the caption element
    // for the next line of text.
    // lastCaptionX = null;
    // lastCaptionY = null;

    const captionWindows = document.querySelectorAll('.caption-window');
    for (const captionWindow of captionWindows) {
        if (captionWindow.classList.contains('dynamic-positioned')) {
            captionWindow.classList.remove('dynamic-positioned');
            captionWindow.style.removeProperty('--caption-left');
            captionWindow.style.removeProperty('--caption-top');
        }
    }
}

// A dedicated observer just for catching YouTube's subtitle rebuilds
const captionObserver = new MutationObserver((mutations) => {
    // If we aren't tracking a face, don't intervene
    if (lastCaptionX === null || lastCaptionY === null) return;

    for (const mutation of mutations) {
        // Intercept newly added caption windows exactly as they hit the DOM
        if (mutation.type === 'childList') {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1) {
                    // Extract the window either directly or from its children payload
                    const cws = node.classList && node.classList.contains('caption-window')
                        ? [node]
                        : (node.querySelectorAll ? Array.from(node.querySelectorAll('.caption-window')) : []);

                    for (const cw of cws) {
                        cw.classList.add('no-transition');
                        cw.classList.add('dynamic-positioned');
                        cw.style.setProperty('--caption-left', `${lastCaptionX}px`);
                        cw.style.setProperty('--caption-top', `${lastCaptionY}px`);
                        cw.offsetHeight; // Force reflow
                        cw.classList.remove('no-transition');
                    }
                }
            });
        }

        // Handle attribute changes on existing visible caption windows
        if (mutation.type === 'attributes' && mutation.target.classList && mutation.target.classList.contains('caption-window')) {
            const cw = mutation.target;
            if (cw.style.display !== 'none' && window.getComputedStyle(cw).display !== 'none') {
                if (!cw.classList.contains('dynamic-positioned')) {
                    cw.classList.add('no-transition');
                    cw.classList.add('dynamic-positioned');
                    cw.style.setProperty('--caption-left', `${lastCaptionX}px`);
                    cw.style.setProperty('--caption-top', `${lastCaptionY}px`);
                    cw.offsetHeight;
                    cw.classList.remove('no-transition');
                }
            }
        }
    }
});

// Observe overall DOM to setup face detector
const observer = new MutationObserver((mutations) => {
    const videoElement = document.querySelector('video.html5-main-video');
    if (videoElement && !isDetecting && !isInitializing) {
        initFaceDetector();

        // Also attach the dedicated caption observer to the player container
        const playerContainer = document.querySelector('.html5-video-player');
        if (playerContainer) {
            // We observe subtree so we catch the inner text span changes 
            // and attributes because YouTube sometimes just updates the style
            captionObserver.observe(playerContainer, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
        }
    }
});
observer.observe(document.body, { childList: true, subtree: true });

// Attempt initial start
const initialVideo = document.querySelector('video.html5-main-video');
if (initialVideo) {
    initFaceDetector();

    setTimeout(() => {
        const playerContainer = document.querySelector('.html5-video-player');
        if (playerContainer) {
            captionObserver.observe(playerContainer, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
        }
    }, 1000);
}
