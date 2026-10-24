import * as esbuild from 'esbuild';
const production = process.argv[2] === 'production';
const context = await esbuild.context({
  entryPoints: ['src/main.ts'], bundle: true, format: 'cjs', target: 'es2021',
  external: ['obsidian', '@codemirror/*', '@lezer/*'], outfile: 'main.js',
  sourcemap: production ? false : 'inline', minify: production,
});
if (production) { await context.rebuild(); await context.dispose(); }
else await context.watch();
