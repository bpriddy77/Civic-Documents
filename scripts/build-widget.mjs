/**
 * Minifies public/government-meetings.js for production.
 *
 * The source file stays readable and unminified in the repository so a city's
 * IT staff can audit exactly what runs on their public website; the build
 * emits the compact copy that GoHighLevel pages actually load.
 */
import { build } from 'esbuild'
import { copyFile } from 'node:fs/promises'

const source = 'public/government-meetings.js'
const readable = 'public/government-meetings.src.js'
const output = 'public/government-meetings.min.js'

await copyFile(source, readable)

await build({
  entryPoints: [readable],
  outfile: output,
  bundle: false,
  minify: true,
  target: ['es2018'],
  legalComments: 'inline',
})

console.log(`Widget built: ${output}`)
