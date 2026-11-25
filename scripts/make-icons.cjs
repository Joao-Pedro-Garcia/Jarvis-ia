// Gera os ícones PNG do PWA a partir de public/icons/icon.svg (usa Playwright/Chromium).
// Uso: node scripts/make-icons.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'public', 'icons');
const svg = fs.readFileSync(path.join(dir, 'icon.svg'), 'utf8');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const shots = [['icon-192.png', 192, 0], ['icon-512.png', 512, 0], ['maskable-512.png', 512, 0.12], ['apple-touch-icon.png', 180, 0]];
  for (const [name, size, pad] of shots) {
    await page.setViewportSize({ width: size, height: size });
    // maskable: fundo cheio + área segura (o Android recorta em círculo/forma do tema)
    const inner = Math.round(size * (1 - pad * 2));
    await page.setContent(`<html><body style="margin:0;background:#03070d;display:grid;place-items:center;width:${size}px;height:${size}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</body></html>`);
    await page.screenshot({ path: path.join(dir, name), omitBackground: false });
  }
  await browser.close();
  console.log('Ícones gerados em public/icons/');
})();
