/**
 * Utility pro práci s daty projektů a agregátů.
 */

/**
 * Vrátí souhrn projektů pro kraj z předpočítaných agregátů.
 */
export function getKrajProjektySummary(agregaty, krajName) {
  return agregaty.projekty_po_krajich?.[krajName] || null
}

/**
 * Vrátí top-N poskytovatelů pro kraj podle nákladů.
 */
export function topPoskytovatele(agregaty, krajName, n = 5) {
  const data = agregaty.projekty_po_krajich?.[krajName]?.po_poskytovatelich
  if (!data) return []
  return Object.entries(data)
    .map(([name, { pocet, naklady }]) => ({ name, pocet, naklady }))
    .sort((a, b) => b.naklady - a.naklady)
    .slice(0, n)
}

/**
 * Vrátí top-N FORD skupin pro kraj podle nákladů.
 */
export function topFordSkupiny(agregaty, krajName, n = 10) {
  const data = agregaty.projekty_po_krajich?.[krajName]?.po_ford_skupina
  if (!data) return []
  return Object.entries(data)
    .map(([name, { pocet, naklady }]) => ({ name, pocet, naklady }))
    .sort((a, b) => b.naklady - a.naklady)
    .slice(0, n)
}

/**
 * Vrátí trendy projektů v kraji po letech.
 */
export function projektyTrend(agregaty, krajName) {
  const data = agregaty.projekty_po_krajich?.[krajName]?.po_letech
  if (!data) return []
  return Object.entries(data)
    .map(([year, { pocet, naklady }]) => ({ year, pocet, naklady }))
    .sort((a, b) => a.year.localeCompare(b.year))
}

/**
 * Vrátí sílu spolupráce mezi kraji (z agregátů).
 * Vrací pole { kraj_a, kraj_b, spolecne_projekty }.
 */
export function getSpolupraceMatrix(agregaty) {
  return agregaty.spoluprace_mezi_kraji || []
}

/**
 * Vrátí spolupráce jednoho kraje (seřazeno sestupně).
 */
export function getKrajSpoluprace(agregaty, krajName) {
  const all = getSpolupraceMatrix(agregaty)
  return all
    .filter(s => s.kraj_a === krajName || s.kraj_b === krajName)
    .map(s => ({
      partner: s.kraj_a === krajName ? s.kraj_b : s.kraj_a,
      spolecne_projekty: s.spolecne_projekty,
    }))
    .sort((a, b) => b.spolecne_projekty - a.spolecne_projekty)
}

/**
 * Vrátí subjekty VaV pro kraj z agregátů.
 */
export function getKrajSubjekty(agregaty, krajName) {
  return agregaty.subjekty_po_krajich?.[krajName] || null
}

/**
 * Chord diagram data: matice spolupráce pro D3.
 * Vrací { names: string[], matrix: number[][] }
 */
export function spolupraceChordData(agregaty, krajeKodovnik) {
  const names = krajeKodovnik.kraje.map(k => k.nazev)
  const idx = {}
  names.forEach((name, i) => { idx[name] = i })

  const matrix = names.map(() => names.map(() => 0))

  for (const s of getSpolupraceMatrix(agregaty)) {
    const i = idx[s.kraj_a]
    const j = idx[s.kraj_b]
    if (i != null && j != null) {
      matrix[i][j] = s.spolecne_projekty
      matrix[j][i] = s.spolecne_projekty
    }
  }

  return { names, matrix }
}
