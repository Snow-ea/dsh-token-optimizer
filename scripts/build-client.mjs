import { build } from 'esbuild'
import { writeFile } from 'node:fs/promises'

const result = await build({
  entryPoints: ['lib/client.js'],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  write: false,
  minify: false,
  legalComments: 'none',
  external: ['react', 'react/jsx-runtime'],
})

const output = result.outputFiles[0]?.text
if (output === undefined) throw new Error('client bundle did not produce an output file')

const wrapper = `window.__ModuleLoader__.load({
  id: 'dsh-token-optimizer',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
${output}
    return module.exports;
  },
});
`

await writeFile('lib/client.js', wrapper, 'utf8')
