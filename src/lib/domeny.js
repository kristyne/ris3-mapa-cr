/**
 * Práce s doménami specializace a Jaccard podobností.
 */

/**
 * Vrátí domény kraje jako pole názvů.
 */
export function getKrajDomeny(domenyKraje, krajName) {
  const kraj = domenyKraje.kraje?.[krajName]
  if (!kraj?.domeny) return []
  return kraj.domeny.map(d => d.nazev)
}

/**
 * Vrátí kompletní domény kraje (s popisem a NACE).
 */
export function getKrajDomenyFull(domenyKraje, krajName) {
  return domenyKraje.kraje?.[krajName]?.domeny || []
}

/**
 * Vrátí emerging domény kraje.
 */
export function getKrajEmerging(domenyKraje, krajName) {
  return domenyKraje.kraje?.[krajName]?.emerging || []
}

/**
 * Vrátí všechny CZ-NACE kódy kraje (z domén).
 */
export function getKrajNaceCodes(domenyKraje, krajName) {
  const domeny = getKrajDomenyFull(domenyKraje, krajName)
  const codes = new Set()
  for (const d of domeny) {
    if (d.cz_nace) d.cz_nace.forEach(c => codes.add(c))
  }
  return codes
}

/**
 * Jaccard index podobnosti dvou krajů na základě CZ-NACE kódů.
 * J(A,B) = |A ∩ B| / |A ∪ B|
 * Vrací 0-1 (0 = žádný průnik, 1 = identické).
 */
export function jaccardNace(domenyKraje, krajA, krajB) {
  const setA = getKrajNaceCodes(domenyKraje, krajA)
  const setB = getKrajNaceCodes(domenyKraje, krajB)

  if (setA.size === 0 && setB.size === 0) return 0

  let intersection = 0
  for (const code of setA) {
    if (setB.has(code)) intersection++
  }

  const union = new Set([...setA, ...setB]).size
  return union === 0 ? 0 : intersection / union
}

/**
 * Matice Jaccard podobnosti pro všechny páry krajů.
 * Vrátí objekt { krajNames: string[], matrix: number[][] }
 */
export function jaccardMatrix(domenyKraje, krajeKodovnik) {
  const names = krajeKodovnik.kraje.map(k => k.nazev)
  const matrix = names.map(a =>
    names.map(b => jaccardNace(domenyKraje, a, b))
  )
  return { krajNames: names, matrix }
}

/**
 * Vrátí top-N nejpodobnějších krajů k danému kraji.
 */
export function mostSimilar(domenyKraje, krajeKodovnik, krajName, n = 5) {
  const names = krajeKodovnik.kraje.map(k => k.nazev)
  return names
    .filter(name => name !== krajName)
    .map(name => ({
      nazev: name,
      jaccard: jaccardNace(domenyKraje, krajName, name),
    }))
    .sort((a, b) => b.jaccard - a.jaccard)
    .slice(0, n)
}

/**
 * Přehledová statistika domén — kolik krajů má daný NACE kód.
 * Vrátí pole { nace, count, kraje[] } seřazené od nejčastějšího.
 */
export function naceFrequency(domenyKraje, krajeKodovnik) {
  const freq = {}
  for (const k of krajeKodovnik.kraje) {
    const codes = getKrajNaceCodes(domenyKraje, k.nazev)
    for (const code of codes) {
      if (!freq[code]) freq[code] = { nace: code, count: 0, kraje: [] }
      freq[code].count++
      freq[code].kraje.push(k.nazev)
    }
  }
  return Object.values(freq).sort((a, b) => b.count - a.count)
}
