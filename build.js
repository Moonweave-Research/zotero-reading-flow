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
  // Zip only the necessary files, excluding hidden system files
  const cmd = `cd addon && zip -r ../${xpiName} . -x "*.DS_Store"`;
  exec(cmd, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error creating xpi: ${error.message}`);
      return;
    }
    console.log(`Successfully created ${xpiName}`);
  });
}).catch(() => process.exit(1));
