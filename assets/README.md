# VOID App Icons

Place your icon files here for Electron and PWA builds.

## Required Files

### Electron (desktop)
- `icon.png`  — 512×512 PNG (used for Linux + fallback)
- `icon.ico`  — Windows multi-size ICO (256×256, 128×128, 64×64, 32×32, 16×16)
- `icon.icns` — macOS ICNS (1024×1024 down to 16×16)
- `tray.png`  — 16×16 or 22×22 PNG for system tray (transparent background)

### PWA (mobile install)
Place these in `server/public/icons/`:
- `icon-72.png`
- `icon-96.png`
- `icon-128.png`
- `icon-144.png`
- `icon-152.png`
- `icon-192.png`
- `icon-384.png`
- `icon-512.png`

## Quick Icon Generation

If you have a single 1024×1024 source PNG, you can generate all sizes using:

```bash
# Install: npm install -g sharp-cli
sharp -i source-1024.png -o server/public/icons/icon-72.png  resize 72
sharp -i source-1024.png -o server/public/icons/icon-96.png  resize 96
sharp -i source-1024.png -o server/public/icons/icon-128.png resize 128
sharp -i source-1024.png -o server/public/icons/icon-144.png resize 144
sharp -i source-1024.png -o server/public/icons/icon-152.png resize 152
sharp -i source-1024.png -o server/public/icons/icon-192.png resize 192
sharp -i source-1024.png -o server/public/icons/icon-384.png resize 384
sharp -i source-1024.png -o server/public/icons/icon-512.png resize 512
```

Or use https://realfavicongenerator.net with your source image.

## VOID Design Reference

- Background: `#07070f` (deep space black)
- Primary: `#00e5ff` (neon cyan)
- Secondary: `#7b2fff` (electric purple)
- Logo mark: ⬡ hexagon glyph
