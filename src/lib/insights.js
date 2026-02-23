/**
 * Analytické výpočty pro scrollytelling insighty.
 * Generuje reálná čísla a texty z dat.
 */

import { jaccardMatrix, getKrajNaceCodes, naceFrequency } from './domeny'
import { getSpolupraceMatrix } from './projekty'
import { fmtNum, fmtPct } from './format'

/**
 * Krok 1: Analýza unikátnosti domén.
 * Kolik je celkem domén, kolik unikátních NACE kódů, které jsou nejfrekventovanější.
 */
export function analyzeStep1(domenyKraje, krajeKodovnik) {
  let totalDomeny = 0
  const allNace = new Set()
  const krajeDomenyCount = {}

  for (const k of krajeKodovnik.kraje) {
    const domeny = domenyKraje.kraje?.[k.nazev]?.domeny || []
    totalDomeny += domeny.length
    krajeDomenyCount[k.nazev] = domeny.length
    const codes = getKrajNaceCodes(domenyKraje, k.nazev)
    codes.forEach(c => allNace.add(c))
  }

  const freq = naceFrequency(domenyKraje, krajeKodovnik)
  const sharedByMany = freq.filter(f => f.count >= 5)
  const uniqueToOne = freq.filter(f => f.count === 1)

  return {
    totalDomeny,
    uniqueNaceCodes: allNace.size,
    krajeDomenyCount,
    topShared: sharedByMany.slice(0, 8),
    uniqueToOneCount: uniqueToOne.length,
    freq,
  }
}

/**
 * Krok 2: Clustering krajů podle Jaccard podobnosti.
 * Jednoduchý hierarchický clustering → 3-4 skupiny.
 */
export function analyzeStep2(domenyKraje, krajeKodovnik) {
  const { krajNames, matrix } = jaccardMatrix(domenyKraje, krajeKodovnik)

  // Agglomerative clustering: najdi nejpodobnější páry, seskup do 3-4 clusterů
  const n = krajNames.length
  const clusters = krajNames.map((name, i) => ({ id: i, members: [name] }))
  const active = new Set(clusters.map((_, i) => i))

  // Avg linkage
  function avgDist(c1, c2) {
    let sum = 0, count = 0
    for (const a of c1.members) {
      for (const b of c2.members) {
        const ai = krajNames.indexOf(a)
        const bi = krajNames.indexOf(b)
        sum += matrix[ai][bi]
        count++
      }
    }
    return count > 0 ? sum / count : 0
  }

  while (active.size > 4) {
    let bestI = -1, bestJ = -1, bestDist = -1
    const activeArr = [...active]
    for (let ai = 0; ai < activeArr.length; ai++) {
      for (let bi = ai + 1; bi < activeArr.length; bi++) {
        const d = avgDist(clusters[activeArr[ai]], clusters[activeArr[bi]])
        if (d > bestDist) {
          bestDist = d
          bestI = activeArr[ai]
          bestJ = activeArr[bi]
        }
      }
    }
    if (bestI === -1) break
    // Merge bestJ into bestI
    clusters[bestI].members = [...clusters[bestI].members, ...clusters[bestJ].members]
    active.delete(bestJ)
  }

  const result = [...active].map((idx, clusterIdx) => ({
    id: clusterIdx,
    members: clusters[idx].members,
  }))

  // Assign cluster ID to each kraj
  const krajCluster = {}
  for (const cluster of result) {
    for (const name of cluster.members) {
      krajCluster[name] = cluster.id
    }
  }

  // Top similar pairs
  const pairs = []
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      pairs.push({ a: krajNames[i], b: krajNames[j], jaccard: matrix[i][j] })
    }
  }
  pairs.sort((a, b) => b.jaccard - a.jaccard)

  return {
    clusters: result,
    krajCluster,
    topPairs: pairs.slice(0, 10),
    matrix,
    krajNames,
  }
}

/**
 * Krok 3: Nesoulad strategie vs realita.
 * Porovnání deklarovaných domén (CZ-NACE) vs FORD oborů projektů.
 */
