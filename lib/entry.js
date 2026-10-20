/**
 * dancing-lyrics-toast — Host half.
 *
 * Watches session events from inside the Cordis host and pushes them as
 * rendered toast payloads to desktop companion windows over a local SSE
 * stream. The companion (an always-on-top transparent window) owns the
 * animation; this half owns the facts: which event happened, and what the
 * user's configured message template resolves to.
 *
 * The server binds 127.0.0.1 only. It is deliberately a standalone http server
 * rather than a `webServer` route: the companion is not a browser page, so the
 * host/origin fence that guards Web-GUI routes would refuse it.
 *
 * @module dancing-lyrics-toast
 */
import http from 'node:http'
import { homedir } from 'node:os'
import { existsSync, appendFileSync, mkdirSync } from 'node:fs'
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import z from '@deepseek-ai/schemastery'

/** Cordis plugin name. */
export const name = 'dancing-lyrics-toast'

/**
 * Required services. Without declaring `webServer` here the fiber can start
 * before the service exists, `ctx.webServer` reads undefined, and the settings
 * route silently never registers.
 */
export const inject = ['webServer']

/**
 * The default message template for each event type. Placeholders in curly
 * braces resolve host-side against the event's payload.
 */
const DEFAULT_MESSAGES = {
  permission: '需要授权 · {tool}',
  'permission-done': '{tool} · {outcome}',
  'turn-start': '思考中 …',
  'turn-end': '任务完成'
}

/** One event family the companion can render. */
function eventSection(defaultText) {
  return z.object({
    enabled: z.boolean().default(true).description('是否推送这类事件'),
    text: z.string().default(defaultText).description('提示文案，支持 {tool} {outcome} {title} 占位符')
  })
}

/**
 * The settings schema the DSH settings page renders. Editing a value reloads
 * this plugin; the SSE server restarts and companions reconnect by polling.
 */
export const Config = z.object({
  port: z.number().min(1024).max(65535).default(41170).description('本地 SSE 端口（仅监听 127.0.0.1）'),
  events: z.object({
    permission: eventSection(DEFAULT_MESSAGES.permission).description('需要你授权时'),
    'permission-done': eventSection(DEFAULT_MESSAGES['permission-done']).description('授权被处理后'),
    'turn-start': eventSection(DEFAULT_MESSAGES['turn-start']).description('回合开始（开始工作）'),
    'turn-end': eventSection(DEFAULT_MESSAGES['turn-end']).description('回合结束（任务完成）')
  }),
  font: z.object({
    family: z.union(['默认', '微软雅黑', '宋体', '楷体', '黑体', '自定义字体文件']).default('默认').description('字体'),
    customPath: z.string().default('').description('自定义字体文件路径（TTF/OTF/TTC），选「自定义字体文件」时生效'),
    weight: z.number().min(100).max(900).step(100).default(700).description('字重')
  }).description('字体'),
  colors: z.object({
    core: z.string().default('#ffffff').description('字芯颜色'),
    outline: z.string().default('rgba(20,16,12,0.9)').description('描边颜色'),
    outlineWidth: z.number().min(0).max(6).default(1.5).description('描边宽度（px）'),
    halo: z.string().default('#fff0d2').description('光晕颜色（基础）'),
    glow: z.number().min(0).max(100).default(60).description('白芯发光强度（%）'),
    accentPermission: z.string().default('#ffbe5c').description('光晕强调色 · 需要授权'),
    accentPermissionDone: z.string().default('#96dca0').description('光晕强调色 · 授权完成'),
    accentThinking: z.string().default('#a0c8ff').description('光晕强调色 · 思考中'),
    accentTurnEnd: z.string().default('#fff0d2').description('光晕强调色 · 任务完成')
  }).description('颜色'),
  animation: z.object({
    entry: z.union(['ripple', 'drop']).default('ripple').description('入场风格：波纹浮现 / 跌落登场'),
    exit: z.union(['ripple', 'drop']).default('ripple').description('退场风格：波纹原地淡出 / 跌落下坠'),
    motion: z.union(['wave', 'jitter', 'none']).default('jitter').description('停留时律动：波动 / 抖动 / 静止'),
    speed: z.number().min(0.25).max(3).default(1).description('入退场速度倍率'),
    jitter: z.number().min(0).max(15).default(6).description('抖动频率（次/秒）'),
    waveAmplitude: z.number().min(0).max(20).default(4).description('波动幅度（px）'),
    dropDistance: z.number().min(0).max(128).default(64).description('跌落距离（px）'),
    tilt: z.number().min(-20).max(20).default(0).description('整句倾斜角度（度）')
  }).description('动画'),
  overlay: z.object({
    position: z.union(['sides', 'bottom-right', 'bottom-center', 'top-center']).default('sides').description('位置：sides=屏幕两侧随机（巴士歌词风），其余为贴边堆叠'),
    margin: z.number().min(0).max(400).default(48).description('边缘距离（px）'),
    vFrom: z.number().min(0).max(99).default(15).description('两侧模式：垂直活动区上界（%）'),
    vTo: z.number().min(1).max(100).default(75).description('两侧模式：垂直活动区下界（%）'),
    fontSize: z.number().min(12).max(96).default(34).description('字号（px）'),
    displaySeconds: z.number().min(1).max(60).default(6).description('每条提示停留秒数')
  }).description('悬浮窗'),
  companion: z.object({
    launch: z.boolean().default(true).description('插件加载时自动启动伴侣悬浮窗'),
    path: z.string().default('').description('伴侣目录（含 package.json 的 companion 目录）；留空则用插件自带的 companion/')
  }).description('伴侣悬浮窗')
}).description('桌面提示')

