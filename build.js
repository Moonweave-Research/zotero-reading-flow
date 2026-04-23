const esbuild = require('esbuild');
const { execFileSync } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');

const ADDON_ID = 'readingflow@moon.com';
const XPI_NAME = 'zotero-reading-flow.xpi';
const RELEASE_BASE_URL = 'https://github.com/Moon-python/zotero-reading-flow/releases/download';

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
            update_link: `${RELEASE_BASE_URL}/v${version}/${XPI_NAME}`,
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
}).then(() => {
  console.log('Build finished. Creating .xpi...');
  if (fs.existsSync(XPI_NAME)) {
    fs.unlinkSync(XPI_NAME);
  }
  execFileSync('zip', ['-r', `../${XPI_NAME}`, '.', '-x', '*.DS_Store'], {
    cwd: 'addon',
    stdio: 'inherit'
  });
  console.log(`Successfully created ${XPI_NAME}`);
  writeUpdateManifest();
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
