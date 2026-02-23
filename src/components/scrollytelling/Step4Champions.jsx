import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

/**
 * Krok 4 — "Skrytí šampioni."
 * Kraje se silnými VaV kapacitami v oborech, které nejsou v jejich doménách.
 * Vizualizace: kartičky postupně se odkrývající.
 */
export default function Step4Champions({ insight, active }) {
  const containerRef = useRef()

  if (!insight) return null

  // Vyber kraje s nejsilnějšími obory (>15% podíl)
  const featured = insight
    .filter(k => k.strongFord.some(f => f.share > 0.15))
    .slice(0, 6)

  return (
    <div ref={containerRef} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {featured.map((kraj, ki) => (
        <div
          key={kraj.kraj}
          className="bg-white rounded-lg p-3 border border-ris3-gray-200 shadow-sm transition-all duration-500"
          style={{
            opacity: active ? 1 : 0,
            transform: active ? 'translateY(0)' : 'translateY(20px)',
            transitionDelay: `${ki * 150}ms`,
          }}
        >
          <div className="font-semibold text-ris3-blue text-sm mb-2">{kraj.zkratka}</div>
          <div className="space-y-1.5">
            {kraj.strongFord.slice(0, 3).map((ford, fi) => (
              <div key={ford.ford} className="flex items-center gap-2">
                <div
                  className="h-2 rounded-full bg-ris3-accent transition-all duration-700"
                  style={{
                    width: active ? `${ford.share * 100}%` : '0%',
                    transitionDelay: `${ki * 150 + fi * 100 + 200}ms`,
                    minWidth: active ? 20 : 0,
                    maxWidth: '60%',
                  }}
                />
                <span className="text-xs text-ris3-gray-700 whitespace-nowrap">
                  {ford.ford} ({(ford.share * 100).toFixed(0)} %)
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 text-xs text-ris3-gray-500">
            Domény: {kraj.domenyNames.slice(0, 2).join(', ')}
            {kraj.domenyNames.length > 2 && '...'}
          </div>
        </div>
      ))}
    </div>
  )
}
