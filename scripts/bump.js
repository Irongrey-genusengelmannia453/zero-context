import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import AdmZip from 'adm-zip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const releaseType = process.argv[2]; // 'patch', 'minor', 'major', or explicit version

if (releaseType && releaseType !== 'current') {
    console.log(`\n🚀 Bumping version (${releaseType})...`);
    execSync(`npm version ${releaseType} --no-git-tag-version`, { cwd: rootDir, stdio: 'inherit' });
} else {
    console.log(`\n🚀 Building current version...`);
}

// 1. Read the new version from package.json
const pkgPath = path.join(rootDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

// Strip any 'v' or non-numeric prefixes (e.g. 'v1.0.1' -> '1.0.1')
const cleanVersion = pkg.version.replace(/^v?/, '');

// 2. Synchronize manifest.json
console.log(`\n📦 Synchronizing manifest.json to version ${cleanVersion}...`);
const manifestPath = path.join(rootDir, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.version = cleanVersion;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

// 3. Quality Gates
console.log(`\n🛡️ Running Quality Gates...`);
try {
    console.log(`>> Executing: npm run typecheck`);
    execSync('npm run typecheck', { cwd: rootDir, stdio: 'inherit' });
    
    console.log(`>> Executing: npm run test`);
    execSync('npm run test -- --run', { cwd: rootDir, stdio: 'inherit' });
} catch (error) {
    console.error(`\n❌ Quality Gates Failed. Halting release.`);
    process.exit(1);
}

// 4. Build
console.log(`\n🔨 Building production bundle...`);
try {
    execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });
} catch (error) {
    console.error(`\n❌ Build Failed. Halting release.`);
    process.exit(1);
}

// 5. Zip it up
console.log(`\n🗜️ Zipping release archive...`);
const releasesDir = path.join(rootDir, 'releases');
if (!fs.existsSync(releasesDir)) {
    fs.mkdirSync(releasesDir);
}

const zipPath = path.join(releasesDir, `ZeroContext-v${cleanVersion}.zip`);
const distPath = path.join(rootDir, 'dist');

const zip = new AdmZip();
// Important: addLocalFolder takes the folder path and places its *contents* at the zip root
zip.addLocalFolder(distPath, '');
zip.writeZip(zipPath);

console.log(`\n✅ Release successful! Artifact generated at: releases/ZeroContext-v${cleanVersion}.zip\n`);
