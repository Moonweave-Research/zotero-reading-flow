const esbuild = require('esbuild');
const { exec } = require('child_process');

esbuild.build({
  entryPoints: ['src/bootstrap.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'ReadingFlowBootstrap',
  outfile: 'addon/bootstrap.js',
  target: 'es2022',
  external: ['Zotero'],
  footer: {
    js: 'var install = ReadingFlowBootstrap.install; var startup = ReadingFlowBootstrap.startup; var shutdown = ReadingFlowBootstrap.shutdown; var uninstall = ReadingFlowBootstrap.uninstall;'
  }
}).then(() => {
  console.log('Build finished. Creating .xpi...');
  const xpiName = 'zotero-reading-flow.xpi';
  // Zip the contents of the addon folder
  const cmd = `cd addon && zip -r ../${xpiName} . -x "*.DS_Store"`;
  exec(cmd, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error creating xpi: ${error.message}`);
      return;
    }
    console.log(`Successfully created ${xpiName}`);
  });
}).catch(() => process.exit(1));
