import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../../lib/DataContext'
import { allKrajeVavSummary } from '../../lib/vav'
import { fmtMilKc, fmtPct, fmtIntenzita, fmtNum } from '../../lib/format'
import SourceNote from '../shared/SourceNote'

/**
 * Přehledová tabulka všech 14 krajů s klíčovými VaV ukazateli.
 */
export default function KrajeOverview() {
  const { data } = useData()
  const navigate = useNavigate()

  const summary = useMemo(() => {
    if (!data) return []
    return allKrajeVavSummary(data.csuVav, data.hdpPopulace, data.krajeKodovnik, '2024')
  }, [data])

  if (!data) return null

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ris3-gray-200 text-left">
            <th className="py-2 px-2 text-xs font-semibold text-ris3-gray-500">Kraj</th>
            <th className="py-2 px-2 text-xs font-semibold text-ris3-gray-500 text-right">Výdaje VaV</th>
            <th className="py-2 px-2 text-xs font-semibold text-ris3-gray-500 text-right">Podíl ČR</th>
            <th className="py-2 px-2 text-xs font-semibold text-ris3-gray-500 text-right">Intenzita</th>
            <th className="py-2 px-2 text-xs font-semibold text-ris3-gray-500 text-right">FTE</th>
            <th className="py-2 px-2 text-xs font-semibold text-ris3-gray-500 text-right">Pracoviště</th>
          </tr>
        </thead>
        <tbody>
          {summary.map((k, i) => (
            <tr
              key={k.kod_nuts}
              onClick={() => navigate(`/dashboard/${k.kod_nuts}`)}
              className="border-b border-ris3-gray-100 hover:bg-ris3-gray-50 cursor-pointer transition-colors"
            >
              <td className="py-2 px-2">
                <span className="font-medium text-ris3-blue">{k.zkratka}</span>
                <span className="text-ris3-gray-500 ml-1.5 text-xs hidden md:inline">{k.nazev}</span>
              </td>
              <td className="py-2 px-2 text-right text-xs">{fmtMilKc(k.vydaje_mil_kc)}</td>
              <td className="py-2 px-2 text-right text-xs">
                <span className="inline-block w-12 text-right">{fmtPct(k.podil_vydaje)}</span>
                <div className="inline-block ml-1.5 w-16 h-1.5 bg-ris3-gray-100 rounded-full overflow-hidden align-middle">
                  <div
                    className="h-full bg-ris3-blue rounded-full"
                    style={{ width: `${Math.min((k.podil_vydaje || 0) * 100 / 0.4, 100)}%` }}
                  />
                </div>
              </td>
              <td className="py-2 px-2 text-right text-xs">{fmtIntenzita(k.intenzita)}</td>
              <td className="py-2 px-2 text-right text-xs">{fmtNum(k.pracovnici_fte)}</td>
              <td className="py-2 px-2 text-right text-xs">{fmtNum(k.pracoviste)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <SourceNote>ČSÚ, Ukazatele výzkumu a vývoje 2024; ČSÚ Regionální účty + KROK</SourceNote>
    </div>
  )
}
