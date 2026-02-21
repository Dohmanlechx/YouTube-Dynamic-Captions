/**
 * Minimum distance (in pixels) the face must move before the captions are repositioned.
 * Higher values prevent micro-jitters, lower values make it more fluid but use more CPU.
 */
export const POSITION_UPDATE_THRESHOLD = 150;

/**
 * If true, draws a red rectangle around the detected face on the video player.
 * Useful for verifying if the AI tracking is accurately finding the speaker.
 */
export const DEBUG_DRAW_FACE = false;

/**
 * The maximum number of faces the AI will attempt to find in a single video frame.
 * Setting this to 1 dramatically reduces CPU usage on videos with crowds or multiple people.
 */
export const MAX_FACES = 1;

/**
 * The minimum confidence score (0.0 to 1.0) required for a face detection to be considered valid.
 * Lower values may cause false positives, higher values may cause it to lose tracking.
 */
export const MIN_DETECTION_CONFIDENCE = 0.5;
