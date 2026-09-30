import { createRequire } from 'node:module'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { createServer, type Plugin, type ViteDevServer } from 'vite'
import { legacyCssFile, outerHtml, readFixture } from './pack.js'
import type { ParityConfig } from './types.js'

const here = dirname(fileURLToPath(import.meta.url))
export const appDir = resolve(here, '../app')

export interface HarnessServer {
  origin: string
  close: () => Promise<void>
}

const VIRTUAL_BLOCKS = 'virtual:parity-blocks'
const VIRTUAL_CSS = 'virtual:parity-css'

// Serves the reference data the routes need, and the two virtual modules that carry the consumer's block map and CSS.
const parityPlugin = (o: { reference: string; blockMap?: string; css: string[]; legacyCss?: ParityConfig['legacyCss'] }): Plugin => ({
  name: 'parity-harness',
  resolveId(id) {
    if (id === VIRTUAL_BLOCKS || id === VIRTUAL_CSS) return '\0' + id
    return undefined
  },
  load(id) {
    if (id === '\0' + VIRTUAL_BLOCKS) return o.blockMap ? `export { default } from ${JSON.stringify(o.blockMap)}` : 'export default {}'
    if (id === '\0' + VIRTUAL_CSS) return o.css.map((f) => `import ${JSON.stringify(f)}`).join('\n') + '\nexport default true\n'
    return undefined
  },
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const url = new URL(req.url ?? '/', 'http://x')
      const send = (code: number, type: string, body: string | Buffer) => {
        res.statusCode = code
        res.setHeader('content-type', type)
        res.setHeader('cache-control', 'no-store')
        res.end(body)
      }
      try {
        // /__parity/instance/<key>/<instance>?vp=<n> -> { fixture, html, host, cssUrl }
        const m = url.pathname.match(/^\/__parity\/instance\/([^/]+)\/([^/]+)$/)
        if (m) {
          const dir = join(o.reference, decodeURIComponent(m[1]), decodeURIComponent(m[2]))
          if (!existsSync(join(dir, 'fixture.json'))) return send(404, 'text/plain', `no such instance ${m[1]}/${m[2]}`)
          const fixture = readFixture(dir)
          const vp = Number(url.searchParams.get('vp') ?? 1440)
          const css = legacyCssFile(o.reference, String(fixture.host ?? ''), o.legacyCss)
          return send(200, 'application/json', JSON.stringify({ fixture, html: outerHtml(dir, vp), css }))
        }
        if (url.pathname === '/__parity/legacy.css') {
          const f = join(o.reference, basename(url.searchParams.get('file') ?? ''))
          return send(200, 'text/css', readFileSync(f))
        }
        const img = url.pathname.match(/^\/_images\/([^/]+)$/)
        if (img) {
          const f = join(o.reference, '_images', img[1])
          if (!existsSync(f)) return send(404, 'text/plain', `missing fixture image ${img[1]}`)
          return send(200, 'image/png', readFileSync(f))
        }
      } catch (e) {
        return send(500, 'text/plain', String(e instanceof Error ? e.message : e))
      }
      next()
    })
  },
})

const basename = (p: string) => p.split('/').pop() ?? p

const real = (p: string) => {
  try {
    return realpathSync(p)
  } catch {
    return resolve(p)
  }
}

/**
 * What the dev server may serve: the reference pack, the harness app, the directories of the block map and of the
 * consumer CSS (their real paths: consumer packages sit behind symlinks), the pnpm stores of the harness and of the
 * working directory (Vue and the consumer's plugins resolve into them), and the config's `fsAllow`.
 */
export const fsAllowList = (o: { reference: string; cwd: string; blockMap?: string; css: string[]; fsAllow?: string[] }): string[] => {
  const require = createRequire(import.meta.url)
  const dirs = new Set<string>([real(o.reference), real(appDir), real(resolve(here, '..'))])
  if (o.blockMap) dirs.add(dirname(real(o.blockMap)))
  for (const f of o.css) dirs.add(dirname(real(f)))
  for (const f of o.fsAllow ?? []) dirs.add(real(f))
  const stores = [real(require.resolve('vue/package.json')), real(join(o.cwd, 'node_modules'))]
  for (const p of stores) {
    const i = p.indexOf(`${sep}node_modules${sep}.pnpm`)
    if (i >= 0) dirs.add(p.slice(0, i) + `${sep}node_modules${sep}.pnpm`)
    else dirs.add(p.endsWith(`${sep}node_modules`) ? p : dirname(p))
  }
  return [...dirs]
}

export const startServer = async (o: {
  reference: string
  cwd: string
  blockMap?: string
  css: string[]
  legacyCss?: ParityConfig['legacyCss']
  vitePlugins?: unknown[]
  /** extra directories the dev server may serve, besides the ones the run needs */
  fsAllow?: string[]
}): Promise<HarnessServer> => {
  const require = createRequire(import.meta.url)
  const server: ViteDevServer = await createServer({
    root: appDir,
    configFile: false,
    logLevel: 'warn',
    cacheDir: join(o.cwd, 'node_modules', '.cache', 'motor-ui-parity'),
    appType: 'spa',
    plugins: [vue(), parityPlugin(o), ...((o.vitePlugins ?? []) as Plugin[])],
    define: { __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' },
    // One Vue for the harness and the consumer's blocks. No dependency pre-bundling: it would rewrite the module graph
    // in the middle of a run ("optimized dependencies changed") and reload pages.
    resolve: { dedupe: ['vue'], alias: [{ find: /^vue$/, replacement: dirname(require.resolve('vue/package.json')) + '/dist/vue.runtime.esm-bundler.js' }] },
    optimizeDeps: { noDiscovery: true, include: [] },
    // Local dev server on 127.0.0.1 for the length of a run. It serves files from an explicit allow-list only.
    server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false, watch: null, fs: { strict: true, allow: fsAllowList(o) } },
  })
  await server.listen()
  const addr = server.httpServer!.address() as AddressInfo
  return { origin: `http://127.0.0.1:${addr.port}`, close: () => server.close() }
}
