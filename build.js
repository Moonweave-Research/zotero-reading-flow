const esbuild = require('esbuild');
const { execFileSync } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const { ADDON_ID, XPI_NAME, releaseXpiUrl } = require('./scripts/release-config');

const ARCHIVE_TIMESTAMP = new Date('2000-01-01T00:00:00.000Z');

function collectArchiveEntries(root, relative = '') {
  return fs.readdirSync(path.join(root, relative), { withFileTypes: true })
    .filter((entry) => entry.name !== '.DS_Store')
    .sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)
    .flatMap((entry) => {
      const entryPath = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) {
        return [`${entryPath}/`, ...collectArchiveEntries(root, entryPath)];
      }
      if (!entry.isFile()) {
        throw new Error(`Unsupported add-on package entry: ${entryPath}`);
      }
      return [entryPath];
    });
}

function normalizeArchiveMetadata(root, entries) {
  for (const entry of [...entries].reverse()) {
    const entryPath = path.join(root, entry.replace(/\/$/, ''));
    const isDirectory = entry.endsWith('/');
    fs.chmodSync(entryPath, isDirectory ? 0o755 : 0o644);
    fs.utimesSync(entryPath, ARCHIVE_TIMESTAMP, ARCHIVE_TIMESTAMP);
  }
}

function createReproducibleXpi() {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'reading-flow-xpi-'));
  const stagedAddon = path.join(temporaryRoot, 'addon');
  const stagedXpi = path.join(temporaryRoot, XPI_NAME);

  try {
    fs.cpSync('addon', stagedAddon, { recursive: true });
    const entries = collectArchiveEntries(stagedAddon);
    normalizeArchiveMetadata(stagedAddon, entries);
    execFileSync('zip', ['-X', '-q', stagedXpi, '-@'], {
      cwd: stagedAddon,
      env: { ...process.env, TZ: 'UTC' },
      input: `${entries.join('\n')}\n`
    });
    fs.copyFileSync(stagedXpi, XPI_NAME);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function writeUpdateManifest() {
  const manifest = JSON.parse(fs.readFileSync('addon/manifest.json', 'utf8'));
  const version = manifest.version;
  const zotero = manifest.applications?.zotero;
  const hash = crypto.createHash('sha256').update(fs.readFileSync(XPI_NAME)).digest('hex');
  const updateManifest = {
    addons: {
      [ADDON_ID]: {
        updates: [
          {
            version,
            update_link: releaseXpiUrl(version),
            update_hash: `sha256:${hash}`,
            applications: {
              zotero: {
                strict_min_version: zotero.strict_min_version,
                strict_max_version: zotero.strict_max_version
              }
            }
          }
        ]
      }
    }
  };

  fs.writeFileSync('updates.json', `${JSON.stringify(updateManifest, null, 2)}\n`);
  console.log(`Wrote updates.json for ${ADDON_ID} ${version}`);
}

Promise.all([
  esbuild.build({
    entryPoints: ['src/bootstrap.ts'],
    bundle: true,
    format: 'iife',
    globalName: 'ReadingFlowBootstrap',
    outfile: 'addon/bootstrap.js',
    target: 'es2022',
    external: ['Zotero', 'Components', 'Services'],
    footer: {
      js: [
        'var install = ReadingFlowBootstrap.install;',
        'var startup = ReadingFlowBootstrap.startup;',
        'var shutdown = ReadingFlowBootstrap.shutdown;',
        'var uninstall = ReadingFlowBootstrap.uninstall;',
        'var onMainWindowLoad = ReadingFlowBootstrap.onMainWindowLoad;',
        'var onMainWindowUnload = ReadingFlowBootstrap.onMainWindowUnload;'
      ].join(' ')
    }
  }),
  esbuild.build({
    entryPoints: ['src/dashboard.ts'],
    bundle: true,
    format: 'iife',
    outfile: 'addon/dashboard.js',
    target: 'es2022'
  })
]).then(() => {
  console.log('Build finished. Creating .xpi...');
  createReproducibleXpi();
  console.log(`Successfully created ${XPI_NAME}`);
  writeUpdateManifest();
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
