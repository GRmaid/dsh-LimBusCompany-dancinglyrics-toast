'use strict'

/**
 * dancing-lyrics-toast companion — renderer.
 *
 * Discovers the plugin's local SSE endpoint, then renders each pushed toast as
 * a Limbus-style animated line: per-character ripple or drop entry, wave or
 * jitter motion while idle, and a ripple or drop exit. Every frame carries the
 * full plugin config, so settings edits apply to the very next toast.
 */

const DEFAULT_PORT = 41170
/** How often the renderer re-probes the endpoint while the host is absent. */
const DISCOVER_INTERVAL_MS = 3000

/** CSS font-family candidates for the named font choices. */
const NAMED_FAMILIES = {
  '默认': '"Noto Sans SC", "Microsoft YaHei", "PingFang SC", sans-serif',
  '微软雅黑': '"Microsoft YaHei"',
  '宋体': '"SimSun", "宋体"',
  '楷体': '"KaiTi", "楷体"',
  '黑体': '"SimHei", "黑体"'
}
/** The family name registered for a user-provided font file. */
const CUSTOM_FAMILY = 'DshToastCustom'

/** The stage element toasts render into. */
const stage = document.getElementById('stage')
/** Connection state readout, for the corner of the screen. */
const statusLine = document.createElement('div')
statusLine.id = 'status'
document.body.appendChild(statusLine)

/** The current plugin config (font/colors/animation/overlay settings). */
let config = null
/** Milliseconds-per-character multiplier, derived from `speed`. */
let speed = 1

