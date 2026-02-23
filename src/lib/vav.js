/**
 * Výpočty VaV statistik — podíly, intenzita, per capita, trendy.
 *
 * csuVav.tabulky je POLE objektů:
 *   [0] Pracoviště VaV (počet)
 *   [1] Pracovníci VaV FTE
 *   [2] Výdaje na VaV celkem (mil. Kč)
 * Každý má .kraje = { "ČR celkem": {rok: val}, "Hl. m. Praha": {rok: val}, ... }
 */

/** Najde tabulku v poli tabulek podle podřetězce v názvu */
export function findTable(csuVav, nameFragment) {
  return csuVav.tabulky.find(t => t.nazev.includes(nameFragment))
}

/** Vrátí tabulku výdajů na VaV */
export function getVydajeTable(csuVav) {
  return findTable(csuVav, 'Výdaje')
}

/** Vrátí tabulku pracovníků FTE */
export function getPracovniciTable(csuVav) {
  return findTable(csuVav, 'Pracovníci')
}

/** Vrátí tabulku pracovišť */
export function getPracovisteTable(csuVav) {
  return findTable(csuVav, 'Pracoviště')
}

/**
 * Podíl kraje na národním celku v daném roce.
 * Vrátí číslo 0-1 (nebo null pokud data chybí).
 */
export function krajShare(table, krajName, year) {
  const krajVal = table?.kraje?.[krajName]?.[year]
  const crVal = table?.kraje?.['ČR celkem']?.[year]
  if (krajVal == null || crVal == null || crVal === 0) return null
  return krajVal / crVal
}

/**
 * VaV intenzita = výdaje na VaV (mil. Kč) / HDP (mil. Kč)
 */
export function vavIntenzita(csuVav, hdpPopulace, krajName, year) {
  const vydaje = getVydajeTable(csuVav)?.kraje?.[krajName]?.[year]
  const hdp = hdpPopulace?.kraje?.[krajName]?.hdp_mil_kc?.[year]
  if (vydaje == null || hdp == null || hdp === 0) return null
  return vydaje / hdp
}

/**
 * VaV výdaje na obyvatele (Kč) = výdaje (mil. Kč) * 1e6 / populace
 */
export function vavPerCapita(csuVav, hdpPopulace, krajName, year) {
  const vydaje = getVydajeTable(csuVav)?.kraje?.[krajName]?.[year]
  const pop = hdpPopulace?.kraje?.[krajName]?.populace?.[year]
  if (vydaje == null || pop == null || pop === 0) return null
  return (vydaje * 1_000_000) / pop
}

/**
 * FTE pracovníci na 1000 obyvatel
 */
export function ftePerThousand(csuVav, hdpPopulace, krajName, year) {
  const fte = getPracovniciTable(csuVav)?.kraje?.[krajName]?.[year]
  const pop = hdpPopulace?.kraje?.[krajName]?.populace?.[year]
  if (fte == null || pop == null || pop === 0) return null
  return (fte / pop) * 1000
}

/**
 * Trendy podílu kraje na národním celku pro vybranou tabulku.
 * Vrátí pole {year, share} pro všechny dostupné roky.
 */
export function shareTrend(table, krajName) {
  if (!table?.kraje?.[krajName]) return []
  const years = Object.keys(table.kraje[krajName]).sort()
  return years.map(year => ({
    year,
    share: krajShare(table, krajName, year),
  })).filter(d => d.share != null)
}

/**
 * Absolutní hodnoty pro kraj ve vybrané tabulce.
 * Vrátí pole {year, value}.
 */
export function valueTrend(table, krajName) {
  if (!table?.kraje?.[krajName]) return []
  const years = Object.keys(table.kraje[krajName]).sort()
  return years.map(year => ({
    year,
    value: table.kraje[krajName][year],
  })).filter(d => d.value != null)
}

/**
 * Vrátí souhrn VaV statistik pro kraj v daném roce.
 */
export function krajVavSummary(csuVav, hdpPopulace, krajName, year) {
  const vydajeTab = getVydajeTable(csuVav)
  const pracovniciTab = getPracovniciTable(csuVav)
  const pracovisteTab = getPracovisteTable(csuVav)

  return {
    pracoviste: pracovisteTab?.kraje?.[krajName]?.[year] ?? null,
    pracovnici_fte: pracovniciTab?.kraje?.[krajName]?.[year] ?? null,
    vydaje_mil_kc: vydajeTab?.kraje?.[krajName]?.[year] ?? null,
    podil_vydaje: krajShare(vydajeTab, krajName, year),
    podil_fte: krajShare(pracovniciTab, krajName, year),
    intenzita: vavIntenzita(csuVav, hdpPopulace, krajName, year),
    per_capita_kc: vavPerCapita(csuVav, hdpPopulace, krajName, year),
    fte_na_1000: ftePerThousand(csuVav, hdpPopulace, krajName, year),
    populace: hdpPopulace?.kraje?.[krajName]?.populace?.[year] ?? null,
    hdp_mil_kc: hdpPopulace?.kraje?.[krajName]?.hdp_mil_kc?.[year] ?? null,
  }
}

/**
 * Vrátí přehled VaV statistik pro všechny kraje v daném roce.
 * Seřazeno podle výdajů sestupně.
 */
export function allKrajeVavSummary(csuVav, hdpPopulace, krajeKodovnik, year) {
  return krajeKodovnik.kraje
    .map(k => ({
      nazev: k.nazev,
      kod_nuts: k.kod_nuts,
      zkratka: k.zkratka,
      ...krajVavSummary(csuVav, hdpPopulace, k.nazev, year),
    }))
    .sort((a, b) => (b.vydaje_mil_kc ?? 0) - (a.vydaje_mil_kc ?? 0))
}
