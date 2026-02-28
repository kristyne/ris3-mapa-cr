import { useState, useEffect, useMemo } from 'react'
import * as d3 from 'd3'
import InfoPanel from '../InfoPanel'
import CollapsiblePanel from '../CollapsiblePanel'

const INFO_TEXT = `⚠ Známé limitace této analýzy:

1. Nerovnoměrná granularita: Podrobnost CZ-NACE klasifikace se mezi krajskými kartami výrazně liší — od 5 kódů (Vysočina, 1,2 kódu na doménu) po 38 kódů (Jihočeský, 7,6 kódu na doménu). Kraje s podrobnější klasifikací mají tendenci k nižšímu Jaccard indexu (větší „unie" = menší poměr průniku).

2. Čtyři kraje bez NACE: Praha, Olomoucký, Ústecký a Zlínský kraj nemají v krajských kartách CZ-NACE kódy vůbec — jejich domény jsou definovány jen popisně. Nelze je proto porovnávat touto metodou.

3. Formální vs. obsahová metrika: Jaccard index měří jen překryv deklarovaných oborových kódů, ne skutečnou obsahovou blízkost strategií. Dva kraje mohou mít zcela odlišné NACE kódy, ale sémanticky velmi podobné domény — a naopak. Tuto dimenzi doplňují sémantické slidy (4 a 5).

Jak se to počítá: Jaccardův index = |průnik| / |sjednocení|. Pro každý kraj se spočítá průměr Jaccardovy podobnosti vůči všem ostatním krajům s NACE kódy (9 krajů). Heatmapa ukazuje párové srovnání.`

const NUTS_BY_NAME = {
  'Hl. m. Praha': 'CZ010', 'Středočeský kraj': 'CZ020', 'Jihočeský kraj': 'CZ031',
  'Plzeňský kraj': 'CZ032', 'Karlovarský kraj': 'CZ041', 'Ústecký kraj': 'CZ042',
  'Liberecký kraj': 'CZ051', 'Královéhradecký kraj': 'CZ052', 'Pardubický kraj': 'CZ053',
  'Vysočina': 'CZ063', 'Jihomoravský kraj': 'CZ064', 'Olomoucký kraj': 'CZ071',
  'Zlínský kraj': 'CZ072', 'Moravskoslezský kraj': 'CZ080',
}

const SHORT = {
  'Hl. m. Praha': 'Praha', 'Středočeský kraj': 'Středočeský', 'Jihočeský kraj': 'Jihočeský',
  'Plzeňský kraj': 'Plzeňský', 'Karlovarský kraj': 'Karlovarský', 'Ústecký kraj': 'Ústecký',
  'Liberecký kraj': 'Liberecký', 'Královéhradecký kraj': 'Královéhradecký', 'Pardubický kraj': 'Pardubický',
  'Vysočina': 'Vysočina', 'Jihomoravský kraj': 'Jihomoravský', 'Olomoucký kraj': 'Olomoucký',
  'Zlínský kraj': 'Zlínský', 'Moravskoslezský kraj': 'Moravskoslezský',
}

function computeJaccard(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return null
  if (setA.size === 0 || setB.size === 0) return null
  const intersection = new Set([...setA].filter(x => setB.has(x)))
  const union = new Set([...setA, ...setB])
  return intersection.size / union.size
}

function getSharedCodes(setA, setB) {
  return [...setA].filter(x => setB.has(x)).sort()
}

// Warm olive-green stepped scale for heatmap (complements amber without clashing)
const STEPS = [
  { max: 0.10, color: '#F1F5E4' },
  { max: 0.20, color: '#D5E2A8' },
  { max: 0.30, color: '#A8C556' },
  { max: 0.35, color: '#7BA428' },
  { max: 0.42, color: '#4F7A12' },
  { max: Infinity, color: '#355410' },
]

const MAP_COLORS = ['#FFF3D6', '#FFD97A', '#FFB830', '#E8910C', '#B5600A']

