// ═══════════════════════════════════════════════════════
//  electron/main.js — VOID Desktop App
// ═══════════════════════════════════════════════════════

const { app, BrowserWindow, shell, Menu, Tray, nativeImage } = require('electron')
const path   = require('path')
const { spawn } = require('child_process')

let win
let tray
let serverProcess

// ── Start the Node.js server ──────────────────────────
function startServer() {
    const serverPath = path.join(__dirname, '..', 'server', 'index.js')
    serverProcess = spawn(process.execPath, [serverPath], {
        env:   { ...process.env, PORT: '3500' },
        cwd:   path.join(__dirname, '..', 'server'),
        stdio: 'pipe'
    })
    serverProcess.stdout.on('data', d => console.log('[VOID server]', d.toString().trim()))
    serverProcess.stderr.on('data', d => console.error('[VOID server]', d.toString().trim()))
    serverProcess.on('error', err => console.error('[VOID server] failed to start:', err))
}

// ── Create main window ────────────────────────────────
function createWindow() {
    win = new BrowserWindow({
        width:           1280,
        height:          820,
        minWidth:        800,
        minHeight:       600,
        backgroundColor: '#07070f',
        titleBarStyle:   process.platform === 'darwin' ? 'hiddenInset' : 'default',
        icon:            path.join(__dirname, '..', 'assets', 'icon.png'),
        webPreferences:  {
            nodeIntegration:  false,
            contextIsolation: true,
            preload:          path.join(__dirname, 'preload.js')
        }
    })

    // Give server 1.5s to boot, then load
    setTimeout(() => {
        win.loadURL('http://localhost:3500').catch(() => {
            // Retry once if server isn't ready
            setTimeout(() => win.loadURL('http://localhost:3500'), 1500)
        })
    }, 1500)

    // Open external links in browser, not Electron
    win.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url)
        return { action: 'deny' }
    })

    win.on('closed', () => { win = null })
}

// ── System tray ───────────────────────────────────────
function createTray() {
    const iconPath = path.join(__dirname, '..', 'assets', 'tray.png')
    try {
        tray = new Tray(iconPath)
    } catch {
        tray = new Tray(nativeImage.createEmpty())
    }
    tray.setToolTip('VOID — BlackCrownTech')
    tray.setContextMenu(Menu.buildFromTemplate([
        { label: 'Open VOID', click: () => { if (win) win.show(); else createWindow() } },
        { type: 'separator' },
        { label: 'Quit', click: () => app.quit() }
    ]))
    tray.on('double-click', () => { if (win) win.show() })
}

// ── App menu ──────────────────────────────────────────
function buildMenu() {
    const template = [
        {
            label: 'VOID',
            submenu: [
                { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => win?.webContents.reload() },
                { label: 'Force Reload', accelerator: 'CmdOrCtrl+Shift+R', click: () => win?.webContents.reloadIgnoringCache() },
                { type: 'separator' },
                { label: 'Quit', accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q', click: () => app.quit() }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
                { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
            ]
        },
        {
            label: 'View',
            submenu: [
                { role: 'zoomIn', accelerator: 'CmdOrCtrl+=' },
                { role: 'zoomOut' },
                { role: 'resetZoom' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        }
    ]
    Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ── Lifecycle ─────────────────────────────────────────
app.whenReady().then(() => {
    startServer()
    buildMenu()
    createWindow()
    createTray()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
    if (serverProcess) {
        serverProcess.kill()
        serverProcess = null
    }
})
