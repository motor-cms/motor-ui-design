import baseJson from './base.json' with { type: 'json' }
import type { Tokens } from './build.js'

export * from './build.js'
export const base: Tokens = baseJson
export const packageName = '@motor-cms/ui-design-tokens'