/**
 * Read a possibly-throwing getter to a plain value.
 * @param thunk - the getter.
 * @returns the value, or undefined when reading threw.
 */
function safe(thunk) {
  try {
    return thunk()
  } catch {
    return undefined
  }
}

/**
 * Fill `{placeholder}` holes in one message template. Unknown placeholders and
 * unmatched braces are left as-is so a typo stays visible to the editor.
 * @param template - the raw template text.
 * @param values - the event payload values.
 * @returns the resolved text.
 */
function renderTemplate(template, values) {
  return String(template).replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (whole, key) => {
    const value = values[key]
    return value === undefined || value === null ? whole : String(value)
  })
}

/** One connected companion window. */
class Hub {
  constructor() {
    /** @type {Set<import('node:http').ServerResponse>} */
    this.clients = new Set()
  }

  /**
   * Attach one SSE response, answer its handshake and stream the hello frame.
   * @param req - the request.
   * @param res - the response.
   * @param hello - the first frame (current config).
   */
  add(req, res, hello) {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      'access-control-allow-origin': '*'
    })
    res.write(`event: hello\ndata: ${JSON.stringify(hello)}\n\n`)
    this.clients.add(res)
    req.on('close', () => this.clients.delete(res))
  }

  /**
   * Fan one frame out to every companion; dropping a dead client here is fine —
   * its `close` handler detaches it.
   * @param event - the SSE event name.
   * @param data - the JSON frame.
   */
  emit(event, data) {
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
    for (const res of this.clients) {
      try {
        res.write(frame)
      } catch {
        this.clients.delete(res)
      }
    }
  }

  /** Stop streaming and close every client. */
  dispose() {
    for (const res of this.clients) {
      try {
        res.end()
      } catch {
        /* already gone */
      }
    }
    this.clients.clear()
  }
}

/** Session event type → the config section and toast kind that renders it. */
const KIND_OF_EVENT = {
  'approval/asked': 'permission',
  'approval/decided': 'permission-done',
  'turn/start': 'turn-start',
  'turn/end': 'turn-end'
}

/** The same-origin route the settings page reads and writes settings through. */
const CONFIG_ROUTE = '/plugins/dancing-lyrics-toast/config'
/** The same-origin route the settings page uses to fire sample animations. */
const TEST_ROUTE = '/plugins/dancing-lyrics-toast/test'

/** Sample payload values the test route renders templates with. */
const TEST_VALUES = {
  tool: 'bash',
  outcome: 'allowed-once',
  title: '测试会话',
  sessionId: 'test-session-1'
}

//#region config persistence
/**
 * Where edited settings live. The bundle row sits at the profile composition's
 * root, which the DSH config editor does not enumerate (it only serves entries
 * under bundle includes), so the settings transport has no namespace for this
 * plugin — the settings page reads and writes through this file instead.
 */
function dshHome() {
  const configured = process.env.DSH_HOME
  return configured !== undefined && configured !== '' ? configured : join(homedir(), '.dsh')
}
const CONFIG_DIR = () => join(dshHome(), 'dancing-lyrics-toast')
const CONFIG_FILE = () => join(CONFIG_DIR(), 'config.json')

