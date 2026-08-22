import 'server-only'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib'
import type { AgencySettings } from '@/lib/agency'

/* ------------------------- Palette (monochrome) --------------------------- */
const INK = rgb(0.11, 0.11, 0.12)
const GREY = rgb(0.4, 0.4, 0.42)
const HAIR = rgb(0.72, 0.72, 0.73) // filets fins
const HAIR2 = rgb(0.85, 0.85, 0.86)

const PAGE = { w: 595.28, h: 841.89 }
const M = 56
const RIGHT = PAGE.w - M

// Uniquement des espaces ASCII (0x20) — WinAnsi n'encode pas les espaces fines.
const eur = (v: number | string) =>
  `${Number(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ').replace('.', ',')} €`

function fmtDate(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  return m ? `${m[3]}.${m[2]}.${m[1]}` : (iso ?? '')
}

interface Fonts {
  serif: PDFFont
  serifBold: PDFFont
  sans: PDFFont
  sansBold: PDFFont
}

/* ------------------------------ Primitives -------------------------------- */
function text(p: PDFPage, s: string, x: number, y: number, size: number, f: PDFFont, c: RGB = INK) {
  p.drawText(s, { x, y, size, font: f, color: c })
}
function rightText(p: PDFPage, s: string, xR: number, y: number, size: number, f: PDFFont, c: RGB = INK) {
  p.drawText(s, { x: xR - f.widthOfTextAtSize(s, size), y, size, font: f, color: c })
}
function rule(p: PDFPage, x1: number, y: number, x2: number, c: RGB = HAIR, t = 0.75) {
  p.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: t, color: c })
}
/** Étiquette en capitales espacées (tracking simulé). */
function label(p: PDFPage, s: string, x: number, y: number, f: Fonts, c: RGB = GREY, size = 7) {
  text(p, s.toUpperCase().split('').join(' '), x, y, size, f.sansBold, c)
}

async function fonts(pdf: PDFDocument): Promise<Fonts> {
  return {
    serif: await pdf.embedFont(StandardFonts.TimesRoman),
    serifBold: await pdf.embedFont(StandardFonts.TimesRomanBold),
    sans: await pdf.embedFont(StandardFonts.Helvetica),
    sansBold: await pdf.embedFont(StandardFonts.HelveticaBold),
  }
}

export interface PropertyInfo {
  reference: string | null
  title: string
  address: string | null
  city: string | null
}

/* ------------------------------ En-tête / pied ---------------------------- */
function header(page: PDFPage, f: Fonts, a: AgencySettings, docType: string, docNo: string): number {
  const top = PAGE.h - 64
  text(page, a.legalName, M, top, 15, f.serifBold, INK)
  const place = [a.city, a.country].filter(Boolean).join(', ')
  text(page, ['Gérance immobilière', place].filter(Boolean).join(' — '), M, top - 15, 8, f.sans, GREY)

  rightText(page, docType.toUpperCase().split('').join(' '), RIGHT, top, 10.5, f.sansBold, INK)
  rightText(page, docNo, RIGHT, top - 15, 8.5, f.sans, GREY)

  const ruleY = top - 30
  rule(page, M, ruleY, RIGHT, HAIR, 1)
  return ruleY - 48 // espace généreux après l'en-tête
}

function footer(page: PDFPage, f: Fonts, a: AgencySettings, generatedDate: string, docLegal: string) {
  const y = 78 // pied bien en bas de page
  rule(page, M, y, RIGHT, HAIR2, 0.75)
  const identity = [a.legalName, [a.address, a.city, a.country].filter(Boolean).join(', '), a.email, a.phone]
    .filter(Boolean)
    .join(' · ')
  text(page, identity, M, y - 15, 7.5, f.sans, GREY)
  rightText(page, `Émis le ${fmtDate(generatedDate)}`, RIGHT, y - 15, 7.5, f.sans, GREY)
  const legalLine = [docLegal, a.legalMentions].filter(Boolean).join('   —   ')
  text(page, legalLine, M, y - 28, 7, f.sans, GREY)
}

function infoBlock(
  page: PDFPage,
  f: Fonts,
  y: number,
  left: { label: string; lines: string[] },
  right: { label: string; lines: string[] },
): number {
  const colR = M + 268
  label(page, left.label, M, y, f)
  label(page, right.label, colR, y, f)
  let ly = y - 17
  const n = Math.max(left.lines.length, right.lines.length)
  for (let i = 0; i < n; i++) {
    if (left.lines[i]) text(page, left.lines[i], M, ly, i === 0 ? 10.5 : 9, i === 0 ? f.sansBold : f.sans, i === 0 ? INK : GREY)
    if (right.lines[i]) text(page, right.lines[i], colR, ly, i === 0 ? 10.5 : 9, i === 0 ? f.sansBold : f.sans, i === 0 ? INK : GREY)
    ly -= i === 0 ? 16 : 13
  }
  return ly - 30 // espace avant le tableau
}

function propLines(p: PropertyInfo | null): string[] {
  const title = `${p?.reference ? p.reference + ' — ' : ''}${p?.title ?? '—'}`.trim()
  const addr = [p?.address, p?.city].filter(Boolean).join(', ')
  return addr ? [title, addr] : [title]
}

/** En-tête de tableau à filets fins. */
function tableHead(page: PDFPage, f: Fonts, y: number, perX: number): number {
  label(page, 'Désignation', M, y, f)
  label(page, 'Période', perX, y, f)
  rightText(page, 'MONTANT'.split('').join(' '), RIGHT, y, 7, f.sansBold, GREY)
  rule(page, M, y - 8, RIGHT, HAIR, 1)
  return y - 26
}
function tableRow(page: PDFPage, f: Fonts, y: number, desig: string, per: string, amount: number, perX: number) {
  text(page, desig, M, y, 10, f.sans, INK)
  text(page, per, perX, y, 10, f.sans, GREY)
  rightText(page, eur(amount), RIGHT, y, 10, f.sans, INK)
  rule(page, M, y - 9, RIGHT, HAIR2, 0.5)
  return y - 24
}

