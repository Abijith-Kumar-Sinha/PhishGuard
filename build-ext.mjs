// Bundles the PhishGuard MV3 extension into extension-dist/ with esbuild.
import * as esbuild from 'esbuild'
import { cpSync, mkdirSync, rmSync } from 'node:fs'

const OUT = 'extension-dist'
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

await esbuild.build({
  entryPoints: {
    background: 'src/ext/background.ts',
    content: 'src/ext/content.ts',
    popup: 'src/ext/popup.tsx',
  },
  bundle: true,
  outdir: OUT,
  format: 'iife',
  target: 'chrome110',
  jsx: 'automatic',
  loader: { '.css': 'css' },
  define: { 'process.env.NODE_ENV': '"production"' },
  minify: true,
  logLevel: 'info',
})

cpSync('src/ext/manifest.json', `${OUT}/manifest.json`)
cpSync('src/ext/popup.html', `${OUT}/popup.html`)
cpSync('icons', `${OUT}/icons`, { recursive: true })

console.log(`\nExtension built -> ${OUT}/  (load this folder in chrome://extensions)`)