function setStatus(text) {
  statusLine.textContent = text
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

/**
 * Register a user font file as `@font-face` and return its family stack.
 * The page itself is `file://`, so a `file:///` font URL is same-origin.
 * @param path - the configured font file path.
 * @returns the CSS font-family value, or undefined when unset.
 */
function applyCustomFont(path) {
  const existing = document.getElementById('dsh-toast-font')
  if (path === undefined || path === '') {
    if (existing !== null) existing.remove()
    return undefined
  }
  const url = 'file:///' + String(path).replaceAll('\\', '/').replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/')
  const face = existing ?? document.createElement('style')
  face.id = 'dsh-toast-font'
  face.textContent = `@font-face{font-family:"${CUSTOM_FAMILY}";src:url("${url}")}`
  if (existing === null) document.head.appendChild(face)
  return `"${CUSTOM_FAMILY}"`
}

/** Push the current config into CSS custom properties. */
function applyConfig(next) {
  config = next
  const font = next?.font ?? {}
  const colors = next?.colors ?? {}
  const animation = next?.animation ?? {}
  const overlay = next?.overlay ?? {}

  speed = clamp(animation.speed ?? 1, 0.25, 3)
  const custom = applyCustomFont(font.customPath)
  const family = custom ?? NAMED_FAMILIES[font.family] ?? NAMED_FAMILIES['默认']

  const root = document.documentElement.style
  root.setProperty('--font-family', family)
  root.setProperty('--font-weight', String(font.weight ?? 700))
  root.setProperty('--font-size', `${overlay.fontSize ?? 34}px`)
  root.setProperty('--core', colors.core ?? '#ffffff')
  root.setProperty('--outline', colors.outline ?? 'rgba(20,16,12,0.9)')
  root.setProperty('--outline-width', `${colors.outlineWidth ?? 1.5}px`)
  root.setProperty('--halo', colors.halo ?? '#fff0d2')
  const glowPercent = clamp(colors.glow ?? 60, 0, 100) / 100
  root.setProperty('--halo-size', `${(2 + 8 * glowPercent).toFixed(1)}px`)

  // Ask the main process to (re)fit the overlay onto the work area. Guarded:
  // a window without the preload (e.g. opened straight in a browser for
  // debugging) must still animate.
  window.toastApi?.layout?.()
}

//#region discovery + SSE

/** The live EventSource, or null while undiscovered. */
let source = null
let discoverTimer = null

/** Give up the current stream and go back to polling for the host. */
function backToDiscovery(reason) {
  if (source !== null) {
    source.close()
    source = null
  }
  setStatus(reason ?? '等待 DSH 插件…')
  if (discoverTimer === null) {
    discoverTimer = setInterval(discover, DISCOVER_INTERVAL_MS)
  }
}

/** Probe /config, and when the plugin answers, open the SSE stream. */
async function discover() {
  const port = Number(new URLSearchParams(location.search).get('port')) || DEFAULT_PORT
  try {
    const response = await fetch(`http://127.0.0.1:${port}/config`, { cache: 'no-store' })
    if (!response.ok) throw new Error(String(response.status))
    applyConfig(await response.json())
  } catch {
    return // host not up yet; keep polling
  }
  if (discoverTimer !== null) {
    clearInterval(discoverTimer)
    discoverTimer = null
  }
  source = new EventSource(`http://127.0.0.1:${port}/events`)
  source.addEventListener('hello', (event) => {
    const frame = JSON.parse(event.data)
    if (frame.kind === 'config' && frame.config !== undefined) applyConfig(frame.config)
    setStatus('已连接')
  })
  source.addEventListener('toast', (event) => {
    enqueueToast(JSON.parse(event.data))
  })
  source.addEventListener('config', (event) => {
    const frame = JSON.parse(event.data)
    if (frame.kind === 'config' && frame.config !== undefined) applyConfig(frame.config)
  })
  source.onerror = () => backToDiscovery('连接断开，重试中…')
}

//#endregion
//#region toast rendering

/** In-flight toasts, oldest first. */
const live = []
const MAX_STACKED = 3
/** Vertical bands per screen side in "sides" mode. */
const SIDES_SLOTS = 5

/**
 * Pick a free (side, slot) cell for a new toast, falling back to any cell
 * when all are occupied. Occupied cells come from the live toasts.
 * @returns {{side: 'left'|'right', slot: number}} the chosen cell.
 */
function chooseCell() {
  const taken = new Set()
  for (const item of live) {
    if (item.cell !== undefined) taken.add(`${item.cell.side}:${item.cell.slot}`)
  }
  const cells = []
  for (const side of ['left', 'right']) {
    for (let slot = 0; slot < SIDES_SLOTS; slot += 1) cells.push({ side, slot })
  }
  const free = cells.filter((cell) => !taken.has(`${cell.side}:${cell.slot}`))
  const pool = free.length > 0 ? free : cells
  return pool[Math.floor(Math.random() * pool.length)]
}

/**
 * Position one line absolutely inside the work-area overlay. "sides" scatters
 * left/right with mirrored tilt; the anchored modes stack at an edge. The
 * window already excludes the taskbar (work area), so margins only guard the
 * screen edges.
 * @param item - the live toast record (line appended to the stage).
 */
function placeToast(item) {
  const overlay = config?.overlay ?? {}
  const animation = config?.animation ?? {}
  const margin = clamp(overlay.margin ?? 48, 0, 400)
  const tilt = animation.tilt ?? 0
  const el = item.line
  const mode = overlay.position ?? 'sides'
  el.style.left = ''
  el.style.right = ''
  el.style.top = ''
  el.style.bottom = ''
  el.style.rotate = ''

  if (mode === 'sides') {
    const cell = item.cell ?? (item.cell = chooseCell())
    const height = window.innerHeight
    const from = (clamp(overlay.vFrom ?? 15, 0, 99) / 100) * height
    const to = (clamp(overlay.vTo ?? 75, 1, 100) / 100) * height
    const slotHeight = Math.max(40, (Math.max(to, from + 40) - from) / SIDES_SLOTS)
    const jitter = (Math.random() * 2 - 1) * Math.min(10, slotHeight * 0.15)
    el.style.top = `${Math.round(from + cell.slot * slotHeight + (slotHeight - el.offsetHeight) / 2 + jitter)}px`
    el.style[cell.side] = `${margin}px`
    el.style.rotate = `${cell.side === 'left' ? tilt : -tilt}deg`
    return
  }
  // Anchored modes: stack lines inward from the anchor edge in arrival order.
  let offset = margin
  for (const earlier of live) {
    if (earlier === item) break
    offset += earlier.line.offsetHeight + 10
  }
  const topAnchored = mode.startsWith('top')
  const room = (topAnchored ? window.innerHeight : window.innerHeight) - margin * 2 - el.offsetHeight
  const finalOffset = Math.min(offset, Math.max(margin, room))
  if (mode === 'bottom-center' || mode === 'top-center') {
    el.style.left = `${Math.round((window.innerWidth - el.offsetWidth) / 2)}px`
  } else {
    el.style.right = `${margin}px`
  }
  el.style[topAnchored ? 'top' : 'bottom'] = `${Math.round(finalOffset)}px`
  el.style.rotate = `${tilt}deg`
}

/** Per-kind accent colors, read from the current config. */
function accentOf(kind) {
  const colors = config?.colors ?? {}
  switch (kind) {
    case 'permission': return colors.accentPermission
    case 'permission-done': return colors.accentPermissionDone
    case 'turn-start': return colors.accentThinking
    case 'turn-end': return colors.accentTurnEnd
    default: return undefined
  }
}

/**
 * Queue one toast; when the stage is full, retire the oldest immediately.
 * @param frame - the toast frame (kind, text, config).
 */
function enqueueToast(frame) {
  if (frame.config !== undefined) applyConfig(frame.config)
  if (live.length >= MAX_STACKED) retire(live[0], true)
  showToast(frame)
}

/**
 * Build one animated line.
 * @param frame - the toast frame.
 */
function showToast(frame) {
  const text = String(frame.text ?? '')
  const animation = config?.animation ?? {}
  const overlay = config?.overlay ?? {}
  const dropDistance = clamp(animation.dropDistance ?? 64, 0, 128)

  const line = document.createElement('div')
  line.className = `toast enter-${animation.entry === 'drop' ? 'drop' : 'ripple'}`
  line.style.setProperty('--font-size', `${overlay.fontSize ?? 34}px`)
  line.style.setProperty('--halo', accentOf(frame.kind) ?? (config?.colors?.halo ?? '#fff0d2'))

  // Split into per-character spans; whitespace keeps its width inside the flex row.
  const chars = Array.from(text)
  const charIn = Math.round((animation.entry === 'drop' ? 420 : 260) / speed)
  const stagger = Math.round(38 / speed)
  chars.forEach((ch, index) => {
    const span = document.createElement('span')
    span.className = 'char'
    span.textContent = ch === ' ' ? '\u00A0' : ch
    span.style.setProperty('--char-in', `${charIn}ms`)
    span.style.setProperty('--char-delay', `${index * stagger}ms`)
    span.style.setProperty('--drop-distance', `${dropDistance}px`)
    line.appendChild(span)
  })

  const charSpans = [...line.children]
  const entryDone = (charSpans.length - 1) * stagger + charIn
  const item = { line, cell: undefined, jitterTimer: null, waveTimer: null, timers: [] }
  live.push(item)
  stage.appendChild(line)
  placeToast(item)

  startIdleMotion(item, charSpans, entryDone, animation)

  // Schedule the exit once the whole line has landed and idled.
  const displayMs = clamp(overlay.displaySeconds ?? 6, 1, 60) * 1000
  item.timers.push(setTimeout(() => retire(item, false), displayMs + entryDone))
}

/**
 * Start the idle-time motion (jitter sampling or a traveling wave) after the
 * entry animation lands. Either is cancelled by retire().
 * @param item - the live toast record.
 * @param spans - the per-character spans.
 * @param entryDone - milliseconds until the last character lands.
 * @param animation - the animation config section.
 */
function startIdleMotion(item, spans, entryDone, animation) {
  const motion = animation.motion ?? 'jitter'
  if (motion === 'none') return
  if (motion === 'jitter') {
    const jitterHz = clamp(animation.jitter ?? 6, 0, 15)
    if (jitterHz <= 0) return
    item.waveTimer = setTimeout(() => {
      item.jitterTimer = setInterval(() => {
        for (const span of spans) {
          const dx = (Math.random() * 2 - 1) * 1.8
          const dy = (Math.random() * 2 - 1) * 1.4
          span.style.translate = `${dx.toFixed(1)}px ${dy.toFixed(1)}px`
        }
      }, 1000 / jitterHz)
    }, entryDone)
    return
  }
  // Wave: a CSS animation with a per-character phase offset, armed once landed.
  const amplitude = clamp(animation.waveAmplitude ?? 4, 0, 20)
  item.waveTimer = setTimeout(() => {
    spans.forEach((span, index) => {
      span.style.setProperty('--wave-amp', `${amplitude}px`)
      span.style.animation = `char-wave 1.8s ease-in-out ${index * 70}ms infinite alternate`
    })
  }, entryDone)
}

/**
 * Play the exit animation and remove the line when it finishes.
 * @param item - the live toast record.
 * @param immediate - skip the idle wait and exit at once.
 */
function retire(item, immediate) {
  if (item.retired) return
  item.retired = true
  const index = live.indexOf(item)
  if (index >= 0) live.splice(index, 1)
  for (const timer of item.timers.splice(0)) clearTimeout(timer)
  if (item.jitterTimer !== null) clearInterval(item.jitterTimer)
  if (item.waveTimer !== null) clearTimeout(item.waveTimer)

  const animation = config?.animation ?? {}
  const style = animation.exit === 'drop' ? 'exit-drop' : 'exit-ripple'
  const dropDistance = clamp(animation.dropDistance ?? 64, 0, 128)
  const charOut = Math.round((style === 'exit-drop' ? 420 : 200) / speed)
  const stagger = Math.round(22 / speed)
  const chars = [...item.line.children]
  chars.forEach((span, i) => {
    span.style.animation = ''
    span.style.setProperty('--char-out', `${charOut}ms`)
    span.style.setProperty('--char-delay', `${i * stagger}ms`)
    span.style.setProperty('--drop-distance', `${dropDistance}px`)
    span.style.setProperty('--drop-tilt', `${((Math.random() * 2 - 1) * 8).toFixed(1)}deg`)
  })
  item.line.className = `toast ${style}`

  item.timers.push(setTimeout(() => item.line.remove(), charOut + stagger * chars.length))
}

//#endregion

backToDiscovery()
