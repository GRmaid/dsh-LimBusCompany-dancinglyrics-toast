/**
 * Local harness: exercises the host half without DSH. Applies the plugin with
 * a fake Cordis context, feeds it the session events it watches, and verifies
 * the SSE stream delivers the rendered toasts.
 */
import http from 'node:http'
import { readFile as readFileAsync } from 'node:fs/promises'

const ctx = {
  logger: { warn: (m, ...a) => console.log('[warn]', m, ...a) },
  effects: [],
  on(event, handler) {
    this.handlers.set(event, handler)
    return () => this.handlers.delete(event)
  },
  handlers: new Map(),
  get(name) {
    throw new Error('service not declared: ' + name)
  },
  effect(thunk, label) {
    const dispose = thunk()
    this.effects.push({ label, dispose })
  }
}

const config = {
  port: 41199,
  events: {
    permission: { enabled: true, text: '需要授权 · {tool}' },
    'permission-done': { enabled: true, text: '{tool} · {outcome}' },
    'turn-start': { enabled: false, text: '思考中' },
    'turn-end': { enabled: true, text: '任务完成 · {title}' }
  },
  font: { family: '默认', customPath: '', weight: 700 },
  colors: {
    core: '#ffffff',
    outline: 'rgba(20,16,12,0.9)',
    outlineWidth: 1.5,
    halo: '#fff0d2',
    glow: 60,
    accentPermission: '#ffbe5c',
    accentPermissionDone: '#96dca0',
    accentThinking: '#a0c8ff',
    accentTurnEnd: '#fff0d2'
  },
  animation: { entry: 'ripple', exit: 'drop', motion: 'wave', speed: 1, jitter: 6, waveAmplitude: 4, dropDistance: 64, tilt: -3 },
  overlay: { position: 'bottom-right', fontSize: 34, displaySeconds: 6 },
  companion: { launch: false, path: '' }
}

const { apply, name, Config } = await import('../lib/entry.js')
console.log('plugin name:', name, '| Config schema:', typeof Config === 'function' ? 'ok' : typeof Config)

// The webServer route: emulate the same-origin settings transport. On a real
// Cordis context an undeclared service read throws (the plugin catches that);
// here the fake just exposes the service directly.
const routes = new Map()
ctx.webServer = { register: (def) => { routes.set(def.path, def.handler); return () => routes.delete(def.path) } }

// Run with DSH_HOME pointed at a throwaway dir so the state file is isolated.
process.env.DSH_HOME = new URL('./dsh-home/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

await apply(ctx, config)
await new Promise((resolve) => setTimeout(resolve, 200))
console.log('routes:', [...routes.keys()].join(','))

// GET the config through the route (fake minimal req/res).
const fakeRes = () => {
  const res = { statusCode: 0, headers: {}, body: '' }
  res.setHeader = (k, v) => { res.headers[k] = v }
  res.writeHead = (code, headers) => { res.statusCode = code; Object.assign(res.headers, headers ?? {}) }
  res.end = (data) => { res.body = data ?? '' }
  return res
}
const getRes = fakeRes()
await routes.get('/plugins/dancing-lyrics-toast/config')({ method: 'GET', on: () => {} }, getRes)
console.log('GET route ->', getRes.statusCode, 'fontSize:', JSON.parse(getRes.body).overlay.fontSize)

// POST a patch through the route and verify merge + persistence.
const postRes = fakeRes()
const patch = { overlay: { fontSize: 48 } }
const body = JSON.stringify(patch)
const postReq = {
  method: 'POST',
  on: (event, cb) => {
    if (event === 'data') setImmediate(() => cb(Buffer.from(body)))
    if (event === 'end') setImmediate(cb)
  }
}
await routes.get('/plugins/dancing-lyrics-toast/config')(postReq, postRes)
console.log('POST route ->', postRes.statusCode)
const persisted = JSON.parse(await readFileAsync(new URL('./dsh-home/dancing-lyrics-toast/config.json', import.meta.url), 'utf8'))
console.log('persisted fontSize:', persisted.overlay?.fontSize ?? '(unchanged)', '| halo kept:', persisted.colors?.halo)

// Connect one SSE client, then fire the watched session events.
const frames = []
let sseReq = null
await new Promise((resolve, reject) => {
  sseReq = http.get('http://127.0.0.1:41199/events', (res) => {
    resolve(res)
    res.setEncoding('utf8')
    let buffer = ''
    res.on('data', (chunk) => {
      buffer += chunk
      let cut
      while ((cut = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, cut)
        buffer = buffer.slice(cut + 2)
        frames.push(frame)
      }
    })
    res.on("error", reject)
  })
  sseReq.on('error', reject)
})

const session = { id: 'sess-1', title: '重构插件', eventAt: () => null }
const onEvent = ctx.handlers.get('session/event')
onEvent(session, { type: 'turn/start', data: {} })
onEvent(session, { type: 'approval/asked', data: { id: 'x', toolName: 'bash' } })
onEvent(session, { type: 'approval/decided', data: { id: 'x', outcome: 'allowed-once' } })
onEvent(session, { type: 'turn/end', data: {} })
await new Promise((resolve) => setTimeout(resolve, 300))

// Test route while one SSE client is connected: expect receivers 1.
const testRes = fakeRes()
const testBody = JSON.stringify({ kind: 'permission' })
const testReq = {
  method: 'POST',
  on: (event, cb) => {
    if (event === 'data') setImmediate(() => cb(Buffer.from(testBody)))
    if (event === 'end') setImmediate(cb)
  }
}
await routes.get('/plugins/dancing-lyrics-toast/test')(testReq, testRes)
const testAnswer = JSON.parse(testRes.body)
console.log('POST test ->', testRes.statusCode, '| text:', testAnswer.text, '| receivers:', testAnswer.receivers)
await new Promise((resolve) => setTimeout(resolve, 150))
sseReq.destroy()


// Fetch /config as the companion does.
const probe = await fetch('http://127.0.0.1:41199/config')
console.log('GET /config ->', probe.status)

for (const frame of frames) console.log('SSE frame:', JSON.stringify(frame))
for (const { label, dispose } of ctx.effects) dispose()
console.log('done')
process.exit(0)
