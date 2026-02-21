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

        // Find the genuinely active caption window. YouTube often leaves hidden ghosts
        // in the DOM which break single querySelector('.caption-window') requests.
        let captionWindow = null;
        for (const cw of document.querySelectorAll('.caption-window')) {
            if (cw.style.display !== 'none' && window.getComputedStyle(cw).display !== 'none') {
                captionWindow = cw;
                break;
            }
        }

        if (videoElement && !videoElement.paused && captionWindow) {
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
            resetCaptionPosition();
        }

        animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
}
let lastCaptionX = null;
let lastCaptionY = null;
const POSITION_UPDATE_THRESHOLD = 30; // Reduced from 200 for more responsive tracking

function handleDetectionResults(results, videoElement, captionWindow) {
    // If no face or >1 face is found, reset positioning to YouTube's default
    if (!results.detections || results.detections.length !== 1) {
        resetCaptionPosition();
        return;
    }

    const face = results.detections[0];
    const bbox = face.boundingBox;

    const videoRect = videoElement.getBoundingClientRect();

    // playerContainer is a much safer anchor than captionWindow.parentElement 
    // because its bounds are static, preventing the trackpoint from shifting erratically.
    const playerContainer = document.querySelector('.html5-video-player') || captionWindow.parentElement;
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

    let positionJustApplied = false;

    // Always ensure the CSS class is applied as long as a single face is visible
    if (!captionWindow.classList.contains('dynamic-positioned')) {
        captionWindow.classList.add('no-transition');
        captionWindow.classList.add('dynamic-positioned');
        positionJustApplied = true;
    }

    if (updateRequired) {
        lastCaptionX = targetX;
        lastCaptionY = targetY;
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

function resetCaptionPosition() {
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
