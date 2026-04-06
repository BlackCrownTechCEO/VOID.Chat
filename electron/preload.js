// ═══════════════════════════════════════════════════════
//  electron/preload.js — VOID Electron preload
//  Runs in renderer context before page load.
//  contextBridge can expose safe APIs here if needed.
// ═══════════════════════════════════════════════════════

const { contextBridge } = require('electron')

// Expose Electron platform info to the web app
contextBridge.exposeInMainWorld('__VOID_DESKTOP__', {
    platform: process.platform,   // 'win32' | 'darwin' | 'linux'
    version:  process.versions.electron
})
