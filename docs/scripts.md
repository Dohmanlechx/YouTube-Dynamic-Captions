# Scripts Documentation

This project uses custom Node.js scripts to manage building, packaging, and versioning. These scripts are located in the `scripts/` directory and can be executed via `npm run`.

## Packaging (`npm run package`)

**Script:** `scripts/package.js`

This command prepares the extension for release on the Chrome Web Store.

### What it does:
1.  **Builds the project:** Runs `npm run build` to compile the source code (using `esbuild`) into `dist/content.js`.
2.  **Cleans previous builds:** Removes `release_build/` and `release.zip` if they exist.
3.  **Stages files:** Creates a temporary `release_build/` directory and copies all necessary files:
    *   `manifest.json`, `styles.css`
    *   `assets/`, `dist/`, `lib/`, `models/`
    *   `src/config.js` and `src/popup/` (preserving directory structure for imports).
4.  **Zips:** Compresses the staged files into `release.zip`.
5.  **Clean up:** Removes the temporary `release_build/` directory.

### Usage:
```bash
npm run package
```

**Output:** A `release.zip` file in the project root, ready for upload.

---

## Versioning (`npm run bump`)

**Script:** `scripts/version.js`

This command simplifies version management by updating both `package.json` and `manifest.json` simultaneously. This ensures the development environment and the extension manifest stay in sync.

### Usage:

**Bump Patch Version (0.0.x):**
Increments the last number (e.g., `1.0.0` -> `1.0.1`).
```bash
npm run bump
```

**Bump Minor Version (0.x.0):**
Increments the middle number and resets patch (e.g., `1.0.1` -> `1.1.0`).
```bash
npm run bump minor
```

**Bump Major Version (x.0.0):**
Increments the first number and resets others (e.g., `1.1.0` -> `2.0.0`).
```bash
npm run bump major
```
