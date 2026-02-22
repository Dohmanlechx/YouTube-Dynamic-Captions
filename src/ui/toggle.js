import { state } from '../state.js';

export function injectToggleButton() {
    if (document.getElementById('dynamic-captions-toggle')) return;
    const controls = document.querySelector('.ytp-right-controls');
    if (!controls) return;

    const btn = document.createElement('button');
    btn.id = 'dynamic-captions-toggle';
    btn.className = 'ytp-button';

    // Make sure this runs once when creating the button
    btn.style.display = "flex";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";

    const updateIcon = () => {
        const color = state.extensionEnabled ? '#fff' : '#aaa';
        const opacity = state.extensionEnabled ? '1.0' : '0.5';
        const strokeLine = !state.extensionEnabled
            ? `<line x1="5" y1="5" x2="31" y2="31" stroke="#f00" stroke-width="2.5" />`
            : '';

        btn.innerHTML = `
        <svg viewBox="0 0 36 36" width="36" height="36"
             style="opacity:${opacity};">
            <rect x="6" y="6" width="24" height="24"
                  fill="none" stroke="${color}" stroke-width="2" rx="3" ry="3"/>
            <circle cx="13" cy="15" r="2.2" fill="${color}"/>
            <circle cx="23" cy="15" r="2.2" fill="${color}"/>
            <path d="M11 23 q7 6 14 0"
                  fill="none" stroke="${color}" stroke-width="1.5"/>
            ${strokeLine}
        </svg>
    `;

        btn.title = state.extensionEnabled ? 'Face-Tracking Captions: ON' : 'Face-Tracking Captions: OFF';
    };

    updateIcon();

    btn.onclick = () => {
        state.extensionEnabled = !state.extensionEnabled;
        chrome.storage.local.set({ dynamicCaptionsEnabled: state.extensionEnabled });
        updateIcon();
    };

    // Insert right before the settings gear (which is usually the first or second element)
    controls.insertBefore(btn, controls.firstChild);
}
