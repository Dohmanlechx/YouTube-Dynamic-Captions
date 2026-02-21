import { initState } from './state.js';
import { setupObservers } from './ui/observer.js';

// Initialize the extension's execution flow
// First pull the user's toggle-button preferences from chrome.storage
initState();

// Then attach the MutationObservers to detect when a YouTube video is opened
// to start the MediaPipe tracking loop.
setupObservers();
