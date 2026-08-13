import { chromium } from 'playwright-core'
const BASE = 'http://localhost:3000'
const TH1 = '90000000-0000-0000-0000-000000000001' // fil admin↔tenant1 (Fuite cuisine)
const browser = await chromium.launch({ channel: 'msedge', headless: true })

async function login(p, email) {
  await p.goto(BASE + '/login', { waitUntil: 'load' })
  await p.fill('#email', email)
  await p.fill('#password', 'password123')
  await Promise.all([
    p.waitForURL((u) => !new URL(u).pathname.startsWith('/login'), { timeout: 30000 }),
    p.click('button[type=submit]'),
  ])
}
async function shot(p, path, name) {
  await p.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {})
  await p.waitForTimeout(1600)
  await p.screenshot({ path: `screenshots/${name}.png`, fullPage: true })
  console.log('✓', name)
}

// Admin : liste + fil
const a = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const pa = await a.newPage()
await login(pa, 'admin@regie.test')
await shot(pa, '/admin/messages', '23-admin-messages-liste')
await shot(pa, `/admin/messages/${TH1}`, '24-admin-thread')
await a.close()

// Locataire : ouvre le fil et répond
const t = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const pt = await t.newPage()
await login(pt, 'tenant1@regie.test')
await pt.goto(BASE + `/locataire/messages/${TH1}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await pt.waitForTimeout(1200)
await pt.fill('textarea', 'Parfait, merci beaucoup ! Je serai présent demain matin.')
await pt.getByRole('button', { name: 'Envoyer' }).click()
await pt.waitForTimeout(2500)
await pt.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {})
await pt.screenshot({ path: 'screenshots/25-locataire-thread.png', fullPage: true })
console.log('✓ 25-locataire-thread')
await t.close()

await browser.close()
