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
const shot = async (path, name) => {
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {})
  await page.waitForTimeout(1800)
  await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true })
  console.log('✓', name)
}
await shot('/admin/proprietaires', '10-admin-proprietaires')
await shot('/admin/locataires', '11-admin-locataires')
await shot('/admin/proprietaires/nouveau', '12-admin-proprietaire-nouveau')
await browser.close()
