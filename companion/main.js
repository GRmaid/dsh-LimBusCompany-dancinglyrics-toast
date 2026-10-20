'use strict'

/**
 * dancing-lyrics-toast companion — Electron main process.
 *
 * One frameless, transparent, always-on-top window that floats over the
 * desktop, ignores the mouse entirely (click-through with forwarding), and
 * renders the Limbus-style text toasts the DSH plugin pushes over SSE.
 */

const { app, BrowserWindow, ipcMain, screen } = require('electron')

/** The one companion window. */
let win = null

/**
 * The overlay covers the whole work area (which excludes the taskbar), and the
 * renderer places each toast freely inside it — "sides" mode scatters lines on
 * the left/right edges, the anchored modes stack them at a corner. Constraining
 * to the work area is what keeps the taskbar from clipping text.
 * @returns the primary display's work area.
 */
function workBounds() {
  return screen.getPrimaryDisplay().workArea
}

function createWindow() {
  const area = workBounds()
  win = new BrowserWindow({
    x: area.x,
    y: area.y,
    width: area.width,
    height: area.height,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: require('node:path').join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  // Click-through everywhere: the toast is information, never a control.
  win.setIgnoreMouseEvents(true, { forward: true })
  win.setAlwaysOnTop(true, 'screen-saver')

  // Windows drops a transparent window out of the topmost band when other
  // windows activate (HWND re-parenting under DWM). The desktop-lyrics trick:
  // re-assert the level periodically so toasts always stay above everything.
  const assertTop = () => {
    if (win === null || win.isDestroyed()) return
    win.setAlwaysOnTop(true, 'screen-saver')
    win.moveTop()
  }
  setInterval(assertTop, 1500)
  win.on('show', assertTop)
  // Dev self-check: `electron . --capture out.png` saves the window contents
  // after a delay, so the animation can be verified headlessly. `--port N`
  // points the renderer at a mock feed on another port.
  const loadOptions = {}
  const portIndex = process.argv.indexOf('--port')
  if (portIndex >= 0 && process.argv[portIndex + 1] !== undefined) {
    loadOptions.search = `?port=${process.argv[portIndex + 1]}`
  }
  win.loadFile('index.html', loadOptions)
  win.once('ready-to-show', () => {
    win.showInactive()
  })

  // Dev self-check: `electron . --capture out.png` saves the window contents
  // after a delay, so the animation can be verified headlessly.
  const captureIndex = process.argv.indexOf('--capture')
  if (captureIndex >= 0 && process.argv[captureIndex + 1] !== undefined) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const image = await win.webContents.capturePage()
        require('node:fs').writeFileSync(process.argv[captureIndex + 1], image.toPNG())
        console.log('captured', process.argv[captureIndex + 1])
        app.quit()
      }, Number(process.argv[process.argv.indexOf('--capture-delay') + 1] ?? 7000))
    })
  }
}

// The renderer reports the configured layout; the overlay always covers the
// work area, so this just re-fits bounds after display or setting changes.
ipcMain.on('toast:layout', () => {
  if (win !== null && !win.isDestroyed()) win.setBounds(workBounds())
})

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win !== null && !win.isDestroyed()) win.showInactive()
  })
  app.whenReady().then(() => {
    createWindow()
    // Display changes (resolution, scaling, taskbar auto-hide) re-fit the
    // overlay. Registered after ready: screen is unusable before then.
    screen.on('display-metrics-changed', () => {
      if (win !== null && !win.isDestroyed()) win.setBounds(workBounds())
    })
  })
  app.on('window-all-closed', () => app.quit())
}
