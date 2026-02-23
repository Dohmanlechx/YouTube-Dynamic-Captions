import { config as configDefaults } from '../config.js';

document.addEventListener('DOMContentLoaded', () => {
    const keys = Object.keys(configDefaults);

    // Domesticate UI elements
    const posThresholdEl = document.getElementById('positionUpdateThreshold');
    const debugDrawFaceEl = document.getElementById('debugDrawFace');
    const minConfidenceEl = document.getElementById('minDetectionConfidence');
    const resetDelayEl = document.getElementById('resetDelaySeconds');

    // UI value displays
    const minConfidenceVal = document.getElementById('minDetectionConfidenceValue');
    const resetDelayVal = document.getElementById('resetDelaySecondsValue');

    // Load saved settings or use defaults
    chrome.storage.sync.get(keys, (result) => {
        const config = { ...configDefaults };
        for (const key of keys) {
            if (result[key] !== undefined) {
                config[key] = result[key];
            }
        }

        // Initialize UI with loaded values
        posThresholdEl.value = config.POSITION_UPDATE_THRESHOLD;
        debugDrawFaceEl.checked = config.DEBUG_DRAW_FACE;

        minConfidenceEl.value = config.MIN_DETECTION_CONFIDENCE;
        minConfidenceVal.textContent = parseFloat(config.MIN_DETECTION_CONFIDENCE).toFixed(1);

        resetDelayEl.value = config.RESET_DELAY_SECONDS;
        resetDelayVal.textContent = config.RESET_DELAY_SECONDS;
    });

    // Save functions with debouncer
    const saveTimers = {};
    const saveSetting = (key, value) => {
        clearTimeout(saveTimers[key]);
        saveTimers[key] = setTimeout(() => {
            chrome.storage.sync.set({ [key]: value });
        }, 500); // Wait 500ms after the last move before saving
    };

    // Event listeners for inputs to save lively
    posThresholdEl.addEventListener('input', (e) => {
        saveSetting('POSITION_UPDATE_THRESHOLD', parseInt(e.target.value, 10));
    });

    debugDrawFaceEl.addEventListener('change', (e) => {
        saveSetting('DEBUG_DRAW_FACE', e.target.checked);
    });

    minConfidenceEl.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        minConfidenceVal.textContent = val.toFixed(1);
        saveSetting('MIN_DETECTION_CONFIDENCE', val);
    });

    resetDelayEl.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        resetDelayVal.textContent = val;
        saveSetting('RESET_DELAY_SECONDS', val);
    });
});