export function analyzeStep3(domenyKraje, agregaty, krajeKodovnik) {
  const results = []

  for (const k of krajeKodovnik.kraje) {
    const name = k.nazev
    const domeny = domenyKraje.kraje?.[name]?.domeny || []
    const fordData = agregaty.projekty_po_krajich?.[name]?.po_ford_skupina
    if (!fordData || domeny.length === 0) continue

    // Top FORD skupiny (kde jdou peníze)
    const fordSorted = Object.entries(fordData)
      .map(([f, { pocet, naklady }]) => ({ ford: f, pocet, naklady }))
      .sort((a, b) => b.naklady - a.naklady)

    const totalNaklady = fordSorted.reduce((s, f) => s + f.naklady, 0)

    // Top 3 FORD = kde jde většina peněz
    const top3Ford = fordSorted.slice(0, 3)
    const top3Share = totalNaklady > 0
      ? top3Ford.reduce((s, f) => s + f.naklady, 0) / totalNaklady
      : 0

    results.push({
      kraj: name,
      zkratka: k.zkratka,
      domenyCount: domeny.length,
      domenyNames: domeny.map(d => d.nazev),
      topFord: top3Ford,
      top3FordShare: top3Share,
      totalNaklady,
    })
  }

  return results
}

/**
 * Krok 4: Skrytí šampioni — silné VaV kapacity bez deklarované domény.
 * Hledá FORD obory se silnou podporou v kraji, které nemají jasný vztah k doméně.
 */
export function analyzeStep4(csuVav, domenyKraje, agregaty, krajeKodovnik) {
  const results = []

  for (const k of krajeKodovnik.kraje) {
    const name = k.nazev
    const fordData = agregaty.projekty_po_krajich?.[name]?.po_ford_skupina
    if (!fordData) continue

    const totalNaklady = Object.values(fordData).reduce((s, f) => s + f.naklady, 0)
    if (totalNaklady === 0) continue

    // Najdi FORD obory s >10% podílem na krajských nákladech
    const strongFord = Object.entries(fordData)
      .map(([f, { pocet, naklady }]) => ({ ford: f, pocet, naklady, share: naklady / totalNaklady }))
      .filter(f => f.share > 0.1)
      .sort((a, b) => b.share - a.share)

    if (strongFord.length > 0) {
      results.push({
        kraj: name,
        zkratka: k.zkratka,
        strongFord,
        domenyNames: (domenyKraje.kraje?.[name]?.domeny || []).map(d => d.nazev),
      })
    }
  }

  return results
}

/**
 * Krok 5: Spolupráce a slepá místa.
 * Páry krajů s vysokou Jaccard podobností ale nízkou spoluprací, a naopak.
 */
export function analyzeStep5(domenyKraje, agregaty, krajeKodovnik) {
  const { krajNames, matrix: jaccardMat } = jaccardMatrix(domenyKraje, krajeKodovnik)
  const spoluprace = getSpolupraceMatrix(agregaty)

  // Build spoluprace lookup
  const spLookup = {}
  for (const s of spoluprace) {
    const key = [s.kraj_a, s.kraj_b].sort().join('|')
    spLookup[key] = s.spolecne_projekty
  }

  const pairs = []
  for (let i = 0; i < krajNames.length; i++) {
    for (let j = i + 1; j < krajNames.length; j++) {
      const key = [krajNames[i], krajNames[j]].sort().join('|')
      pairs.push({
        a: krajNames[i],
        b: krajNames[j],
        jaccard: jaccardMat[i][j],
        spoluprace: spLookup[key] || 0,
      })
    }
  }

  // Podobná strategie, nízká spolupráce (slepá místa)
  const blindSpots = pairs
    .filter(p => p.jaccard > 0.15 && p.spoluprace < 20)
    .sort((a, b) => b.jaccard - a.jaccard)
    .slice(0, 5)

  // Vysoká spolupráce
  const topCollab = [...pairs].sort((a, b) => b.spoluprace - a.spoluprace).slice(0, 10)

  // Praha-hub dominance
  const prahaCollab = pairs
    .filter(p => p.a === 'Hl. m. Praha' || p.b === 'Hl. m. Praha')
    .sort((a, b) => b.spoluprace - a.spoluprace)

  const totalCollab = pairs.reduce((s, p) => s + p.spoluprace, 0)
  const prahaShare = totalCollab > 0
    ? prahaCollab.reduce((s, p) => s + p.spoluprace, 0) / totalCollab
    : 0

  return {
    blindSpots,
    topCollab,
    prahaCollab,
    prahaShare,
    allPairs: pairs,
  }
}
