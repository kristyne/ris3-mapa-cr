import { useMemo } from 'react'
import { useData } from '../lib/DataContext'
import { nutsToName } from '../lib/kraje'
import { krajVavSummary, shareTrend, getVydajeTable, getPracovniciTable } from '../lib/vav'
import { getKrajDomenyFull, getKrajEmerging, mostSimilar } from '../lib/domeny'
import { getKrajProjektySummary, topPoskytovatele, topFordSkupiny, projektyTrend, getKrajSpoluprace, getKrajSubjekty } from '../lib/projekty'

/**
 * Hook pro získání kompletních dat jednoho kraje.
 * Přijímá buď NUTS kód nebo název kraje.
 */
export default function useKrajData(krajIdOrName) {
  const { data, loading } = useData()

  return useMemo(() => {
    if (loading || !data || !krajIdOrName) return null

    // Rozlišíme NUTS kód vs název
    const krajName = krajIdOrName.startsWith('CZ')
      ? nutsToName(data.krajeKodovnik, krajIdOrName)
      : krajIdOrName

    const latestYear = '2024'

    return {
      nazev: krajName,
      // VaV souhrnné statistiky
      vav: krajVavSummary(data.csuVav, data.hdpPopulace, krajName, latestYear),
      // Trendy podílu na výdajích a FTE
      trendVydaje: shareTrend(getVydajeTable(data.csuVav), krajName),
      trendFte: shareTrend(getPracovniciTable(data.csuVav), krajName),
      // Domény specializace
      domeny: getKrajDomenyFull(data.domenyKraje, krajName),
      emerging: getKrajEmerging(data.domenyKraje, krajName),
      podobne: mostSimilar(data.domenyKraje, data.krajeKodovnik, krajName, 5),
      // Projektové portfolio
      projekty: getKrajProjektySummary(data.agregaty, krajName),
      topPoskytovatele: topPoskytovatele(data.agregaty, krajName, 5),
      topFord: topFordSkupiny(data.agregaty, krajName, 10),
      projektyTrend: projektyTrend(data.agregaty, krajName),
      spoluprace: getKrajSpoluprace(data.agregaty, krajName),
      // Subjekty VaV
      subjekty: getKrajSubjekty(data.agregaty, krajName),
    }
  }, [data, loading, krajIdOrName])
}
