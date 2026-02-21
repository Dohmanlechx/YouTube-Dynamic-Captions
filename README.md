# Dynamic Captions for YouTube

A Chrome Extension that roughly follows the speaker's face to position the captions.

## Installation (Unpacked)

Because this extension uses bundled WebAssembly files that must bypass specific Manifest V3 Content Security Policies, you must install it locally as an "Unpacked Extension" containing the built `/dist` directory.

### Prerequisites

Ensure you have Node.js and NPM installed on your machine so you can build the final Javascript bundle.

```bash
# Clone the repository
git clone https://github.com/dohmanlechx/dynamic_captions.git
cd dynamic_captions

# Install the build dependencies (esbuild)
npm install

# Bundle the final content script into /dist
npm run build
```

### Loading into Chrome

1. Open a new tab in Google Chrome and navigate to `chrome://extensions/`
2. In the top right corner, toggle the switch for **Developer mode** to **ON**.
3. In the top left corner, click the **Load unpacked** button.
4. A file browser window will appear. Select the root `dynamic_captions` folder (the one containing the `manifest.json` file) and click **Select Folder**.

The extension is now installed! 

## Usage

1. Open any YouTube video and ensure the native video **Closed Captions (cc)** are turned ON.
2. Ensure there is a visible human face on screen.
3. The captions will automatically snap to the bottom of the face!
4. Use the Smiley-face icon in the YouTube player's bottom right control bar to quickly toggle the tracking on and off without reloading the page.
