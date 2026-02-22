import { config } from '../config.js';
import { state } from '../state.js';
import { startDetectionLoop } from './tracker.js';

export async function initFaceDetector() {
    if (state.isInitializing || state.faceDetector) return;
    state.isInitializing = true;
    try {
        const extensionUrl = chrome.runtime.getURL('');
        const visionModuleUrl = extensionUrl + 'lib/vision_bundle.mjs';
        console.log("[Face-Tracking Captions] Importing Vision Module from:", visionModuleUrl);

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
        state.faceDetector = await FaceDetector.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: extensionUrl + 'models/blaze_face_short_range.tflite',
                delegate: "GPU"
            },
            runningMode: "VIDEO",
            minDetectionConfidence: config.MIN_DETECTION_CONFIDENCE,
            maxResults: 2
        });

        console.log("[Face-Tracking Captions] FaceDetector initialized.");
        state.isInitializing = false;
        startDetectionLoop();
    } catch (error) {
        console.error("[Face-Tracking Captions] Error initializing FaceDetector:", error);
        state.isInitializing = false;
    }
}
