let faceDetector = null;
let isDetecting = false;
let isInitializing = false;
let animationFrameId = null;

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
            globalThis.custom_dbg = console.warn;
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
    const targetFPS = 15;
    const frameIntervalMs = 1000 / targetFPS;

    const loop = (timestamp) => {
        if (!isDetecting) return;

        const videoElement = document.querySelector('video.html5-main-video');
        const captionWindow = document.querySelector('.caption-window');

        if (videoElement && !videoElement.paused && captionWindow && captionWindow.style.display !== 'none') {
            if (timestamp - lastProcessedTimeMs >= frameIntervalMs) {
                lastProcessedTimeMs = timestamp;

                try {
                    const results = faceDetector.detectForVideo(videoElement, performance.now());
                    handleDetectionResults(results, videoElement, captionWindow);
                } catch (e) {
                    console.error("[Dynamic Captions] Detection error:", e);
                }
            }
        } else {
            resetCaptionPosition(captionWindow);
        }

        animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
}
let lastCaptionX = null;
let lastCaptionY = null;
const POSITION_UPDATE_THRESHOLD = 200; // Pixels distance threshold

function handleDetectionResults(results, videoElement, captionWindow) {
    // If no face or >1 face is found, reset positioning to YouTube's default
    if (!results.detections || results.detections.length !== 1) {
        resetCaptionPosition(captionWindow);
        return;
    }

    const face = results.detections[0];
    const bbox = face.boundingBox;

    const videoRect = videoElement.getBoundingClientRect();
    const playerRect = captionWindow.parentElement.getBoundingClientRect();

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

    // Add some spacing to separate the text from the chin
    const verticalOffset = 20;
    const targetX = relativeX;
    const targetY = relativeY + verticalOffset;

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

    // Always ensure the CSS class is applied as long as a single face is visible
    captionWindow.classList.add('dynamic-positioned');

    if (updateRequired) {
        lastCaptionX = targetX;
        lastCaptionY = targetY;
        // Apply custom CSS variables for our styles override
        captionWindow.style.setProperty('--caption-left', `${targetX}px`);
        captionWindow.style.setProperty('--caption-top', `${targetY}px`);
    }
}

function resetCaptionPosition(captionWindow) {
    lastCaptionX = null;
    lastCaptionY = null;

    if (captionWindow && captionWindow.classList.contains('dynamic-positioned')) {
        captionWindow.classList.remove('dynamic-positioned');
        captionWindow.style.removeProperty('--caption-left');
        captionWindow.style.removeProperty('--caption-top');
    }
}

// Observe modifications defensively (incase YouTube deletes/re-adds video element)
const observer = new MutationObserver((mutations) => {
    if (document.querySelector('video.html5-main-video') && !isDetecting && !isInitializing) {
        initFaceDetector();
    }
});
observer.observe(document.body, { childList: true, subtree: true });

// Attempt initial start
if (document.querySelector('video.html5-main-video')) {
    initFaceDetector();
}
