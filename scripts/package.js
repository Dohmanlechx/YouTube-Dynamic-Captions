const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BUILD_DIR = 'release_build';
const ZIP_NAME = 'release.zip';

console.log('📦 Starting package process...');

// 1. Clean previous builds
if (fs.existsSync(BUILD_DIR)) {
    fs.rmSync(BUILD_DIR, { recursive: true, force: true });
}
if (fs.existsSync(ZIP_NAME)) {
    fs.rmSync(ZIP_NAME);
}

// 2. Create staging directory
fs.mkdirSync(BUILD_DIR);

// Helper to copy files/folders
function copy(src, dest) {
    if (!fs.existsSync(src)) {
        console.warn(`⚠️ Warning: Source item ${src} does not exist.`);
        return;
    }
    
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        fs.readdirSync(src).forEach(file => {
            copy(path.join(src, file), path.join(dest, file));
        });
    } else {
        // Ensure parent directory exists
        const destDir = path.dirname(dest);
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }
        fs.copyFileSync(src, dest);
    }
}

// 3. Copy root files and folders
const rootItems = [
    'manifest.json',
    'styles.css',
    'assets',
    'dist',
    'lib',
    'models'
];

rootItems.forEach(item => {
    copy(item, path.join(BUILD_DIR, item));
});

// 4. Copy specific src files (preserving structure for imports)
// We need src/config.js and src/popup/* so that popup/popup.js can import ../config.js
const srcDir = path.join(BUILD_DIR, 'src');

// Copy config.js
copy('src/config.js', path.join(srcDir, 'config.js'));

// Copy popup directory
copy('src/popup', path.join(srcDir, 'popup'));

console.log(`✅ Files staged in ${BUILD_DIR}`);

// 5. Zip the contents of the build directory
console.log('📚 Zipping...');
try {
    // Compress-Archive requires absolute paths or relative to cwd. 
    // We use * to zip the *contents* of the folder, not the folder itself.
    const command = `powershell -Command "Compress-Archive -Path '${BUILD_DIR}\\*' -DestinationPath '${ZIP_NAME}' -Force"`;
    execSync(command, { stdio: 'inherit' });
    console.log(`🎉 Success! Created ${ZIP_NAME}`);
} catch (e) {
    console.error('❌ Failed to zip files:', e);
    process.exit(1);
}

// 6. Cleanup
fs.rmSync(BUILD_DIR, { recursive: true, force: true });
console.log('🧹 Cleanup complete.');
