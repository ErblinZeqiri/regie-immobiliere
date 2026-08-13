import { chromium } from 'playwright-core'
const BASE = 'http://localhost:3000'
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
  await p.waitForTimeout(1800)
  await p.screenshot({ path: `screenshots/${name}.png`, fullPage: true })
  console.log('✓', name)
}

// Vue admin
const a = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const pa = await a.newPage()
await login(pa, 'admin@regie.test')
await shot(pa, '/admin/signalements', '20-admin-signalements')
await a.close()

// Locataire crée un signalement avec photo
const t = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const pt = await t.newPage()
await login(pt, 'tenant1@regie.test')
await pt.goto(BASE + '/locataire/signalements', { waitUntil: 'domcontentloaded', timeout: 60000 })
await pt.waitForTimeout(1200)
await pt.fill('#title', 'Robinet qui goutte dans la salle de bain')
await pt.fill('#description', 'Le robinet du lavabo fuit en continu depuis hier.')
await pt.setInputFiles('#photos', 'screenshots/00-accueil.png')
await pt.getByRole('button', { name: 'Signaler un problème' }).click()
await pt.waitForTimeout(3000) // création + upload + enregistrement + refresh
await pt.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {})
await pt.screenshot({ path: 'screenshots/21-locataire-signalements.png', fullPage: true })
console.log('✓ 21-locataire-signalements')
await t.close()

await browser.close()
