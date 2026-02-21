import { initFaceDetector } from '../logic/detector.js';
import { state } from '../state.js';

// A dedicated observer just for catching YouTube's subtitle rebuilds
export const captionObserver = new MutationObserver((mutations) => {
    // If we aren't tracking a face, don't intervene
    if (state.lastCaptionX === null || state.lastCaptionY === null) return;

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
                        cw.style.setProperty('--caption-left', `${state.lastCaptionX}px`);
                        cw.style.setProperty('--caption-top', `${state.lastCaptionY}px`);
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
                    cw.style.setProperty('--caption-left', `${state.lastCaptionX}px`);
                    cw.style.setProperty('--caption-top', `${state.lastCaptionY}px`);
                    cw.offsetHeight;
                    cw.classList.remove('no-transition');
                }
            }
        }
    }
});

// Observe overall DOM to setup face detector
export const observer = new MutationObserver((mutations) => {
    const videoElement = document.querySelector('video.html5-main-video');
    if (videoElement && !state.isDetecting && !state.isInitializing) {
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

export function setupObservers() {
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
}
