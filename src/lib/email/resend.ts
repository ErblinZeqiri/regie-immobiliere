import 'server-only'
import { Resend } from 'resend'

const apiKey = process.env.RESEND_API_KEY
const client = apiKey ? new Resend(apiKey) : null

/** URL absolue de l'app (pour les liens des emails). */
export function appUrl(path = ''): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')
  return `${base}${path}`
}

/**
 * Envoi d'email transactionnel. Ne LÈVE JAMAIS : si la clé manque ou l'envoi
 * échoue, on log et on continue — l'action métier n'est jamais bloquée.
 * L'adresse d'expédition vient de EMAIL_FROM_ADDRESS ; le nom d'affichage peut
 * être fourni (typiquement le nom légal de la régie).
 */
export async function sendEmail(opts: {
  to: string | null | undefined | (string | null | undefined)[]
  subject: string
  html: string
  fromName?: string
}): Promise<void> {
  const recipients = (Array.isArray(opts.to) ? opts.to : [opts.to]).filter(
    (e): e is string => !!e && e.includes('@'),
  )
  if (recipients.length === 0) return

  if (!client) {
    console.warn(`[email] RESEND_API_KEY manquant — email non envoyé : "${opts.subject}"`)
    return
  }

  const addr = process.env.EMAIL_FROM_ADDRESS || 'onboarding@resend.dev'
  const from = `${opts.fromName || 'Pron Gérance'} <${addr}>`
  try {
    const { error } = await client.emails.send({
      from,
      to: Array.from(new Set(recipients)),
      subject: opts.subject,
      html: opts.html,
    })
    if (error) {
      console.error(`[email] échec envoi "${opts.subject}" (from=${from}): ${error.name ?? ''} — ${error.message ?? JSON.stringify(error)}`)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[email] exception envoi "${opts.subject}": ${msg}`)
  }
}
