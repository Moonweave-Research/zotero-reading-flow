const esbuild = require('esbuild');
const { exec } = require('child_process');

esbuild.build({
  entryPoints: ['src/bootstrap.ts'],
  bundle: true,
  format: 'esm',
  outfile: 'addon/bootstrap.js',
  target: 'es2022',
  external: ['Zotero']
}).then(() => {
  console.log('Build finished. Creating .xpi...');
  const xpiName = 'zotero-reading-flow.xpi';
  // Zip the contents of the addon folder
  const cmd = `cd addon && zip -r ../${xpiName} *`;
  exec(cmd, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error creating xpi: ${error.message}`);
      return;
    }
    console.log(`Successfully created ${xpiName}`);
  });
}).catch(() => process.exit(1));
