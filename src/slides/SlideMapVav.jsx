import { useState, useEffect, useMemo } from 'react'
import * as d3 from 'd3'
import InfoPanel from '../InfoPanel'

const INFO_TEXT = `VaV intenzita (výdaje na výzkum a vývoj v poměru k HDP) je základní ukazatel inovační kapacity regionu. Koláčové grafy ukazují sektorové členění výdajů — podnikatelský sektor (modrá), vládní sektor (červená) a vysokoškolský sektor (žlutá). Velikost koláče odpovídá celkovým výdajům na VaV v daném kraji. Podkladová vrstva ukazuje hranice okresů. Data pocházejí z ČSÚ, Statistická ročenka krajů 2025, tabulka 19.104.`

const SECTOR_COLORS = {
  podnikatelsky: '#1F4E9D',
  vladni: '#C41E3A',
  vysokoskolsky: '#E8A317',
}

const SECTOR_LABELS = {
  podnikatelsky: 'Podnikatelský',
  vladni: 'Vládní',
  vysokoskolsky: 'Vysokoškolský',
}

export default function SlideMapVav() {
  const [krajeGeo, setKrajeGeo] = useState(null)
  const [okresyGeo, setOkresyGeo] = useState(null)
  const [sektorData, setSektorData] = useState(null)
  const [tooltip, setTooltip] = useState(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  useEffect(() => {
    Promise.all([
      fetch(`${import.meta.env.BASE_URL}data/kraje.geojson`).then(r => r.json()),
      fetch(`${import.meta.env.BASE_URL}data/okresy.geojson`).then(r => r.json()),
      fetch(`${import.meta.env.BASE_URL}data/vav_sektory_2024.json`).then(r => r.json()),
    ]).then(([kraje, okresy, sektory]) => {
      setKrajeGeo(kraje)
      setOkresyGeo(okresy)
      setSektorData(sektory)
    })
  }, [])

  useEffect(() => {
    const update = () => setDimensions({ width: window.innerWidth, height: window.innerHeight })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // Color scale: light sky-blue → vivid blue based on VaV intensity
  const colorScale = useMemo(() => {
    if (!sektorData) return () => '#eee'
    const values = Object.values(sektorData.kraje).map(d => d.intenzita_hdp_2024)
    return d3.scaleSequential()
      .domain([0, Math.max(...values)])
      .interpolator(t => d3.interpolateRgb('#E1F5FE', '#0288D1')(Math.pow(t, 0.55)))
  }, [sektorData])

  // Pie radius scale — proportional to total expenditure
  const radiusScale = useMemo(() => {
    if (!sektorData) return () => 10
    const values = Object.values(sektorData.kraje).map(d => d.celkem_mil_kc_2024)
    const max = Math.max(...values)
    // Scale from 12px to 38px based on viewport
    const maxR = Math.min(dimensions.width, dimensions.height) > 900 ? 38 : 28
    return d3.scaleSqrt().domain([0, max]).range([8, maxR])
  }, [sektorData, dimensions])

  const projection = useMemo(() => {
    if (!krajeGeo || dimensions.width === 0) return null
    const { width, height } = dimensions
    const mapHeight = height * 0.78
    const mapWidth = width * 0.90
    const proj = d3.geoMercator().fitSize([mapWidth, mapHeight], krajeGeo)
    const [tx, ty] = proj.translate()
    proj.translate([tx + (width - mapWidth) / 2, ty + (height - mapHeight) * 0.15])
    return proj
  }, [krajeGeo, dimensions])

  const pathGenerator = useMemo(() => {
    if (!projection) return null
    return d3.geoPath().projection(projection)
  }, [projection])

  // Centroids for pie charts (with manual fix for Středočeský/Praha overlap)
  const centroids = useMemo(() => {
    if (!krajeGeo || !pathGenerator) return {}
    const result = {}
    for (const feature of krajeGeo.features) {
      const nuts = feature.properties.nutslau
      const [cx, cy] = pathGenerator.centroid(feature)
      if (nuts === 'CZ020') {
        // Shift Středočeský kraj centroid down-right to avoid overlap with Praha
        result[nuts] = [cx + 30, cy + 35]
      } else {
        result[nuts] = [cx, cy]
      }
    }
    return result
  }, [krajeGeo, pathGenerator])

  // Pie arc generator
  const pieGen = useMemo(() => d3.pie().sort(null).value(d => d.value), [])

  // Stats
  const stats = useMemo(() => {
    if (!sektorData) return null
    const entries = Object.values(sektorData.kraje)
    const values = entries.map(d => d.intenzita_hdp_2024)
    return {
      avg: sektorData.cesko.intenzita_hdp_2024,
      min: Math.min(...values),
      max: Math.max(...values),
      totalMld: sektorData.cesko.celkem_mil_kc_2024 / 1000,
    }
  }, [sektorData])

  if (!krajeGeo || !pathGenerator || !sektorData || !stats) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#f8f9fa]">
        <p className="text-[#777] text-lg">Načítám data…</p>
      </div>
    )
  }

  const fmt = (n, d = 1) => n.toLocaleString('cs-CZ', { minimumFractionDigits: d, maximumFractionDigits: d })
  const fmtMld = (milKc) => fmt(milKc / 1000, 1)

  return (
    <div className="w-full h-full bg-[#f8f9fa] relative overflow-hidden">
      <InfoPanel text={INFO_TEXT} />
      {/* Title */}
      <div className="absolute top-5 left-6 z-10">
        <h2 className="text-2xl font-bold text-[#0A416E]">
          Výdaje na výzkum a vývoj podle krajů a sektorů
        </h2>
        <p className="text-sm text-[#777] mt-1">
          Barva = VaV intenzita (% HDP) &middot; Koláč = sektorové členění &middot; Velikost = celkové výdaje &middot; 2024
        </p>
      </div>

      {/* SVG Map */}
      <svg width={dimensions.width} height={dimensions.height} className="absolute inset-0">
        {/* Okresy base layer */}
        {okresyGeo && (
          <g>
            {okresyGeo.features.map((feature) => (
              <path
                key={feature.properties.nutslau}
                d={pathGenerator(feature)}
                fill="#F0F0F0"
                stroke="#DDD"
                strokeWidth={0.5}
              />
            ))}
          </g>
        )}

        {/* Kraje choropleth */}
        <g>
          {krajeGeo.features.map((feature) => {
            const nuts = feature.properties.nutslau
            const info = sektorData.kraje[nuts]
            return (
              <path
                key={nuts}
                d={pathGenerator(feature)}
                fill={info ? colorScale(info.intenzita_hdp_2024) : '#eee'}
                stroke="#fff"
                strokeWidth={1.5}
                opacity={0.85}
                className="kraj-path"
                onMouseMove={(e) => {
                  setTooltip({ x: e.clientX, y: e.clientY, name: feature.properties.nazev, nuts, info })
                }}
                onMouseLeave={() => setTooltip(null)}
              />
            )
          })}
        </g>

        {/* Pie charts at centroids */}
        {Object.entries(sektorData.kraje).map(([nuts, info]) => {
          const c = centroids[nuts]
          if (!c) return null
          const [cx, cy] = c
          const r = radiusScale(info.celkem_mil_kc_2024)

          const sectors = [
            { key: 'podnikatelsky', value: info.podnikatelsky_mil_kc },
            { key: 'vladni', value: info.vladni_mil_kc },
            { key: 'vysokoskolsky', value: info.vysokoskolsky_mil_kc },
          ].filter(s => s.value > 0)

          const arcs = pieGen(sectors)
          const arcGen = d3.arc().innerRadius(0).outerRadius(r)

          return (
            <g key={`pie-${nuts}`} transform={`translate(${cx},${cy})`}
              onMouseMove={(e) => {
                setTooltip({ x: e.clientX, y: e.clientY, name: info.nazev, nuts, info })
              }}
              onMouseLeave={() => setTooltip(null)}
              style={{ cursor: 'pointer' }}
            >
              {/* White background circle */}
              <circle r={r + 1} fill="white" opacity={0.9} />
              {/* Pie slices */}
              {arcs.map((arc, i) => (
                <path
                  key={sectors[i].key}
                  d={arcGen(arc)}
                  fill={SECTOR_COLORS[sectors[i].key]}
                  stroke="white"
                  strokeWidth={0.5}
                />
              ))}
              {/* Label: total in mld */}
              <text
                y={r + 12}
                textAnchor="middle"
                fontSize={9}
                fontWeight={600}
                fill="#0A416E"
              >
                {fmtMld(info.celkem_mil_kc_2024)}
              </text>
              {/* Abbreviation removed — kraje identified via tooltip */}
            </g>
          )
        })}
      </svg>

      {/* Tooltip */}
      {tooltip && tooltip.info && (
        <div className="map-tooltip" style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}>
          <div className="tooltip-title">{tooltip.name}</div>
          <div className="tooltip-value">
            VaV intenzita: <strong>{fmt(tooltip.info.intenzita_hdp_2024, 2)} % HDP</strong>
          </div>
          <div className="tooltip-value" style={{ fontSize: 12, color: '#666' }}>
            Celkové výdaje: {fmtMld(tooltip.info.celkem_mil_kc_2024)} mld. Kč
          </div>
          <div style={{ fontSize: 11, marginTop: 4 }}>
            <span style={{ color: SECTOR_COLORS.podnikatelsky }}>■</span> Podnikatelský: {fmtMld(tooltip.info.podnikatelsky_mil_kc)} mld.
          </div>
          <div style={{ fontSize: 11 }}>
            <span style={{ color: SECTOR_COLORS.vladni }}>■</span> Vládní: {fmtMld(tooltip.info.vladni_mil_kc)} mld.
          </div>
          <div style={{ fontSize: 11 }}>
            <span style={{ color: SECTOR_COLORS.vysokoskolsky }}>■</span> Vysokoškolský: {fmtMld(tooltip.info.vysokoskolsky_mil_kc)} mld.
          </div>
          <div className="tooltip-value" style={{ fontSize: 11, color: '#888', marginTop: 2, fontStyle: 'italic' }}>
            {tooltip.info.intenzita_hdp_2024 >= 2 ? 'Nad cílem EU 3 %: ' + fmt(tooltip.info.intenzita_hdp_2024 / 3 * 100, 0) + ' %'
              : tooltip.info.intenzita_hdp_2024 >= 1 ? 'Nad průměrem ČR'
              : 'Pod průměrem ČR'}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-20 right-8 z-10 bg-white/90 rounded-lg px-4 py-3 shadow-sm">
        <div className="text-xs font-medium text-[#0A416E] mb-2">VaV intenzita (% HDP)</div>
        <svg width="140" height="28">
          <defs>
            <linearGradient id="legend-grad-vav2">
              <stop offset="0%" stopColor="#E1F5FE" />
              <stop offset="100%" stopColor="#0288D1" />
            </linearGradient>
          </defs>
          <rect y="0" width="140" height="12" rx="2" fill="url(#legend-grad-vav2)" />
          {[0, 0.5, 1.0, 1.5, 2.0, 3.0].map((tick) => {
            const maxI = Math.max(...Object.values(sektorData.kraje).map(d => d.intenzita_hdp_2024))
            const x = (Math.pow(tick / maxI, 0.55)) * 140
            if (x > 140) return null
            return (
              <g key={tick}>
                <line x1={x} x2={x} y1={12} y2={16} stroke="#9B9BA0" strokeWidth={1} />
                <text x={x} y={25} textAnchor="middle" fontSize={9} fill="#777">
                  {tick === 0 ? '0' : `${fmt(tick, 1)}%`}
                </text>
              </g>
            )
          })}
        </svg>

        <div className="text-xs font-medium text-[#0A416E] mt-3 mb-1">Sektory VaV</div>
        {Object.entries(SECTOR_COLORS).map(([key, color]) => (
          <div key={key} className="flex items-center gap-2 mt-0.5">
            <div style={{ width: 12, height: 10, background: color, borderRadius: 2 }} />
            <span className="text-[10px] text-[#777]">{SECTOR_LABELS[key]}</span>
          </div>
        ))}
        <div className="text-[10px] text-[#777] mt-2 leading-snug">
          Velikost koláče ∝ celkové výdaje<br />
          Čísla = celkem v mld. Kč
        </div>
      </div>

      {/* Commentary */}
      <div className="absolute bottom-20 left-8 z-10 max-w-lg bg-white/90 rounded-lg px-4 py-3 shadow-sm">
        <p className="text-sm text-[#0A416E] leading-relaxed">
          Celkové výdaje na VaV v ČR dosáhly {fmt(stats.totalMld, 1)} mld. Kč ({fmt(stats.avg, 2)} % HDP).
          Rozptyl mezi kraji: od {fmt(stats.min, 2)} % po {fmt(stats.max, 2)} %.
          Koláče ukazují, jak se výdaje dělí mezi podnikatelský, vládní a vysokoškolský sektor.
        </p>
      </div>

      {/* Source */}
      <div className="absolute bottom-4 left-0 right-0 text-center text-[10px] text-[#777] z-10">
        Zdroj: ČSÚ — Statistická ročenka krajů 2025 (tab. 19.104) &middot; Geodata: ArcČR © ČÚZK, ČSÚ, ARCDATA PRAHA 2024, CC-BY 4.0
      </div>
    </div>
  )
}
