import { chromium } from 'playwright-core'
const BASE = 'http://localhost:3000'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.goto(BASE + '/login', { waitUntil: 'load' })
await page.fill('#email', 'ownerA@regie.test')
await page.fill('#password', 'password123')
await Promise.all([
  page.waitForURL((u) => !new URL(u).pathname.startsWith('/login'), { timeout: 30000 }),
  page.click('button[type=submit]'),
])
await page.goto(BASE + '/proprietaire', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {})
await page.waitForTimeout(2000)
await page.screenshot({ path: 'screenshots/09-proprietaire-dashboard.png', fullPage: true })
console.log('✓ 09-proprietaire-dashboard')
await browser.close()
