import { chromium } from 'playwright-core'
const BASE = 'http://localhost:3000'
const FER002 = 'a0000000-0000-0000-0000-000000000002'
const browser = await chromium.launch({ channel: 'msedge', headless: true })

// 1. Soumet 2 candidatures via le formulaire public
const pub = await browser.newContext({ viewport: { width: 1440, height: 900 } })
async function apply(name, email, phone) {
  const p = await pub.newPage()
  await p.goto(`${BASE}/annonces/${FER002}`, { waitUntil: 'load', timeout: 60000 })
  await p.fill('#fullName', name)
  await p.fill('#email', email)
  await p.fill('#phone', phone)
  await p.click('button[type=submit]')
  await p.waitForTimeout(1500)
  await p.close()
  console.log('candidature envoyée :', name)
}
await apply('Ardit Musliu', 'ardit@example.com', '+383 44 111 222')
await apply('Vlora Berisha', 'vlora@example.com', '+41 78 333 444')
await pub.close()

// 2. Vue admin
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.goto(BASE + '/login', { waitUntil: 'load' })
await page.fill('#email', 'admin@regie.test')
await page.fill('#password', 'password123')
await Promise.all([
  page.waitForURL((u) => !new URL(u).pathname.startsWith('/login'), { timeout: 30000 }),
  page.click('button[type=submit]'),
])
await page.goto(BASE + '/admin/candidatures', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {})
await page.waitForTimeout(1800)
await page.screenshot({ path: 'screenshots/19-admin-candidatures.png', fullPage: true })
console.log('✓ 19-admin-candidatures')
await browser.close()
