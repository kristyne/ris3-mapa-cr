import { useRef, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as d3 from 'd3'
import { useData } from '../../lib/DataContext'
import { getVydajeTable, getPracovniciTable, getPracovisteTable, vavIntenzita, vavPerCapita } from '../../lib/vav'
import { fmtNum, fmtMilKc, fmtIntenzita, fmtPerCapita } from '../../lib/format'
import SourceNote from '../shared/SourceNote'

const METRICS = [
  { id: 'vydaje', label: 'Výdaje na VaV', unit: 'mil. Kč' },
  { id: 'fte', label: 'Pracovníci FTE', unit: 'FTE' },
  { id: 'pracoviste', label: 'Pracoviště VaV', unit: 'počet' },
  { id: 'intenzita', label: 'VaV intenzita', unit: '% HDP' },
  { id: 'perCapita', label: 'VaV na obyvatele', unit: 'Kč/ob.' },
  { id: 'projekty', label: 'Počet projektů', unit: 'počet' },
]

export default function RegionMap({ selectedKraj }) {
  const svgRef = useRef()
  const navigate = useNavigate()
  const { data } = useData()
  const [metric, setMetric] = useState('vydaje')
  const [tooltip, setTooltip] = useState(null)
  const [year, setYear] = useState('2024')

  useEffect(() => {
    if (!data?.geoJson || !svgRef.current) return

    const svg = d3.select(svgRef.current)
    const width = svgRef.current.clientWidth || 600
    const height = width * 0.58

    svg.attr('viewBox', `0 0 ${width} ${height}`)

    const projection = d3.geoMercator().fitSize(
      [width - 20, height - 20],
      data.geoJson
    )

    const path = d3.geoPath().projection(projection)

    svg.selectAll('*').remove()
    const g = svg.append('g')

    // Compute metric values
    const values = {}
    const vydajeTab = getVydajeTable(data.csuVav)
    const fteTab = getPracovniciTable(data.csuVav)
    const pracTab = getPracovisteTable(data.csuVav)

    for (const k of data.krajeKodovnik.kraje) {
      const name = k.nazev
      switch (metric) {
        case 'vydaje':
          values[name] = vydajeTab?.kraje?.[name]?.[year] ?? null
          break
        case 'fte':
          values[name] = fteTab?.kraje?.[name]?.[year] ?? null
          break
        case 'pracoviste':
          values[name] = pracTab?.kraje?.[name]?.[year] ?? null
          break
        case 'intenzita':
          values[name] = vavIntenzita(data.csuVav, data.hdpPopulace, name, year)
          break
        case 'perCapita':
          values[name] = vavPerCapita(data.csuVav, data.hdpPopulace, name, year)
          break
        case 'projekty':
          values[name] = data.agregaty.projekty_po_krajich?.[name]?.pocet_projektu ?? null
          break
      }
    }

    const validVals = Object.values(values).filter(v => v != null && v > 0)
    const maxVal = Math.max(...validVals, 1)

    const colorInterp = metric === 'intenzita' ? d3.interpolateGreens
      : metric === 'perCapita' ? d3.interpolatePurples
      : metric === 'projekty' ? d3.interpolateOranges
      : d3.interpolateBlues

    const colorScale = d3.scaleSequential(colorInterp).domain([0, maxVal])

    g.selectAll('path')
      .data(data.geoJson.features)
      .join('path')
      .attr('d', path)
      .attr('fill', d => {
        const val = values[d.properties.nazev]
        return val != null ? colorScale(val) : '#e9ecef'
      })
      .attr('stroke', d =>
        d.properties.kod_nuts === selectedKraj ? '#e63946' : '#fff'
      )
      .attr('stroke-width', d =>
        d.properties.kod_nuts === selectedKraj ? 2.5 : 1
      )
      .attr('cursor', 'pointer')
      .on('click', (_, d) => navigate(`/dashboard/${d.properties.kod_nuts}`))
      .on('mouseenter', (event, d) => {
        const name = d.properties.nazev
        const val = values[name]
        let formatted = '–'
        if (val != null) {
          if (metric === 'vydaje') formatted = fmtMilKc(val)
          else if (metric === 'intenzita') formatted = fmtIntenzita(val)
          else if (metric === 'perCapita') formatted = fmtPerCapita(val)
          else formatted = fmtNum(val)
        }
        setTooltip({
          x: event.offsetX,
          y: event.offsetY,
          name,
          value: formatted,
        })
        d3.select(event.currentTarget).attr('stroke', '#e63946').attr('stroke-width', 2)
      })
      .on('mousemove', (event) => {
        setTooltip(prev => prev ? { ...prev, x: event.offsetX, y: event.offsetY } : null)
      })
      .on('mouseleave', (event, d) => {
        const isSelected = d.properties.kod_nuts === selectedKraj
        d3.select(event.currentTarget)
          .attr('stroke', isSelected ? '#e63946' : '#fff')
          .attr('stroke-width', isSelected ? 2.5 : 1)
        setTooltip(null)
      })

  }, [data, selectedKraj, metric, year, navigate])

  if (!data) return null

  const availableYears = getVydajeTable(data.csuVav)?.roky || []
  const yearsForMetric = metric === 'projekty'
    ? ['2021', '2022', '2023', '2024', '2025']
    : availableYears

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        {METRICS.map(m => (
          <button
            key={m.id}
            onClick={() => setMetric(m.id)}
            className={`pill ${metric === m.id ? 'active' : ''}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 mb-2">
        <label className="text-xs text-ris3-gray-500">Rok:</label>
        <select
          value={year}
          onChange={e => setYear(e.target.value)}
          className="text-xs border border-ris3-gray-200 rounded px-2 py-1"
        >
          {yearsForMetric.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      <div className="relative">
        <svg ref={svgRef} className="w-full" style={{ minHeight: 280 }} />
        {tooltip && (
          <div
            className="absolute bg-white border border-ris3-gray-200 shadow-lg rounded px-3 py-2 text-sm pointer-events-none z-10"
            style={{ left: Math.min(tooltip.x + 10, svgRef.current?.clientWidth - 180 || 400), top: tooltip.y - 50 }}
          >
            <div className="font-semibold text-ris3-blue">{tooltip.name}</div>
            <div className="text-ris3-gray-700">{tooltip.value}</div>
          </div>
        )}
      </div>

      <SourceNote>
        {metric === 'projekty'
          ? 'IS VaVaI/CEP, projekty 2021–2025'
          : `ČSÚ, Ukazatele výzkumu a vývoje, ${year}`}
        {(metric === 'intenzita' || metric === 'perCapita') && '; ČSÚ Regionální účty + KROK'}
      </SourceNote>
    </div>
  )
}
