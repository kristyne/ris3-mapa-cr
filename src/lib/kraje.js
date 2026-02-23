/**
 * Utility funkce pro práci s kódy a názvy krajů.
 */

/** Vytvoří lookup mapy z kraje_kodovnik.json */
export function buildKrajeLookups(kodovnik) {
  const byNuts = {}
  const byName = {}
  const byZkratka = {}

  for (const k of kodovnik.kraje) {
    byNuts[k.kod_nuts] = k
    byName[k.nazev] = k
    byZkratka[k.zkratka] = k
  }

  return { byNuts, byName, byZkratka }
}

/** Vrátí seřazený seznam krajů (bez "ČR celkem") */
export function getKrajeList(kodovnik) {
  return kodovnik.kraje.map(k => k.nazev)
}

/** NUTS kód → název kraje */
export function nutsToName(kodovnik, nuts) {
  const k = kodovnik.kraje.find(k => k.kod_nuts === nuts)
  return k?.nazev || nuts
}

/** Název kraje → NUTS kód */
export function nameToNuts(kodovnik, name) {
  const k = kodovnik.kraje.find(k => k.nazev === name)
  return k?.kod_nuts || null
}

/** Název kraje → zkratka */
export function nameToZkratka(kodovnik, name) {
  const k = kodovnik.kraje.find(k => k.nazev === name)
  return k?.zkratka || name.slice(0, 3).toUpperCase()
}
