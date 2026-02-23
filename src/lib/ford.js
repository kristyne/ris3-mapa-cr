/**
 * Mapování FORD kódů na disciplíny a skupiny.
 */

/** FORD kód (3-ciferný string) → český název disciplíny */
export function fordToName(fordCodes, code) {
  return fordCodes.ford_discipliny?.[code] || code
}

/** FORD kód → název skupiny (1xx → "Přírodní vědy") */
export function fordToGroup(fordCodes, code) {
  const prefix = String(code).charAt(0)
  return fordCodes.ford_skupiny?.[`${prefix}xx`] || 'Neznámá'
}

/** Vrátí barvu pro FORD skupinu (konzistentní paleta) */
const FORD_GROUP_COLORS = {
  '1xx': '#4e79a7', // Přírodní vědy — modrá
  '2xx': '#f28e2b', // Technické vědy — oranžová
  '3xx': '#e15759', // Lékařské — červená
  '4xx': '#76b7b2', // Zemědělské — tyrkysová
  '5xx': '#59a14f', // Sociální — zelená
  '6xx': '#edc948', // Humanitní — žlutá
}

export function fordGroupColor(code) {
  const prefix = String(code).charAt(0)
  return FORD_GROUP_COLORS[`${prefix}xx`] || '#bab0ac'
}

/**
 * Mapuje FORD kódy projektů na agregáty s názvy.
 * Vstup: pole FORD skupin z agregátů (po_ford_skupina).
 * Výstup: pole { name, pocet, naklady, color } seřazené sestupně.
 */
export function enrichFordData(fordSkupiny, fordCodes) {
  if (!fordSkupiny) return []
  return Object.entries(fordSkupiny)
    .map(([key, { pocet, naklady }]) => {
      // Klíče v agregátech jsou buď názvy (jako "Chemie") nebo kódy ("211")
      const isCode = /^\d+$/.test(key)
      const name = isCode ? fordToName(fordCodes, key) : key
      const color = isCode ? fordGroupColor(key) : '#bab0ac'
      return { name, pocet, naklady, color }
    })
    .sort((a, b) => b.naklady - a.naklady)
}
