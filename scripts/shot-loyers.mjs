import { chromium } from 'playwright-core'
const BASE = 'http://localhost:3000'
const b = await chromium.launch({ channel: 'msedge', headless: true })
const c = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const p = await c.newPage()
await p.goto(BASE + '/login', { waitUntil: 'load' })
await p.fill('#email', 'admin@regie.test'); await p.fill('#password', 'password123')
await Promise.all([p.waitForURL(u => !new URL(u).pathname.startsWith('/login'), { timeout: 30000 }), p.click('button[type=submit]')])
await p.goto(BASE + '/admin/loyers', { waitUntil: 'domcontentloaded', timeout: 60000 })
await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {})
await p.waitForTimeout(1800)
await p.screenshot({ path: 'screenshots/26-admin-loyers.png', fullPage: true })
console.log('ok'); await b.close()
