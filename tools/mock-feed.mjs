/**
 * Mock feed for developing the companion without DSH. Serves the same two
 * endpoints the plugin serves and pushes a scripted sequence of toasts.
 */
import http from 'node:http'

const config = {
  port: Number(process.argv[2] ?? 41170),
  events: {},
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
  animation: { entry: 'ripple', exit: 'drop', motion: 'wave', speed: 1.5, jitter: 6, waveAmplitude: 5, dropDistance: 64, tilt: -3 },
  overlay: { position: 'sides', margin: 60, vFrom: 10, vTo: 80, fontSize: 40, displaySeconds: 6 }
}

const SCRIPT = [
  { kind: 'permission', text: '需要授权 · bash', config },
  { kind: 'turn-start', text: '思考中 …', config },
  { kind: 'turn-end', text: '任务完成 · 重构桌面提示插件', config },
  { kind: 'permission', text: '需要授权 · 编辑 README.md', config }
]

const clients = new Set()
const server = http.createServer((req, res) => {
  res.setHeader('access-control-allow-origin', '*')
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${config.port}`)
  if (url.pathname === '/events') {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      'access-control-allow-origin': '*'
    })
    res.write(`event: hello\ndata: ${JSON.stringify({ kind: 'config', config })}\n\n`)
    clients.add(res)
    req.on('close', () => clients.delete(res))
    return
  }
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(config))
})
server.listen(config.port, '127.0.0.1', () => console.log('mock feed on', config.port))

let index = 0
setInterval(() => {
  if (clients.size === 0) return
  const toast = SCRIPT[index % SCRIPT.length]
  index += 1
  const frame = `event: toast\ndata: ${JSON.stringify(toast)}\n\n`
  for (const res of clients) res.write(frame)
  console.log('pushed:', toast.kind, toast.text)
}, 3500)
