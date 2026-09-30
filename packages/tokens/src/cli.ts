import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { base, buildTokens } from './index.js'

// Core's own build: base only, one theme named "default", output in dist/.
const outDir = resolve(fileURLToPath(new URL('.', import.meta.url)))
buildTokens({ base, themes: { default: {} }, defaultTheme: 'default', outDir })