/** Whether a value is a plain data object (not array/null). */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Merge `patch` into `target` in place, one container level deep — the config
 * shape is exactly two levels (sections of scalars).
 * @param target - the live config object every reader closes over.
 * @param patch - the incoming partial config.
 */
function deepMergeInto(target, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (isPlainObject(value) && isPlainObject(target[key])) Object.assign(target[key], value)
    else target[key] = value
  }
}

/**
 * Read the persisted settings edits, if any.
 * @returns the parsed state object, or null when absent/malformed.
 */
async function readStateConfig() {
  try {
    const parsed = JSON.parse(await readFile(CONFIG_FILE(), 'utf8'))
    return isPlainObject(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * Persist the effective config atomically (tmp file + rename).
 * @param config - the effective config object.
 */
async function persistConfig(config) {
  await mkdir(CONFIG_DIR(), { recursive: true })
  const tmp = join(CONFIG_DIR(), `config.tmp-${process.pid}-${Math.random().toString(16).slice(2, 8)}`)
  await writeFile(tmp, JSON.stringify(config, null, 2) + '\n')
  await rename(tmp, CONFIG_FILE())
}
//#endregion


/**
 * Fold one session log event into zero or more toast frames.
 * @param type - the session event type (e.g. `approval/asked`).
 * @param data - the session event data.
 * @param session - the owning session.
 * @param config - the plugin config.
 * @returns the toast frames to push.
 */
function toastsFor(type, data, session, config) {
  const kind = KIND_OF_EVENT[type]
  const section = kind === undefined ? undefined : config.events[kind]
  if (section === undefined || !section.enabled) return []
  const values = {
    tool: safe(() => data?.toolName) ?? '工具',
    outcome: safe(() => data?.outcome) ?? '',
    title: safe(() => session.title) ?? '',
    sessionId: safe(() => session.id) ?? ''
  }
  const text = renderTemplate(section.text, values)
  if (text.trim() === '') return []
  // The frame carries the whole config so the companion renders from one
  // source of truth and settings edits apply to the very next toast.
  return [{ kind, text, config }]
}

/**
 * Locate the companion directory to launch. The configured path wins; the
 * fallback is this package's own `companion/`, present when the whole
 * repository is installed in place.
 * @param config - the resolved Config.
 * @returns the directory containing the companion's package.json, or undefined.
 */
function companionDir(config) {
  const configured = config.companion?.path
  if (configured !== undefined && configured !== '' && existsSync(join(configured, 'package.json'))) {
    return configured
  }
  const bundled = join(dirname(fileURLToPath(import.meta.url)), '..', 'companion')
  return existsSync(join(bundled, 'package.json')) ? bundled : undefined
}

/** The last time a companion launch was attempted (Date.now ms). */
let lastCompanionLaunch = 0

/**
 * Append one line to the launch log — the companion spawn is detached and its
 * stdio is ignored, so without this the child's death is invisible to every
 * observer. Best-effort: logging never breaks launching.
 * @param text - the line to record.
 */
function logLaunch(text) {
  try {
    mkdirSync(CONFIG_DIR(), { recursive: true })
    appendFileSync(join(CONFIG_DIR(), 'launch.log'), `${new Date().toISOString()} ${text}\n`)
  } catch {
    /* diagnostics only */
  }
}

/**
 * Launch the companion window, detached so it outlives config reloads. A
 * second instance exits itself via the single-instance lock, so reloads are
 * safe without tracking the child.
 * @param ctx - the Host context.
 * @param config - the resolved Config.
 * @param force - true when the settings page asks for a window even though
 *   the auto-launch switch is off.
 */
function launchCompanion(ctx, config, force = false) {
  if (!force && config.companion?.launch !== true) return
  const dir = companionDir(config)
  if (dir === undefined) {
    ctx.logger.warn('dancing-lyrics-toast: 未找到伴侣窗口目录，请在设置里填写 companion.path')
    logLaunch(`launch skipped: companion dir not found (configured=${JSON.stringify(config.companion?.path ?? '')})`)
    return
  }
  const electron = join(dir, 'node_modules', 'electron', 'dist', 'electron.exe')
  const command = existsSync(electron) ? electron : 'electron'
  // The host itself runs inside Electron; an inherited ELECTRON_RUN_AS_NODE
  // would turn the spawned electron.exe into a bare node process, which then
  // dies instantly on require('electron'). Never pass it to the child.
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  lastCompanionLaunch = Date.now()
  try {
    const child = spawn(command, ['.'], { cwd: dir, detached: true, stdio: 'ignore', windowsHide: true, env })
    child.on('error', (error) => logLaunch(`child error: ${error.code ?? ''} ${error.message}`))
    child.on('exit', (code, signal) => logLaunch(`child exit: code=${code} signal=${signal}`))
    child.unref()
    logLaunch(`spawned ${command} pid=${child.pid} (from ${dir})`)
    ctx.logger.info('dancing-lyrics-toast: 伴侣窗口已启动 (%s)', dir)
  } catch (error) {
    logLaunch(`spawn threw: ${error?.message ?? String(error)}`)
    ctx.logger.warn('dancing-lyrics-toast: 启动伴侣窗口失败')
    ctx.logger.warn(error)
  }
}

/** Mount the event watcher and the SSE server. @param ctx - the Host context. @param config - the resolved Config. */
export async function apply(ctx, config) {
  const hub = new Hub()
  let disposed = false

  // The bundle row sits at the composition root, outside the config editor's
  // include-scoped enumeration, so the settings transport has no namespace for
  // this plugin. Persisted edits (from the settings page) seed the effective
  // config instead; the injected schema value only supplies defaults.
  const state = await readStateConfig()
  if (state !== null) deepMergeInto(config, state)

  launchCompanion(ctx, config)
  ctx.effect(() => ctx.on('session/event', (session, event) => {
    if (disposed) return
    for (const toast of toastsFor(event?.type, event?.data, session, config)) {
      hub.emit('toast', toast)
    }
  }), 'dancing-lyrics-toast: session event watcher')

  ctx.effect(() => {
    const server = http.createServer((req, res) => {
      res.setHeader('access-control-allow-origin', '*')
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${config.port}`)
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'access-control-allow-methods': 'GET',
          'access-control-allow-headers': 'content-type'
        })
        res.end()
        return
      }
      if (req.method !== 'GET') {
        res.statusCode = 405
        res.setHeader('allow', 'GET')
        res.end()
        return
      }
      if (url.pathname === '/events') {
        hub.add(req, res, { kind: 'config', config })
        return
      }
      if (url.pathname === '/config') {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        res.end(JSON.stringify(config))
        return
      }
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ plugin: 'dancing-lyrics-toast', endpoints: ['/events', '/config'] }))
    })
    server.on('error', (error) => {
      ctx.logger.warn('dancing-lyrics-toast: SSE server failed on port %s', config.port)
      ctx.logger.warn(error)
    })
    server.listen(config.port, '127.0.0.1')
    // Self-healing: a companion that died (crash, killed by a cleanup tool)
    // leaves zero SSE clients; after a quiet minute, relaunch it. The
    // single-instance lock makes a redundant respawn harmless.
    let emptyBeats = 0
    const heartbeat = setInterval(() => {
      hub.emit('ping', { time: Date.now() })
      if (disposed || config.companion?.launch !== true) return
      emptyBeats = hub.clients.size === 0 ? emptyBeats + 1 : 0
      if (emptyBeats >= 4 && Date.now() - lastCompanionLaunch > 180_000) {
        ctx.logger.info('dancing-lyrics-toast: 没有伴侣连接，自动重新拉起')
        launchCompanion(ctx, config)
      }
    }, 15_000)
    return () => {
      disposed = true
      clearInterval(heartbeat)
      hub.dispose()
      server.close()
    }
  }, 'dancing-lyrics-toast: SSE server')

  ctx.effect(() => {
    try {
      const offConfig = ctx.webServer.register({
        kind: 'exact',
        path: CONFIG_ROUTE,
        handler: (req, res) => configRoute(req, res, ctx, config, hub)
      })
      const offTest = ctx.webServer.register({
        kind: 'exact',
        path: TEST_ROUTE,
        handler: (req, res) => testRoute(req, res, ctx, config, hub)
      })
      return () => {
        offConfig()
        offTest()
      }
    } catch (error) {
      // A deployment without the webServer service: the settings page has no
      // same-origin transport, but the SSE pipeline still works.
      ctx.logger.warn('dancing-lyrics-toast: webServer 不可用，设置页无法读写配置')
      ctx.logger.warn(error)
      return () => {}
    }
  }, 'dancing-lyrics-toast: settings config + test routes')
}

/**
 * Answer the test route: POST {kind, text?} pushes one toast frame to every
 * companion and reports how many received it; POST {action:'launch'} forces a
 * companion (re)start. The same connection fence guards it as the config route.
 * @param req - the request.
 * @param res - the response.
 * @param ctx - the Host context.
 * @param config - the live config object all readers share.
 * @param hub - the companion SSE hub.
 */
async function testRoute(req, res, ctx, config, hub) {
  const connection = connectionOf(ctx)
  const rejection = connection?.requestRejection?.(req)
  if (rejection !== undefined) {
    res.statusCode = rejection
    res.end()
    return
  }
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST')
    sendJson(res, 405, { code: 'method-not-allowed' })
    return
  }
  let body
  try {
    const raw = await new Promise((resolve, reject) => {
      const chunks = []
      req.on('data', (chunk) => chunks.push(chunk))
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      req.on('error', reject)
    })
    body = JSON.parse(raw || '{}')
  } catch {
    sendJson(res, 400, { code: 'invalid-json', message: '请求体不是合法 JSON' })
    return
  }
  if (body?.action === 'launch') {
    launchCompanion(ctx, config, true)
    // The child needs a moment to boot and dial in before the count is honest.
    setTimeout(() => sendJson(res, 200, { ok: true, receivers: hub.clients.size }), 1200)
    return
  }
  const kind = typeof body?.kind === 'string' ? body.kind : ''
  const section = config.events[kind]
  if (section === undefined) {
    sendJson(res, 400, { code: 'unknown-kind', message: `未知事件类型: ${kind}`, kinds: Object.keys(config.events) })
    return
  }
  const text = typeof body.text === 'string' && body.text !== '' ? body.text : renderTemplate(section.text, TEST_VALUES)
  const frame = { kind, text, config }
  hub.emit('toast', frame)
  logLaunch(`test toast: ${kind} -> ${text} (receivers=${hub.clients.size})`)
  sendJson(res, 200, { ok: true, kind, text, receivers: hub.clients.size })
}

/**
 * Optional access to the composed connection service — a bare property read of
 * an undeclared service throws in Cordis, which the HTTP carrier surfaces as a
 * bare 400 on every request.
 * @param ctx - the Host context.
 * @returns the fence owner, or undefined on a deployment without one.
 */
function connectionOf(ctx) {
  try {
    const connection = ctx.get('connection')
    return connection === null ? undefined : connection
  } catch {
    return undefined
  }
}

/** JSON response; the config answers are live facts, so never cached. */
function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}

/**
 * Answer the settings route: GET returns the effective config; POST merges a
 * patch, persists it, and fans the new config out to every companion. The
 * request must pass the host/origin + browser-session fence — a web page
 * without the session (i.e. any third-party site) is refused before the body
 * is read.
 * @param req - the request.
 * @param res - the response.
 * @param ctx - the Host context.
 * @param config - the live config object all readers share.
 * @param hub - the companion SSE hub.
 */
async function configRoute(req, res, ctx, config, hub) {
  const connection = connectionOf(ctx)
  const rejection = connection?.requestRejection?.(req)
  if (rejection !== undefined) {
    res.statusCode = rejection
    res.end()
    return
  }
  if (req.method === 'GET') {
    sendJson(res, 200, config)
    return
  }
  if (req.method !== 'POST') {
    res.setHeader('allow', 'GET, POST')
    sendJson(res, 405, { code: 'method-not-allowed' })
    return
  }
  let patch
  try {
    const body = await new Promise((resolve, reject) => {
      const chunks = []
      req.on('data', (chunk) => chunks.push(chunk))
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      req.on('error', reject)
    })
    patch = JSON.parse(body)
  } catch {
    sendJson(res, 400, { code: 'invalid-json', message: '请求体不是合法 JSON' })
    return
  }
  if (!isPlainObject(patch)) {
    sendJson(res, 400, { code: 'invalid-config', message: '配置必须是对象' })
    return
  }
  try {
    deepMergeInto(config, patch)
    await persistConfig(config)
  } catch (error) {
    ctx.logger.warn('dancing-lyrics-toast: 配置写入失败')
    ctx.logger.warn(error)
    sendJson(res, 500, { code: 'persist-failed', message: error instanceof Error ? error.message : String(error) })
    return
  }
  hub.emit('config', { kind: 'config', config })
  sendJson(res, 200, { ok: true, config })
}
