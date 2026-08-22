import 'server-only'

/**
 * Templates email — sobres, institutionnels, monochromes (noir / gris).
 * HTML avec styles inline (compatibilité clients mail).
 */

const INK = '#1a1a1a'
const GREY = '#5c574f'
const HAIR = '#e8e5e0'
const BG = '#f7f5f2'

function esc(s: string): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
}

export interface EmailRow {
  label: string
  value: string
}

/** Rendu générique d'un email transactionnel. */
export function renderEmail(opts: {
  agencyName: string
  preheader?: string
  heading: string
  intro?: string
  rows?: EmailRow[]
  quote?: string
  cta?: { label: string; href: string }
  outro?: string
}): string {
  const rowsHtml = (opts.rows ?? [])
    .map(
      (r) => `
      <tr>
        <td style="padding:6px 0;color:${GREY};font-size:13px;">${esc(r.label)}</td>
        <td style="padding:6px 0;color:${INK};font-size:13px;font-weight:600;text-align:right;">${esc(r.value)}</td>
      </tr>`,
    )
    .join('')

  const quoteHtml = opts.quote
    ? `<div style="margin:16px 0;padding:12px 16px;border-left:2px solid ${HAIR};color:${GREY};font-size:13px;line-height:1.5;">${esc(opts.quote)}</div>`
    : ''

  const ctaHtml = opts.cta
    ? `<div style="margin:24px 0 4px;">
         <a href="${esc(opts.cta.href)}" style="display:inline-block;background:${INK};color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:10px 18px;border-radius:6px;">${esc(opts.cta.label)}</a>
       </div>`
    : ''

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BG};">
  ${opts.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(opts.preheader)}</div>` : ''}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid ${HAIR};border-radius:10px;">
        <tr><td style="padding:24px 28px 16px;border-bottom:1px solid ${HAIR};">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:18px;font-weight:700;color:${INK};">${esc(opts.agencyName)}</div>
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:${GREY};margin-top:2px;">Gérance immobilière — Kosovo</div>
        </td></tr>
        <tr><td style="padding:24px 28px;font-family:Arial,Helvetica,sans-serif;">
          <h1 style="margin:0 0 12px;font-size:17px;color:${INK};font-weight:600;">${esc(opts.heading)}</h1>
          ${opts.intro ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:${GREY};">${esc(opts.intro)}</p>` : ''}
          ${rowsHtml ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${HAIR};border-bottom:1px solid ${HAIR};margin:8px 0;">${rowsHtml}</table>` : ''}
          ${quoteHtml}
          ${ctaHtml}
          ${opts.outro ? `<p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:${GREY};">${esc(opts.outro)}</p>` : ''}
        </td></tr>
        <tr><td style="padding:16px 28px 24px;border-top:1px solid ${HAIR};font-family:Arial,Helvetica,sans-serif;">
          <p style="margin:0;font-size:11px;line-height:1.5;color:${GREY};">
            ${esc(opts.agencyName)} — Ferizaj, Kosovo.<br>
            Cet email vous est adressé automatiquement suite à une opération sur votre espace.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}
