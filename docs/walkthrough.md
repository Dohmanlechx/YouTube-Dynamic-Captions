# Project Walkthrough: YouTube Dynamic Captions

This architectural overview breaks down how the extension works under the hood, why certain technical decisions were made, and how data flows from the AI model to the YouTube player.

## 1. The Core Challenge: Manifest V3 vs. AI

Google Chrome's new extension architecture, **Manifest V3 (MV3)**, strictly forbids extensions from downloading and executing remote code for security reasons. This presented a massive hurdle because modern AI libraries (like TensorFlow.js or Google's MediaPipe) rely on downloading massive WebAssembly (`.wasm`) engines on the fly. 

To solve this, we **bundled everything locally**. We downloaded the MediaPipe Vision library, the WebAssembly engine (`vision_wasm_internal.wasm`), and the specific face-tracking AI model (`blaze_face_short_range.tflite`) directly into our repository (`/lib` and `/models`). We then explicitly exposed these to the browser in our `manifest.json` under `web_accessible_resources`.

## 2. Directory Structure & Architecture

The codebase is split into specific domains of responsibility, built via `esbuild`.

### The Build Pipeline
Browsers cannot natively understand `import` and `export` statements inside a standard content script without special type modules. Instead of fighting Chrome, we use **esbuild** (a wickedly fast JavaScript bundler). 
When you run `npm run build`, esbuild takes our pristine `src/` directory and violently smashes it down into a single, optimized file: `dist/content.js`. Chrome only ever sees and executes this single file.

### Inside `src/`

#### State Management (`src/state.js`)
We use a centralized state object exported as a constant. This prevents circular dependencies. If the *UI toggle* needs to disable the extension, it flips `state.extensionEnabled`. When the *Tracker loop* goes to draw the next frame, it checks that exact same state. It holds our current running status, face-loss debouncing timestamps, and the user's toggle preference.

#### The AI Engine (`src/models/detector.js`)
This is the heavy lifter. It initializes the `FaceDetector` class from the bundled MediaPipe libraries. 
*   **The Hack:** MV3 runs content scripts in an "Isolated World" to protect them from the host webpage. MediaPipe was designed to be run on normal webpages, so it tries to execute code in the global window (`globalThis`). We had to write several hacks to trick MediaPipe into loading its WASM binary securely within our Isolated World without triggering Chrome's security alarms.

#### The Core Loop (`src/logic/tracker.js`)
This file orchestrates the performance. It uses `requestAnimationFrame` to create a continuous loop tied to the browser's refresh rate.
*   **Optimization 1:** It strictly rate-limits the AI math to 10 Frames Per Second (FPS). Calculating the AI 60 times a second would melt your CPU; 10 FPS is plenty fast enough to track a head while using drastically less power.
*   **Optimization 2:** If you switch tabs, `document.hidden` becomes true. The tracker instantly pauses the AI to conserve battery and CPU until you return.
*   Every frame, it rips the current image from the `<video>` element, feeds it to the `FaceDetector`, and passes the results to the positioner.

#### The Math (`src/logic/positioning.js`)
When a face is found, this file calculates where the captions should go.
1. It takes the AI's "normalized coordinates" (e.g., face is at 0.5x, 0.2y) and scales them up to the actual pixel dimensions of your screen.
2. It anchors the coordinates to the `.html5-video-player` (a static box on the screen) rather than the `<video>` element itself (which can jitter).
3. It bounds the coordinates so the captions never accidentally get pushed off-screen or hidden behind YouTube's UI.
4. It dynamically injects raw CSS variables (`--caption-left`, `--caption-top`) directly into the active caption elements.

#### The UI Monitors (`src/ui/observer.js` & `src/ui/toggle.js`)
*   **`toggle.js`**: Injects the neat little face SVG into YouTube's native control bar to let you toggle the extension.
*   **`observer.js`**: YouTube constantly destroys and rebuilds subtitle nodes as people talk. If we just styled the captions once, they would snap back to the center on the next sentence. We use incredibly fast `MutationObservers` to watch YouTube's DOM. The millisecond YouTube injects a new caption node, our observer catches it, strips its native CSS transitions, instantly shoves our dynamic CSS variables onto it, and forces a browser reflow. This makes the text injection entirely seamless to the naked eye.

## 3. The Flow of Data
When you navigate to a video, here is the exact lifecycle:

1. Chrome executes `dist/content.js`.
2. `src/index.js` boots up, loads user preferences from local storage, and tells `observer.js` to start watching the webpage.
3. Once a user clicks a video and the `<video>` element appears, `observer.js` triggers `initFaceDetector()`.
4. The AI model loads into memory and starts the 10-FPS loop in `tracker.js`.
5. The tracker constantly identifies the speaker's face, passing coordinates to `positioning.js`.
6. `positioning.js` calculates the safe pixel coordinates and updates the CSS variables.
7. `styles.css` applies those variables, instantly snapping the `captions-window` to the speaker's chin.
