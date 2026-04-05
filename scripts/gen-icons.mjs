// scripts/gen-icons.mjs — generate placeholder VOID icons (pure Node.js, no deps)
import { writeFileSync, mkdirSync } from 'fs'
import { deflateRawSync } from 'zlib'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

// VOID brand colors: bg #07070f, cyan #00e5ff, purple #7b2fff
const BG  = [0x07, 0x07, 0x0f]
const CYN = [0x00, 0xe5, 0xff]
const PRP = [0x7b, 0x2f, 0xff]

// ── CRC-32 ─────────────────────────────────────────────────────────────────
const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function u32be(n) {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]
}

function chunk(type, data) {
  const typeBytes = [...type].map(c => c.charCodeAt(0))
  const combined  = [...typeBytes, ...data]
  return [...u32be(data.length), ...combined, ...u32be(crc32(combined))]
}

// ── PNG builder ─────────────────────────────────────────────────────────────
function makePng(size) {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10]

  // IHDR
  const ihdr = [...u32be(size), ...u32be(size), 8, 2, 0, 0, 0]

  // Build raw scanlines — draw a simple hex-ish circle logo
  const half   = size / 2
  const radius = size * 0.38
  const logoR  = size * 0.18
  const raw    = []

  for (let y = 0; y < size; y++) {
    raw.push(0) // filter byte = None
    for (let x = 0; x < size; x++) {
      const dx = x - half, dy = y - half
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist <= radius + 1 && dist >= radius - size * 0.06) {
        // Outer ring — gradient cyan→purple by angle
        const angle = (Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI) // 0..1
        const r = Math.round(CYN[0] + (PRP[0] - CYN[0]) * angle)
        const g = Math.round(CYN[1] + (PRP[1] - CYN[1]) * angle)
        const b = Math.round(CYN[2] + (PRP[2] - CYN[2]) * angle)
        raw.push(r, g, b)
      } else if (dist <= logoR) {
        // Inner dot — cyan
        raw.push(...CYN)
      } else {
        // Background
        raw.push(...BG)
      }
    }
  }

  const idat = [...deflateRawSync(Buffer.from(raw))]
  const iend = []

  const bytes = [
    ...sig,
    ...chunk('IHDR', ihdr),
    ...chunk('IDAT', idat),
    ...chunk('IEND', iend),
  ]
  return Buffer.from(bytes)
}

// ── Write icons ─────────────────────────────────────────────────────────────
const pwaDir = join(root, 'server', 'public', 'icons')
mkdirSync(pwaDir, { recursive: true })

const pwaSizes = [72, 96, 128, 144, 152, 192, 384, 512]
for (const sz of pwaSizes) {
  const buf = makePng(sz)
  writeFileSync(join(pwaDir, `icon-${sz}.png`), buf)
  console.log(`✓ icons/icon-${sz}.png  (${buf.length} bytes)`)
}

// Electron assets
const assetsDir = join(root, 'assets')
mkdirSync(assetsDir, { recursive: true })
const iconBuf = makePng(512)
writeFileSync(join(assetsDir, 'icon.png'), iconBuf)
console.log(`✓ assets/icon.png`)

// tray icon (22px)
const trayBuf = makePng(22)
writeFileSync(join(assetsDir, 'tray.png'), trayBuf)
console.log(`✓ assets/tray.png`)

console.log('\nDone! Run the server and open in browser to install the PWA.')
console.log('Note: For App Store builds replace these with real branded artwork.')
