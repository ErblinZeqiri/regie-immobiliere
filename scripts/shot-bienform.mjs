import { chromium } from 'playwright-core'
const BASE = 'http://localhost:3000'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.goto(BASE + '/login', { waitUntil: 'load' })
await page.fill('#email', 'admin@regie.test')
await page.fill('#password', 'password123')
await Promise.all([
  page.waitForURL((u) => !new URL(u).pathname.startsWith('/login'), { timeout: 30000 }),
  page.click('button[type=submit]'),
])
await page.goto(BASE + '/admin/biens/nouveau', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {})
await page.waitForTimeout(1500)
await page.screenshot({ path: 'screenshots/13-bien-form-defaut.png', fullPage: true })
console.log('✓ 13 (défaut : appartement, pièces+étage visibles)')

// Ouvrir le select Type
await page.click('#type')
await page.waitForTimeout(600)
await page.screenshot({ path: 'screenshots/14-bien-form-select-ouvert.png' })
console.log('✓ 14 (dropdown ouvert, options stylées)')

// Choisir Terrain
await page.getByText('Terrain', { exact: true }).click()
await page.waitForTimeout(600)
await page.screenshot({ path: 'screenshots/15-bien-form-terrain.png', fullPage: true })
console.log('✓ 15 (terrain : pièces+étage masqués)')

await browser.close()