/** Total intégré, aligné à droite (label + montant + filet). */
function total(page: PDFPage, f: Fonts, y: number, lbl: string, amount: number): number {
  label(page, lbl, RIGHT - 210, y, f)
  rightText(page, eur(amount), RIGHT, y - 5, 16, f.sansBold, INK)
  rule(page, RIGHT - 210, y - 16, RIGHT, HAIR, 1)
  return y - 56
}

/* ================================ AVIS ==================================== */
export interface AvisData {
  tenantName: string
  property: PropertyInfo | null
  periodLabel: string
  chargeLabel: string
  dueDate: string
  amount: number
  paymentRef: string
  generatedDate: string
  agency: AgencySettings
}

export async function buildAvisPdf(d: AvisData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([PAGE.w, PAGE.h])
  const f = await fonts(pdf)
  const perX = M + 300

  let y = header(page, f, d.agency, 'Avis de paiement', `Réf. ${d.paymentRef}`)

  text(page, `Avis de paiement — ${d.periodLabel}`, M, y, 16, f.serifBold, INK)
  y -= 40

  y = infoBlock(
    page,
    f,
    y,
    { label: 'Locataire', lines: [d.tenantName] },
    { label: 'Bien concerné', lines: propLines(d.property) },
  )

  y = tableHead(page, f, y, perX)
  y = tableRow(page, f, y, d.chargeLabel, d.periodLabel, d.amount, perX)
  y -= 14
  y = total(page, f, y, 'Montant dû', d.amount)

  label(page, 'Modalités de paiement', M, y, f, INK)
  y -= 26
  label(page, 'Référence à rappeler dans le virement', M, y, f)
  y -= 24
  text(page, d.paymentRef, M, y, 17, f.sansBold, INK)
  y -= 34
  const modal: [string, string][] = [
    ['Montant', eur(d.amount)],
    ['À régler avant le', fmtDate(d.dueDate)],
    ['Bénéficiaire', d.agency.accountHolder || d.agency.legalName],
    ['IBAN', d.agency.iban || 'communiqué par la régie'],
  ]
  for (const [k, v] of modal) {
    text(page, k, M, y, 9.5, f.sans, GREY)
    text(page, v, M + 140, y, 9.5, f.sansBold, INK)
    y -= 17
  }
  y -= 14
  text(page, 'La référence doit impérativement figurer dans le libellé du virement : elle permet', M, y, 9, f.sans, GREY)
  y -= 13
  text(page, 'le rapprochement automatique de votre paiement.', M, y, 9, f.sans, GREY)

  footer(page, f, d.agency, d.generatedDate, "Ce document est un avis de paiement et ne constitue pas une quittance.")
  return pdf.save()
}

/* ============================== QUITTANCE ================================= */
export interface QuittanceData {
  tenantName: string
  property: PropertyInfo | null
  amount: number
  paymentDate: string
  method: string | null
  reference: string | null
  quittanceNo: string
  periodLabel: string
  covered: { label: string; amount: number }[]
  generatedDate: string
  agency: AgencySettings
}

const METHOD_LABELS: Record<string, string> = {
  bank_transfer: 'Virement bancaire',
  cash: 'Espèces',
  card: 'Carte',
  other: 'Autre',
}

export async function buildQuittancePdf(d: QuittanceData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([PAGE.w, PAGE.h])
  const f = await fonts(pdf)
  const perX = M + 300

  let y = header(page, f, d.agency, 'Quittance', `N° ${d.quittanceNo}`)

  text(page, `Quittance de loyer — ${d.periodLabel}`, M, y, 16, f.serifBold, INK)
  y -= 16
  text(page, `Acquittée le ${fmtDate(d.paymentDate)}`, M, y, 9.5, f.sans, GREY)
  y -= 40

  y = infoBlock(
    page,
    f,
    y,
    { label: 'Locataire', lines: [d.tenantName] },
    { label: 'Bien concerné', lines: propLines(d.property) },
  )

  const rows = d.covered.length > 0 ? d.covered : [{ label: 'Loyer', amount: d.amount }]
  y = tableHead(page, f, y, perX)
  for (const c of rows) y = tableRow(page, f, y, c.label, d.periodLabel, c.amount, perX)
  y -= 14
  y = total(page, f, y, 'Montant reçu', d.amount)

  const det: [string, string][] = [
    ['Date du paiement', fmtDate(d.paymentDate)],
    ['Moyen de paiement', METHOD_LABELS[d.method ?? 'other'] ?? '—'],
    ...(d.reference ? ([['Référence', d.reference]] as [string, string][]) : []),
  ]
  for (const [k, v] of det) {
    text(page, k, M, y, 9.5, f.sans, GREY)
    text(page, v, M + 140, y, 9.5, f.sansBold, INK)
    y -= 17
  }
  y -= 28

  rule(page, M, y, RIGHT, HAIR2, 0.5)
  y -= 20
  text(page, `${d.agency.legalName} reconnaît avoir reçu de ${d.tenantName} la somme de ${eur(d.amount)}`, M, y, 10, f.sans, INK)
  y -= 15
  text(page, `au titre du loyer et des charges de la période ${d.periodLabel}, et lui en donne quittance.`, M, y, 10, f.sans, INK)

  footer(page, f, d.agency, d.generatedDate, "Quittance délivrée sous réserve d'encaissement. Elle annule les reçus antérieurs pour la même période.")
  return pdf.save()
}
