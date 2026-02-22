export const config = {
    /**
     * Minimum distance (in pixels) the face must move before the captions are repositioned.
     * Higher values prevent micro-jitters, lower values make it more fluid but use more CPU.
     */
    POSITION_UPDATE_THRESHOLD: 150,

    /**
     * If true, draws a red rectangle around the detected face on the video player.
     * Useful for verifying if the AI tracking is accurately finding the speaker.
     */
    DEBUG_DRAW_FACE: false,

    /**
     * The minimum confidence score (0.0 to 1.0) required for a face detection to be considered valid.
     * Lower values may cause false positives, higher values may cause it to lose tracking.
     */
    MIN_DETECTION_CONFIDENCE: 0.4,

    /**
     * How many seconds the extension will wait after losing sight of a face
     * before resetting the captions back to YouTube's default center position.
     * This prevents the captions from flickering back during brief camera cuts.
     */
    RESET_DELAY_SECONDS: 3
};

export function initConfig(callback) {
    const keys = Object.keys(config);
    chrome.storage.sync.get(keys, (result) => {
        for (const key of keys) {
            if (result[key] !== undefined) {
                config[key] = result[key];
            }
        }
        if (callback) callback();
    });

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'sync') {
            for (const key of keys) {
                if (changes[key] !== undefined) {
                    config[key] = changes[key].newValue;
                }
            }
        }
    });
}
