// Capture d'écran de toutes les interfaces (pour envoi à un designer).
// Prérequis : le serveur dev tourne sur http://localhost:3000
// Lancement : node scripts/screenshots.mjs
import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'

const BASE = 'http://localhost:3000'
const OUT = 'screenshots'
const FER002 = 'a0000000-0000-0000-0000-000000000002' // bien public (annonce)

const USERS = {
  admin: { email: 'admin@regie.test', pw: 'password123' },
  tenant: { email: 'tenant1@regie.test', pw: 'password123' },
  owner: { email: 'ownerA@regie.test', pw: 'password123' },
}

// Masque l'overlay dev de Next dans les captures.
const HIDE_DEV = 'nextjs-portal{display:none!important}'

async function shot(page, path, name) {
  await page.goto(BASE + path, { waitUntil: 'load', timeout: 30000 })
  await page.addStyleTag({ content: HIDE_DEV }).catch(() => {})
  await page.waitForTimeout(1600) // laisse charger données + images signées
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
  console.log('✓', name)
}

async function login(context, user) {
  const page = await context.newPage()
  await page.goto(BASE + '/login', { waitUntil: 'load' })
  await page.fill('#email', user.email)
  await page.fill('#password', user.pw)
  await Promise.all([
    page.waitForURL((u) => !new URL(u).pathname.startsWith('/login'), { timeout: 20000 }),
    page.click('button[type=submit]'),
  ])
  await page.waitForTimeout(1200)
  return page
}

const desktop = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }

const browser = await chromium.launch({ channel: 'msedge', headless: true })
await mkdir(OUT, { recursive: true })

// --- Public (sans connexion) ---
{
  const ctx = await browser.newContext(desktop)
  const p = await ctx.newPage()
  await shot(p, '/annonces', '01-public-annonces-liste')
  await shot(p, `/annonces/${FER002}`, '02-public-annonce-detail')
  await shot(p, '/login', '03-public-login')
  await ctx.close()
}

// --- Admin ---
{
  const ctx = await browser.newContext(desktop)
  const p = await login(ctx, USERS.admin)
  await shot(p, '/admin', '04-admin-dashboard')
  await shot(p, '/admin/biens', '05-admin-biens-liste')
  await shot(p, '/admin/biens/nouveau', '06-admin-bien-nouveau')
  await shot(p, `/admin/biens/${FER002}`, '07-admin-bien-edition')
  await ctx.close()
}

// --- Locataire ---
{
  const ctx = await browser.newContext(desktop)
  const p = await login(ctx, USERS.tenant)
  await shot(p, '/locataire', '08-locataire-dashboard')
  await ctx.close()
}

// --- Propriétaire ---
{
  const ctx = await browser.newContext(desktop)
  const p = await login(ctx, USERS.owner)
  await shot(p, '/proprietaire', '09-proprietaire-dashboard')
  await ctx.close()
}

await browser.close()
console.log('\nTerminé -> dossier screenshots/')
