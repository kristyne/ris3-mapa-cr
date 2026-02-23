/**
 * Formátovací funkce pro české locale.
 */

const csFmt = new Intl.NumberFormat('cs-CZ')
const csPctFmt = new Intl.NumberFormat('cs-CZ', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })
const csCurrFmt = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 })

/** Formátuje číslo s tisícovými oddělovači: 1 234 567 */
export function fmtNum(n) {
  if (n == null) return '–'
  return csFmt.format(n)
}

/** Formátuje procento z 0-1: "12,3 %" */
export function fmtPct(n) {
  if (n == null) return '–'
  return csPctFmt.format(n)
}

/** Formátuje měnu/velké číslo bez des. míst: "1 234 567" */
export function fmtCurr(n) {
  if (n == null) return '–'
  return csCurrFmt.format(n)
}

/** Formátuje mil. Kč: "1 234 mil. Kč" */
export function fmtMilKc(n) {
  if (n == null) return '–'
  return `${csCurrFmt.format(n)} mil. Kč`
}

/** Formátuje tis. Kč → mil. Kč (zaokrouhleno): "82,4 mil. Kč" */
export function fmtTisToMilKc(tisKc) {
  if (tisKc == null) return '–'
  const mil = tisKc / 1000
  if (mil >= 100) return `${Math.round(mil).toLocaleString('cs-CZ')} mil. Kč`
  return `${mil.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mil. Kč`
}

/** Formátuje VaV intenzitu (poměr): "1,85 %" */
export function fmtIntenzita(n) {
  if (n == null) return '–'
  return `${(n * 100).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`
}

/** Formátuje Kč na obyvatele: "12 345 Kč/ob." */
export function fmtPerCapita(n) {
  if (n == null) return '–'
  return `${csCurrFmt.format(Math.round(n))} Kč/ob.`
}
