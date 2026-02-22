import { initConfig } from './config.js';
import { initState } from './state.js';
import { setupObservers } from './ui/observer.js';

// Initialize the extension's execution flow
// First load config from chrome.storage.sync
initConfig(() => {
    // Then pull the user's toggle-button preferences from chrome.storage.local
    initState();

    // Then attach the MutationObservers to detect when a YouTube video is opened
    // to start the MediaPipe tracking loop.
    setupObservers();
});