export default function SlideJaccardHeatmap() {
  const [geoData, setGeoData] = useState(null)
  const [domenyData, setDomenyData] = useState(null)
  const [tooltip, setTooltip] = useState(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  useEffect(() => {
    Promise.all([
      fetch(`${import.meta.env.BASE_URL}data/kraje.geojson`).then(r => r.json()),
      fetch(`${import.meta.env.BASE_URL}data/domeny_kraje.json`).then(r => r.json()),
    ]).then(([geo, dom]) => {
      setGeoData(geo)
      setDomenyData(dom)
    })
  }, [])

  useEffect(() => {
    const update = () => setDimensions({ width: window.innerWidth, height: window.innerHeight })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const isDesktop = dimensions.width > 1024
  const isTablet = dimensions.width > 768 && dimensions.width <= 1024
  const isMobile = dimensions.width <= 768
  const isCompact = isDesktop && dimensions.height < 900

  // NACE sets per kraj + unique/shared analysis
  const krajInfo = useMemo(() => {
    if (!domenyData) return {}
    const krajNace = {}
    for (const [name, info] of Object.entries(domenyData.kraje)) {
      const nuts = NUTS_BY_NAME[name]
      if (!nuts) continue
      const codes = new Set()
      for (const d of info.domeny || []) {
        for (const c of d.cz_nace || []) codes.add(c)
      }
      krajNace[nuts] = { codes, krajName: name, domenyCount: (info.domeny || []).length }
    }

    const naceCount = {}
    for (const info of Object.values(krajNace)) {
      for (const c of info.codes) naceCount[c] = (naceCount[c] || 0) + 1
    }

    const nutsWithNace = Object.keys(krajNace).filter(n => krajNace[n].codes.size > 0)
    const result = {}

    for (const [nuts, info] of Object.entries(krajNace)) {
      if (info.codes.size === 0) {
        result[nuts] = { ...info, hasNace: false, avgJaccard: null, unique: 0, shared: 0 }
        continue
      }
      let sum = 0, count = 0, bestJ = -1, bestPartner = ''
      for (const other of nutsWithNace) {
        if (other === nuts) continue
        const j = computeJaccard(info.codes, krajNace[other].codes)
        if (j == null) continue
        sum += j; count++
        if (j > bestJ) { bestJ = j; bestPartner = krajNace[other].krajName }
      }
      const uniqueCodes = [], sharedCodes = []
      for (const c of info.codes) {
        if (naceCount[c] === 1) uniqueCodes.push(c)
        else sharedCodes.push(c)
      }
      result[nuts] = {
        ...info, hasNace: true,
        avgJaccard: count > 0 ? sum / count : 0,
        bestPair: bestJ > 0 ? { name: bestPartner, jaccard: bestJ } : null,
        unique: uniqueCodes.length, shared: sharedCodes.length,
        uniqueList: uniqueCodes.sort(), sharedList: sharedCodes.sort(),
      }
    }
    return result
  }, [domenyData])

  // Heatmap data (only kraje with NACE codes)
  const heatmapKraje = useMemo(() => {
    if (!domenyData) return []
    const result = []
    for (const [name, info] of Object.entries(domenyData.kraje)) {
      const codes = new Set()
      for (const d of info.domeny || []) {
        for (const c of d.cz_nace || []) codes.add(c)
      }
      if (codes.size > 0) {
        result.push({ name, short: SHORT[name] || name, codes })
      }
    }
    return result
  }, [domenyData])

  const matrix = useMemo(() => {
    if (heatmapKraje.length === 0) return null
    const n = heatmapKraje.length
    const cells = []
    let bestPair = { i: 0, j: 1, val: 0, names: ['', ''], codes: [] }

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const val = i === j ? 1.0 : computeJaccard(heatmapKraje[i].codes, heatmapKraje[j].codes) ?? 0
        const shared = i === j ? [] : getSharedCodes(heatmapKraje[i].codes, heatmapKraje[j].codes)
        cells.push({ row: i, col: j, val, shared })
        if (i < j && val > bestPair.val) {
          bestPair = { i, j, val, names: [heatmapKraje[i].short, heatmapKraje[j].short], codes: shared }
        }
      }
    }
    return { cells, n, bestPair }
  }, [heatmapKraje])

  const mapColorScale = useMemo(() => {
    const values = Object.values(krajInfo).map(d => d.avgJaccard).filter(v => v != null)
    if (values.length === 0) return () => '#eee'
    return d3.scaleQuantile().domain(values).range(MAP_COLORS)
  }, [krajInfo])

  const heatColorScale = useMemo(() => {
    return (val) => {
      if (val === 0) return '#ececec'
      for (const step of STEPS) {
        if (val <= step.max) return step.color
      }
      return STEPS[STEPS.length - 1].color
    }
  }, [])

  // Map projection
  const mapSvgW = isDesktop ? dimensions.width : dimensions.width
  const mapSvgH = isDesktop ? dimensions.height : isTablet ? dimensions.height * 0.40 : dimensions.height * 0.38

  const projection = useMemo(() => {
    if (!geoData || dimensions.width === 0) return null
    const mapWidth = isDesktop ? dimensions.width * (isCompact ? 0.58 : 0.62) : dimensions.width * 0.92
    const mapHeight = isDesktop ? dimensions.height * (isCompact ? 0.62 : 0.70) : mapSvgH * 0.80
    const proj = d3.geoMercator().fitSize([mapWidth, mapHeight], geoData)
    const [tx, ty] = proj.translate()
    if (isDesktop) {
      // Push map down enough to clear title (~70-80px)
      proj.translate([tx + dimensions.width * 0.01, ty + Math.max(70, dimensions.height * 0.09)])
    } else {
      proj.translate([tx + dimensions.width * 0.04, ty + mapSvgH * 0.08])
    }
    return proj
  }, [geoData, dimensions, isDesktop, isCompact, mapSvgH])

  const pathGenerator = useMemo(() => {
    if (!projection) return null
    return d3.geoPath().projection(projection)
  }, [projection])

  const centroids = useMemo(() => {
    if (!geoData || !pathGenerator) return {}
    const result = {}
    const scale = Math.min(dimensions.width, dimensions.height) / 1000
    for (const feature of geoData.features) {
      const nuts = feature.properties.nutslau
      const [cx, cy] = pathGenerator.centroid(feature)
      if (nuts === 'CZ020') {
        result[nuts] = [cx + 25 * scale, cy + 30 * scale]
      } else {
        result[nuts] = [cx, cy]
      }
    }
    return result
  }, [geoData, pathGenerator, dimensions])

  const stats = useMemo(() => {
    const entries = Object.values(krajInfo).filter(d => d.avgJaccard != null)
    if (entries.length === 0) return null
    const values = entries.map(d => d.avgJaccard)
    return { avg: values.reduce((s, v) => s + v, 0) / values.length }
  }, [krajInfo])

  if (!geoData || !pathGenerator || !stats || !matrix) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#f8f9fa]">
        <p className="text-[#777] text-lg">Načítám data…</p>
      </div>
    )
  }

  const { width, height } = dimensions
  const fmt = (n) => n.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const quantiles = mapColorScale.quantiles ? mapColorScale.quantiles() : []
  const n = matrix.n

  // Responsive SVG font helper
  const fs = (base) => Math.max(base * 0.6, Math.min(base, Math.min(width, height) / 1080 * base))

  // ── Map SVG ──
  const renderMap = (svgW, svgH) => (
    <svg width={svgW} height={svgH} style={{ display: 'block' }}>
      <g>
        {geoData.features.map((feature) => {
          const nuts = feature.properties.nutslau
          const info = krajInfo[nuts]
          const hasData = info?.hasNace
          return (
            <path
              key={nuts}
              d={pathGenerator(feature)}
              className="kraj-path"
              fill={hasData ? mapColorScale(info.avgJaccard) : '#c0c0c0'}
              stroke="#fff"
              strokeWidth={1.5}
              onMouseMove={(e) => {
                setTooltip({ x: e.clientX, y: e.clientY, type: 'map', name: feature.properties.nazev, info })
              }}
              onMouseLeave={() => setTooltip(null)}
            />
          )
        })}
      </g>

      {/* Map overlay: unique NACE highlight */}
      {Object.entries(centroids).map(([nuts, [cx, cy]]) => {
        const info = krajInfo[nuts]
        if (!info) return null

        if (!info.hasNace) {
          return (
            <text key={`label-${nuts}`} x={cx} y={cy}
              textAnchor="middle" dominantBaseline="central"
              fontSize={fs(9)} fill="#999" fontStyle="italic"
              style={{ pointerEvents: 'none' }}>
              bez NACE
            </text>
          )
        }

        const total = info.codes.size
        const uniq = info.unique
        const ringR = Math.max(12, Math.min(18, Math.min(svgW, svgH) * 0.018))
        const uniqueRatio = total > 0 ? uniq / total : 0

        return (
          <g key={`label-${nuts}`} style={{ pointerEvents: 'none' }}>
            <circle cx={cx} cy={cy} r={ringR}
              fill="rgba(255,255,255,0.92)" stroke="rgba(10,65,110,0.15)" strokeWidth={0.5} />
            {uniqueRatio > 0 && (
              <path
                d={d3.arc()({
                  innerRadius: ringR - 3,
                  outerRadius: ringR,
                  startAngle: 0,
                  endAngle: uniqueRatio * Math.PI * 2,
                })}
                transform={`translate(${cx},${cy})`}
                fill="#2DA547"
                opacity={0.8}
              />
            )}
            {uniqueRatio < 1 && (
              <path
                d={d3.arc()({
                  innerRadius: ringR - 3,
                  outerRadius: ringR,
                  startAngle: uniqueRatio * Math.PI * 2,
                  endAngle: Math.PI * 2,
                })}
                transform={`translate(${cx},${cy})`}
                fill="#CDCDD2"
                opacity={0.6}
              />
            )}
            <text x={cx} y={cy - 3} textAnchor="middle" dominantBaseline="central"
              fontSize={fs(13)} fontWeight={700}>
              <tspan fill="#2DA547">{uniq}</tspan>
              <tspan fill="#AAAAAA" fontSize={fs(10)}> / {total}</tspan>
            </text>
            <text x={cx} y={cy + 10} textAnchor="middle"
              fontSize={fs(7)} fill="#777">
              unik. NACE
            </text>
          </g>
        )
      })}
    </svg>
  )

  // ── Heatmap SVG ──
  const renderHeatmap = (containerW, containerH) => {
    const labelW = Math.min(85, containerW * 0.15)
    const topLabelH = Math.min(65, containerH * 0.15)
    const availW = containerW - labelW - 20
    const availH = containerH - topLabelH - 20
    const cs = Math.max(12, Math.min(Math.floor(availW / n), Math.floor(availH / n), isMobile ? 22 : 28))
    const gW = cs * n
    const gH = cs * n
    const oX = labelW + (availW - gW) / 2 + 10
    const oY = topLabelH + (availH - gH) / 2

    return (
      <div style={isMobile ? { overflowX: 'auto', WebkitOverflowScrolling: 'touch' } : {}}>
        <svg width={Math.max(containerW, oX + gW + 10)} height={oY + gH + 10} style={{ display: 'block' }}>
          {/* Row labels */}
          {heatmapKraje.map((kraj, i) => (
            <text key={`row-${i}`} x={oX - 8} y={oY + i * cs + cs / 2}
              textAnchor="end" dominantBaseline="central" fontSize={Math.min(11, cs * 0.38)} fill="#0A416E" fontWeight={500}>
              {kraj.short}
            </text>
          ))}

          {/* Column labels (rotated) */}
          {heatmapKraje.map((kraj, j) => (
            <text key={`col-${j}`} x={0} y={0} textAnchor="start" fontSize={Math.min(11, cs * 0.38)} fill="#0A416E" fontWeight={500}
              transform={`translate(${oX + j * cs + cs / 2}, ${oY - 8}) rotate(-55)`}>
              {kraj.short}
            </text>
          ))}

          {/* Cells */}
          {matrix.cells.map(({ row, col, val, shared }) => {
            const isDiag = row === col
            return (
              <rect key={`${row}-${col}`}
                x={oX + col * cs} y={oY + row * cs}
                width={cs - 1} height={cs - 1}
                fill={isDiag ? '#355410' : heatColorScale(val)}
                rx={2} style={{ cursor: isDiag ? 'default' : 'pointer' }}
                onMouseMove={(e) => {
                  if (isDiag) return
                  setTooltip({
                    x: e.clientX, y: e.clientY, type: 'heat',
                    krajA: heatmapKraje[row].short, krajB: heatmapKraje[col].short,
                    jaccard: val, shared,
                  })
                }}
                onMouseLeave={() => setTooltip(null)}
              />
            )
          })}

          {/* Cell values */}
          {matrix.cells.filter(c => c.row !== c.col).map(({ row, col, val }) => {
            const needsWhite = val > 0.30
            return (
              <text key={`t-${row}-${col}`}
                x={oX + col * cs + (cs - 1) / 2}
                y={oY + row * cs + (cs - 1) / 2}
                textAnchor="middle" dominantBaseline="central"
                fontSize={cs > 36 ? 9 : 7} fill={val === 0 ? '#999' : needsWhite ? '#fff' : '#2a3d1a'}
                fontWeight={500} style={{ pointerEvents: 'none' }}>
                {val === 0 ? '' : val.toFixed(2).replace('0.', '.')}
              </text>
            )
          })}
        </svg>
      </div>
    )
  }

  // ── Tooltip ──
  const tooltipEl = tooltip && (
    <div className="map-tooltip" style={{
      left: Math.min(tooltip.x + 12, width - 300),
      top: Math.max(tooltip.y - 10, 10),
    }}>
      {tooltip.type === 'map' && tooltip.info ? (
        <>
          <div className="tooltip-title">{tooltip.name}</div>
          {tooltip.info.hasNace ? (
            <>
              <div className="tooltip-value">Průměrný Jaccard: <strong>{fmt(tooltip.info.avgJaccard)}</strong></div>
              <div className="tooltip-value" style={{ marginTop: 4 }}>
                Domén: <strong>{tooltip.info.domenyCount}</strong> &middot;
                NACE kódů: <strong>{tooltip.info.codes.size}</strong>
              </div>
              <div className="tooltip-value" style={{ fontSize: 12, marginTop: 3 }}>
                <span style={{ color: '#2DA547', fontWeight: 700 }}>{tooltip.info.unique} unikátních</span>
                {tooltip.info.uniqueList.length > 0 && (
                  <span style={{ color: '#2DA547', fontSize: 10 }}> ({tooltip.info.uniqueList.join(', ')})</span>
                )}
              </div>
              <div className="tooltip-value" style={{ fontSize: 12 }}>
                <span style={{ color: '#777', fontWeight: 600 }}>{tooltip.info.shared} sdílených</span>
                <span style={{ color: '#999', fontSize: 10 }}> s jinými kraji</span>
              </div>
              {tooltip.info.bestPair && (
                <div style={{ fontSize: 11, color: '#888', marginTop: 3, borderTop: '1px solid #eee', paddingTop: 3 }}>
                  Nejpodobnější: {tooltip.info.bestPair.name} (J={fmt(tooltip.info.bestPair.jaccard)})
                </div>
              )}
            </>
          ) : (
            <div className="tooltip-value" style={{ fontSize: 12, color: '#999' }}>
              Domény definovány popisně, bez CZ-NACE kódů
            </div>
          )}
        </>
      ) : tooltip.type === 'heat' ? (
        <>
          <div className="tooltip-title">{tooltip.krajA} × {tooltip.krajB}</div>
          <div className="tooltip-value">Jaccard: <strong>{fmt(tooltip.jaccard)}</strong></div>
          {tooltip.shared.length > 0 ? (
            <div style={{ fontSize: 11, color: '#666', marginTop: 3 }}>
              Sdílené kódy ({tooltip.shared.length}): {tooltip.shared.join(', ')}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: '#999', marginTop: 3 }}>Žádné společné NACE kódy</div>
          )}
        </>
      ) : null}
    </div>
  )

  // ── Legend content ──
  const mapLegendContent = (compact = false) => (
    <>
      <div style={{ fontSize: 'clamp(9px, 1.2vw, 12px)' }} className="font-medium text-[#0A416E] mb-1 sm:mb-2">Kartogram — průměrná Jaccard podobnost</div>
      <div className="flex items-end gap-0.5">
        {MAP_COLORS.map((color, i) => (
          <div key={i} className="flex flex-col items-center">
            <div style={{ width: 28, height: 14, background: color, borderRadius: 2 }} />
            <span className="text-[9px] text-[#555] mt-0.5">
              {i === 0 && quantiles[0] != null ? `<${fmt(quantiles[0])}` : ''}
              {i > 0 && i < MAP_COLORS.length - 1 && quantiles[i] != null ? fmt(quantiles[i - 1]) : ''}
              {i === MAP_COLORS.length - 1 && quantiles.length > 0 ? `>${fmt(quantiles[quantiles.length - 1])}` : ''}
            </span>
          </div>
        ))}
      </div>
      {!compact && (
        <>
          <div className="flex items-center gap-2 mt-2">
            <div style={{ width: 14, height: 10, background: '#c0c0c0', borderRadius: 2 }} />
            <span className="text-[10px] text-[#777]">bez CZ-NACE kódů</span>
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <svg width={20} height={20}>
              <circle cx={10} cy={10} r={9} fill="white" stroke="#ddd" strokeWidth={0.5} />
              <path d={d3.arc()({ innerRadius: 6, outerRadius: 9, startAngle: 0, endAngle: Math.PI * 0.8 })}
                transform="translate(10,10)" fill="#2DA547" opacity={0.8} />
              <path d={d3.arc()({ innerRadius: 6, outerRadius: 9, startAngle: Math.PI * 0.8, endAngle: Math.PI * 2 })}
                transform="translate(10,10)" fill="#CDCDD2" opacity={0.6} />
              <text x={10} y={10} textAnchor="middle" dominantBaseline="central" fontSize={7} fill="#2DA547" fontWeight={700}>4</text>
            </svg>
            <span className="text-[10px] text-[#777]">
              <span style={{ color: '#2DA547', fontWeight: 600 }}>unikátní</span> / celkem NACE
            </span>
          </div>
        </>
      )}
    </>
  )

  const heatLegendContent = (compact = false) => (
    <>
      <div style={{ fontSize: 'clamp(9px, 1.2vw, 12px)' }} className="font-medium text-[#0A416E] mb-1 sm:mb-2">Heatmapa — párový Jaccard index</div>
      <svg width={Math.min(156, width * 0.25)} height="28" viewBox="0 0 156 28">
        {STEPS.map((step, i) => (
          <g key={i}>
            <rect x={i * 26} y={0} width={25} height={12} rx={1} fill={step.color} />
            <text x={i * 26 + 12.5} y={24} textAnchor="middle" fontSize={8} fill="#777">
              {step.max === Infinity ? '>.42' : `≤${step.max.toFixed(2)}`}
            </text>
          </g>
        ))}
      </svg>
      {!compact && (
        <div className="flex items-center gap-2 mt-2">
          <div style={{ width: 14, height: 10, background: '#ececec', borderRadius: 2 }} />
          <span className="text-[10px] text-[#777]">žádný sdílený kód</span>
        </div>
      )}
    </>
  )

  const commentaryContent = (
    <p className="text-[#0A416E] leading-relaxed" style={{ fontSize: 'clamp(9px, 1.2vw, 12px)' }}>
      Nejpodobnější dvojice: {matrix.bestPair.names[0]} a {matrix.bestPair.names[1]} (J={fmt(matrix.bestPair.val)}).
      Průměrná podobnost: {fmt(stats.avg)}. Pozor: podrobnost NACE klasifikace se mezi kraji výrazně liší (viz ℹ️).
    </p>
  )

  const sourceText = 'Zdroj: Příloha 2 NRIS3 v08 (MPO, 2026) · Geodata: ArcČR © ČÚZK, ČSÚ, ARCDATA PRAHA 2024, CC-BY 4.0'

  // ════════════════════════════════════════
  // DESKTOP LAYOUT (>1024px) — original side-by-side with absolute overlays
  // ════════════════════════════════════════
  if (isDesktop) {
    // Heatmap positioning — right side
    const hmLeft = width * (isCompact ? 0.58 : 0.62)
    const hmTop = height * (isCompact ? 0.32 : 0.36)
    const labelW = Math.min(85, width * 0.065)
    const topLabelH = Math.min(65, height * 0.08)
    const availW = width * (isCompact ? 0.39 : 0.35) - labelW
    const availH = height * (isCompact ? 0.52 : 0.48) - topLabelH
    const cellSize = Math.max(12, Math.min(Math.floor(availW / n), Math.floor(availH / n), 28))
    const gridW = cellSize * n
    const gridH = cellSize * n
    const offsetX = hmLeft + labelW + (availW - gridW) / 2
    const offsetY = hmTop + topLabelH + (availH - gridH) / 2

    return (
      <div className="w-full h-full bg-[#f8f9fa] relative overflow-hidden">
        <InfoPanel text={INFO_TEXT} />

        {/* Title */}
        <div className="absolute top-3 sm:top-5 left-4 sm:left-8 z-10" style={{ maxWidth: width * 0.55 }}>
          <h2 className="font-bold text-[#0A416E]" style={{ fontSize: 'clamp(0.9rem, 2.5vw, 1.5rem)' }}>
            Podobnost domén specializace — Jaccard index CZ-NACE kódů
          </h2>
          <p className="text-[#777] mt-1" style={{ fontSize: 'clamp(0.6rem, 1.2vw, 0.875rem)' }}>
            Kartogram = průměrná podobnost vůči ostatním &middot; Heatmapa = párové srovnání {heatmapKraje.length} krajů s NACE kódy
          </p>
        </div>

        <svg width={width} height={height} className="absolute inset-0">
          {/* Map */}
          <g>
            {geoData.features.map((feature) => {
              const nuts = feature.properties.nutslau
              const info = krajInfo[nuts]
              const hasData = info?.hasNace
              return (
                <path
                  key={nuts}
                  d={pathGenerator(feature)}
                  className="kraj-path"
                  fill={hasData ? mapColorScale(info.avgJaccard) : '#c0c0c0'}
                  stroke="#fff"
                  strokeWidth={1.5}
                  onMouseMove={(e) => {
                    setTooltip({ x: e.clientX, y: e.clientY, type: 'map', name: feature.properties.nazev, info })
                  }}
                  onMouseLeave={() => setTooltip(null)}
                />
              )
            })}
          </g>

          {/* Map overlay rings */}
          {Object.entries(centroids).map(([nuts, [cx, cy]]) => {
            const info = krajInfo[nuts]
            if (!info) return null
            if (!info.hasNace) {
              return (
                <text key={`label-${nuts}`} x={cx} y={cy}
                  textAnchor="middle" dominantBaseline="central"
                  fontSize={fs(9)} fill="#999" fontStyle="italic"
                  style={{ pointerEvents: 'none' }}>
                  bez NACE
                </text>
              )
            }
            const total = info.codes.size
            const uniq = info.unique
            const ringR = Math.max(12, Math.min(18, Math.min(width, height) * 0.018))
            const uniqueRatio = total > 0 ? uniq / total : 0
            return (
              <g key={`label-${nuts}`} style={{ pointerEvents: 'none' }}>
                <circle cx={cx} cy={cy} r={ringR}
                  fill="rgba(255,255,255,0.92)" stroke="rgba(10,65,110,0.15)" strokeWidth={0.5} />
                {uniqueRatio > 0 && (
                  <path d={d3.arc()({ innerRadius: ringR - 3, outerRadius: ringR, startAngle: 0, endAngle: uniqueRatio * Math.PI * 2 })}
                    transform={`translate(${cx},${cy})`} fill="#2DA547" opacity={0.8} />
                )}
                {uniqueRatio < 1 && (
                  <path d={d3.arc()({ innerRadius: ringR - 3, outerRadius: ringR, startAngle: uniqueRatio * Math.PI * 2, endAngle: Math.PI * 2 })}
                    transform={`translate(${cx},${cy})`} fill="#CDCDD2" opacity={0.6} />
                )}
                <text x={cx} y={cy - 3} textAnchor="middle" dominantBaseline="central" fontSize={fs(13)} fontWeight={700}>
                  <tspan fill="#2DA547">{uniq}</tspan>
                  <tspan fill="#AAAAAA" fontSize={fs(10)}> / {total}</tspan>
                </text>
                <text x={cx} y={cy + 10} textAnchor="middle" fontSize={fs(7)} fill="#777">unik. NACE</text>
              </g>
            )
          })}

          {/* Heatmap */}
          {heatmapKraje.map((kraj, i) => (
            <text key={`row-${i}`} x={offsetX - 8} y={offsetY + i * cellSize + cellSize / 2}
              textAnchor="end" dominantBaseline="central" fontSize={Math.min(11, cellSize * 0.38)} fill="#0A416E" fontWeight={500}>
              {kraj.short}
            </text>
          ))}
          {heatmapKraje.map((kraj, j) => (
            <text key={`col-${j}`} x={0} y={0} textAnchor="start" fontSize={Math.min(11, cellSize * 0.38)} fill="#0A416E" fontWeight={500}
              transform={`translate(${offsetX + j * cellSize + cellSize / 2}, ${offsetY - 8}) rotate(-55)`}>
              {kraj.short}
            </text>
          ))}
          {matrix.cells.map(({ row, col, val, shared }) => {
            const isDiag = row === col
            return (
              <rect key={`${row}-${col}`}
                x={offsetX + col * cellSize} y={offsetY + row * cellSize}
                width={cellSize - 1} height={cellSize - 1}
                fill={isDiag ? '#355410' : heatColorScale(val)}
                rx={2} style={{ cursor: isDiag ? 'default' : 'pointer' }}
                onMouseMove={(e) => {
                  if (isDiag) return
                  setTooltip({
                    x: e.clientX, y: e.clientY, type: 'heat',
                    krajA: heatmapKraje[row].short, krajB: heatmapKraje[col].short,
                    jaccard: val, shared,
                  })
                }}
                onMouseLeave={() => setTooltip(null)}
              />
            )
          })}
          {matrix.cells.filter(c => c.row !== c.col).map(({ row, col, val }) => {
            const needsWhite = val > 0.30
            return (
              <text key={`t-${row}-${col}`}
                x={offsetX + col * cellSize + (cellSize - 1) / 2}
                y={offsetY + row * cellSize + (cellSize - 1) / 2}
                textAnchor="middle" dominantBaseline="central"
                fontSize={cellSize > 36 ? 9 : 7} fill={val === 0 ? '#999' : needsWhite ? '#fff' : '#2a3d1a'}
                fontWeight={500} style={{ pointerEvents: 'none' }}>
                {val === 0 ? '' : val.toFixed(2).replace('0.', '.')}
              </text>
            )
          })}
        </svg>

        {tooltipEl}

        {/* Map legend — bottom left */}
        <div className="absolute z-10 bg-white/90 rounded-lg px-3 py-2 shadow-sm"
          style={{ bottom: isCompact ? 32 : Math.max(60, height * 0.08), left: 8 }}>
          {mapLegendContent(isCompact)}
        </div>

        {/* Heatmap legend — bottom right */}
        <div className="absolute z-10 bg-white/90 rounded-lg px-3 py-2 shadow-sm"
          style={{ bottom: isCompact ? 32 : Math.max(60, height * 0.08), right: width * 0.60 > 700 ? width - (offsetX + gridW + 8) : 8 }}>
          {heatLegendContent(isCompact)}
        </div>

        {/* Commentary — centered bottom */}
        <div className="absolute z-10 bg-white/90 rounded-lg px-3 py-2 shadow-sm"
          style={{ bottom: isCompact ? 32 : Math.max(60, height * 0.08), left: '50%', transform: 'translateX(-50%)', maxWidth: isCompact ? 340 : 448 }}>
          {commentaryContent}
        </div>

        {/* Source */}
        <div className="absolute bottom-2 sm:bottom-4 left-0 right-0 text-center text-[#777] z-10 px-4" style={{ fontSize: 'clamp(7px, 1vw, 10px)' }}>
          {sourceText}
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════
  // TABLET + MOBILE — flow column
  // ════════════════════════════════════════
  const hmContainerW = width - 32
  const hmContainerH = isTablet ? height * 0.38 : height * 0.36

  return (
    <div className="w-full h-full bg-[#f8f9fa] overflow-y-auto flex flex-col">
      <InfoPanel text={INFO_TEXT} />

      {/* Title */}
      <div className="px-4 pt-3 pb-1">
        <h2 className="font-bold text-[#0A416E]" style={{ fontSize: 'clamp(0.9rem, 2.5vw, 1.5rem)' }}>
          Podobnost domén specializace — Jaccard index CZ-NACE kódů
        </h2>
        <p className="text-[#777] mt-1" style={{ fontSize: 'clamp(0.6rem, 1.2vw, 0.875rem)' }}>
          Kartogram = průměrná podobnost vůči ostatním &middot; Heatmapa = párové srovnání {heatmapKraje.length} krajů s NACE kódy
        </p>
      </div>

      {/* Map */}
      <div className="relative" style={{ height: mapSvgH, minHeight: 220, flexShrink: 0 }}>
        {renderMap(width, mapSvgH)}
      </div>

      {/* Heatmap */}
      <div className="px-4 flex-shrink-0" style={{ minHeight: hmContainerH }}>
        {renderHeatmap(hmContainerW, hmContainerH)}
      </div>

      {tooltipEl}

      {/* Panels below visualizations */}
      <div className="px-4 py-2 flex flex-col gap-2 flex-shrink-0">
        {/* Legends */}
        {isMobile ? (
          <>
            <div className="bg-white/90 rounded-lg px-3 py-2 shadow-sm flex flex-wrap gap-4">
              <div className="flex-1 min-w-[140px]">{mapLegendContent(true)}</div>
              <div className="flex-1 min-w-[140px]">{heatLegendContent(true)}</div>
            </div>
            <CollapsiblePanel title="Komentář a vysvětlivky">
              {commentaryContent}
              <div className="mt-2 pt-2 border-t border-gray-200">
                {mapLegendContent(false)}
              </div>
            </CollapsiblePanel>
          </>
        ) : (
          <>
            <div className="flex gap-3">
              <div className="bg-white/90 rounded-lg px-3 py-2 shadow-sm flex-1">
                {mapLegendContent(false)}
              </div>
              <div className="bg-white/90 rounded-lg px-3 py-2 shadow-sm flex-1">
                {heatLegendContent(false)}
              </div>
            </div>
            <div className="bg-white/90 rounded-lg px-3 py-2 shadow-sm">
              {commentaryContent}
            </div>
          </>
        )}

        {/* Source */}
        <div className="text-center text-[#777] py-1 px-2" style={{ fontSize: 'clamp(7px, 1vw, 10px)' }}>
          {sourceText}
        </div>
      </div>
    </div>
  )
}
