const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
let releaseType = 'patch';

if (args.includes('major')) {
    releaseType = 'major';
} else if (args.includes('minor')) {
    releaseType = 'minor';
}

const packagePath = path.resolve(__dirname, '../package.json');
const manifestPath = path.resolve(__dirname, '../manifest.json');

// Read files
if (!fs.existsSync(packagePath) || !fs.existsSync(manifestPath)) {
    console.error('❌ Error: Could not find package.json or manifest.json');
    process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// Determine new version
const currentVersion = pkg.version; // Assuming pkg is source of truth
const parts = currentVersion.split('.').map(Number);

if (releaseType === 'major') {
    parts[0]++;
    parts[1] = 0;
    parts[2] = 0;
} else if (releaseType === 'minor') {
    parts[1]++;
    parts[2] = 0;
} else {
    parts[2]++; // patch default
}

const newVersion = parts.join('.');

// Update objects
pkg.version = newVersion;
manifest.version = newVersion;

// Write back with correct indentation
// package.json: 4 spaces
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 4));
// manifest.json: 2 spaces
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`✅ Bumped version: ${currentVersion} -> ${newVersion}`);
