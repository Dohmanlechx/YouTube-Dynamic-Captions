export const state = {
    faceDetector: null,
    isDetecting: false,
    isInitializing: false,
    animationFrameId: null,
    extensionEnabled: true,
    lastCaptionX: null,
    lastCaptionY: null,
    lastFaceSeenAt: null
};

export function initState() {
    chrome.storage.local.get(['dynamicCaptionsEnabled'], (result) => {
        if (result.dynamicCaptionsEnabled !== undefined) {
            state.extensionEnabled = result.dynamicCaptionsEnabled;
        }
    });
}
