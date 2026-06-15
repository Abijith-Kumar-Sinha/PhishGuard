// Bundles the Unmaskr MV3 extension into extension-dist/ with esbuild.
import * as esbuild from 'esbuild'
import { cpSync, mkdirSync, rmSync } from 'node:fs'

// `--store` produces the publishable Chrome Web Store build: the #unmaskr-test
// demo hook is dead-code-eliminated (__PG_DEMO__ = false). The default build keeps
// the hook so the local demo (demo.html#unmaskr-test=...) still works.
const STORE = process.argv.includes('--store')

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
  define: {
    'process.env.NODE_ENV': '"production"',
    __PG_DEMO__: JSON.stringify(!STORE),
  },
  minify: true,
  logLevel: 'info',
})

cpSync('src/ext/manifest.json', `${OUT}/manifest.json`)
cpSync('src/ext/popup.html', `${OUT}/popup.html`)
cpSync('icons', `${OUT}/icons`, { recursive: true })

console.log(
  `\nExtension built -> ${OUT}/  (load this folder in chrome://extensions)` +
    (STORE ? '  [STORE build: demo hook stripped]' : '  [dev build: demo hook included]'),
)
