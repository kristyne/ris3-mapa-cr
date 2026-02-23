import { useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { useData } from '../../lib/DataContext'
import { shareTrend, valueTrend, getVydajeTable, getPracovniciTable } from '../../lib/vav'
import { fmtPct, fmtNum } from '../../lib/format'
import { nameToZkratka } from '../../lib/kraje'
import SourceNote from '../shared/SourceNote'

const COLORS = ['#1e3a5f', '#e63946', '#2a9d8f', '#e9c46a', '#4e79a7', '#f28e2b']

const TREND_MODES = [
  { id: 'share_vydaje', label: 'Podíl výdajů na ČR' },
  { id: 'share_fte', label: 'Podíl FTE na ČR' },
  { id: 'abs_vydaje', label: 'Výdaje (mil. Kč)' },
  { id: 'abs_fte', label: 'FTE pracovníci' },
]

/**
 * D. Trendové grafy — podíl kraje na ČR nebo absolutní hodnoty.
 * Podporuje zobrazení více krajů naráz.
 */
export default function TrendChart({ selectedKraje = [] }) {
  const { data } = useData()
  const [mode, setMode] = useState('share_vydaje')

  const chartData = useMemo(() => {
    if (!data) return []

    const vydajeTab = getVydajeTable(data.csuVav)
    const fteTab = getPracovniciTable(data.csuVav)

    // Use all kraje if none selected
    const kraje = selectedKraje.length > 0
      ? selectedKraje
      : data.krajeKodovnik.kraje.slice(0, 5).map(k => k.nazev)

    const isShare = mode.startsWith('share_')
    const table = mode.includes('vydaje') ? vydajeTab : fteTab
    const trendFn = isShare ? shareTrend : valueTrend

    // Get all years from first kraj
    const firstTrend = trendFn(table, kraje[0])
    if (!firstTrend.length) return []

    return firstTrend.map(({ year }) => {
      const point = { year }
      for (const kraj of kraje) {
        const trend = trendFn(table, kraj)
        const match = trend.find(t => t.year === year)
        const zkr = nameToZkratka(data.krajeKodovnik, kraj)
        point[zkr] = match ? (isShare ? match.share : match.value) : null
      }
      return point
    })
  }, [data, selectedKraje, mode])

  if (!data) return null

  const kraje = selectedKraje.length > 0
    ? selectedKraje
    : data.krajeKodovnik.kraje.slice(0, 5).map(k => k.nazev)
  const keys = kraje.map(k => nameToZkratka(data.krajeKodovnik, k))
  const isShare = mode.startsWith('share_')

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {TREND_MODES.map(m => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`text-xs px-2 py-1 rounded-full border transition-colors cursor-pointer ${
              mode === m.id
                ? 'bg-ris3-blue text-white border-ris3-blue'
                : 'bg-white text-ris3-gray-700 border-ris3-gray-200 hover:border-ris3-blue'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e9ecef" />
          <XAxis dataKey="year" tick={{ fontSize: 11 }} />
          <YAxis
            tick={{ fontSize: 10 }}
            tickFormatter={v => isShare ? `${(v * 100).toFixed(0)}%` : fmtNum(v)}
            width={50}
          />
          <Tooltip
            formatter={(value, name) =>
              isShare ? [fmtPct(value), name] : [fmtNum(value), name]
            }
            contentStyle={{ fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {keys.map((key, i) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={{ r: 2 }}
              activeDot={{ r: 4 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      <SourceNote>ČSÚ, Ukazatele výzkumu a vývoje 2005–2024</SourceNote>
    </div>
  )
}
