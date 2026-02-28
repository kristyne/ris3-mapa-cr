import { useState, useEffect, useMemo } from 'react'
import * as d3 from 'd3'
import InfoPanel from '../InfoPanel'

const INFO_TEXT = `Sémantická podobnost se počítá pomocí jazykového modelu (sentence-transformers), který převádí texty popisů domén z krajských karet na vektory (embeddings). Cosine similarity těchto vektorů měří, jak obsahově blízké si popisy jsou — nezávisle na tom, jaké CZ-NACE kódy krajská karta formálně uvádí. Scatter plot porovnává oba přístupy: osa X = Jaccardova podobnost NACE kódů, osa Y = sémantická podobnost textů. Body mimo diagonálu ukazují rozpor mezi formální a obsahovou podobností.`

const NUTS_BY_NAME = {
  'Hl. m. Praha': 'CZ010', 'Středočeský kraj': 'CZ020', 'Jihočeský kraj': 'CZ031',
  'Plzeňský kraj': 'CZ032', 'Karlovarský kraj': 'CZ041', 'Ústecký kraj': 'CZ042',
  'Liberecký kraj': 'CZ051', 'Královéhradecký kraj': 'CZ052', 'Pardubický kraj': 'CZ053',
  'Vysočina': 'CZ063', 'Jihomoravský kraj': 'CZ064', 'Olomoucký kraj': 'CZ071',
  'Zlínský kraj': 'CZ072', 'Moravskoslezský kraj': 'CZ080',
}

const SHORT = {
  'Hl. m. Praha': 'PHA', 'Středočeský kraj': 'STČ', 'Jihočeský kraj': 'JHČ',
  'Plzeňský kraj': 'PLK', 'Karlovarský kraj': 'KVK', 'Ústecký kraj': 'ULK',
  'Liberecký kraj': 'LBK', 'Královéhradecký kraj': 'HKK', 'Pardubický kraj': 'PAK',
  'Vysočina': 'VYS', 'Jihomoravský kraj': 'JHM', 'Olomoucký kraj': 'OLK',
  'Zlínský kraj': 'ZLK', 'Moravskoslezský kraj': 'MSK',
}

const SHORT_NAMES = {
  'Hl. m. Praha': 'Praha', 'Středočeský kraj': 'Středočeský', 'Jihočeský kraj': 'Jihočeský',
  'Plzeňský kraj': 'Plzeňský', 'Karlovarský kraj': 'Karlovarský', 'Ústecký kraj': 'Ústecký',
  'Liberecký kraj': 'Liberecký', 'Královéhradecký kraj': 'Královéhradecký', 'Pardubický kraj': 'Pardubický',
  'Vysočina': 'Vysočina', 'Jihomoravský kraj': 'Jihomoravský', 'Olomoucký kraj': 'Olomoucký',
  'Zlínský kraj': 'Zlínský', 'Moravskoslezský kraj': 'Moravskoslezský',
}

function computeJaccard(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0
  const intersection = new Set([...setA].filter(x => setB.has(x)))
  const union = new Set([...setA, ...setB])
  return intersection.size / union.size
}

export default function SlideSemantic() {
  const [krajeGeo, setKrajeGeo] = useState(null)
  const [okresyGeo, setOkresyGeo] = useState(null)
  const [semData, setSemData] = useState(null)
  const [domenyData, setDomenyData] = useState(null)
  const [tooltip, setTooltip] = useState(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  useEffect(() => {
    Promise.all([
      fetch(`${import.meta.env.BASE_URL}data/kraje.geojson`).then(r => r.json()),
      fetch(`${import.meta.env.BASE_URL}data/okresy.geojson`).then(r => r.json()),
      fetch(`${import.meta.env.BASE_URL}data/semanticka_podobnost.json`).then(r => r.json()),
      fetch(`${import.meta.env.BASE_URL}data/domeny_kraje.json`).then(r => r.json()),
    ]).then(([kraje, okresy, sem, domeny]) => {
      setKrajeGeo(kraje)
      setOkresyGeo(okresy)
      setSemData(sem)
      setDomenyData(domeny)
    })
  }, [])

  useEffect(() => {
    const update = () => setDimensions({ width: window.innerWidth, height: window.innerHeight })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // Jaccard data (for scatter plot) — filter out kraje without NACE codes
  const { jaccardPairs, krajeWithoutNace } = useMemo(() => {
    if (!domenyData) return { jaccardPairs: [], krajeWithoutNace: [] }
    const krajNace = {}
    const noNace = []
    for (const [name, info] of Object.entries(domenyData.kraje)) {
      const codes = new Set()
      for (const d of info.domeny || []) {
        for (const c of d.cz_nace || []) codes.add(c)
      }
      krajNace[name] = codes
      if (codes.size === 0) noNace.push(SHORT[name] || name)
    }

    // Only include pairs where BOTH kraje have NACE codes
    const pairs = []
    const names = Object.keys(krajNace).filter(n => krajNace[n].size > 0)
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const jaccard = computeJaccard(krajNace[names[i]], krajNace[names[j]])
        pairs.push({
          a: names[i], b: names[j],
          shortA: SHORT[names[i]] || names[i], shortB: SHORT[names[j]] || names[j],
          jaccard,
        })
      }
    }

    // Count filtered pairs
    const totalKraje = Object.keys(krajNace).length
    const withNace = names.length
    const allPairs = totalKraje * (totalKraje - 1) / 2
    const keptPairs = withNace * (withNace - 1) / 2
    const filteredCount = allPairs - keptPairs

    return { jaccardPairs: pairs, krajeWithoutNace: noNace, filteredPairCount: filteredCount }
  }, [domenyData])

  // Combined scatter data with semantic similarity
  const scatterData = useMemo(() => {
    if (!semData || jaccardPairs.length === 0) return []
    return jaccardPairs.map(p => {
      const semSim = semData.matrix[p.a]?.[p.b] ?? semData.matrix[p.b]?.[p.a] ?? null
      return { ...p, semantic: semSim }
    }).filter(p => p.semantic !== null)
  }, [semData, jaccardPairs])

  // Identify outlier points for labeling
  const outlierPoints = useMemo(() => {
    if (scatterData.length === 0) return { highSemLowJac: [], highBoth: [], lowSem: [] }

    // Sort by semantic - jaccard difference (biggest gap = most interesting)
    const sorted = [...scatterData].sort((a, b) => (b.semantic - b.jaccard) - (a.semantic - a.jaccard))

    // Top 3: high semantic, low jaccard (similar texts, different codes)
    const highSemLowJac = sorted.filter(d => d.jaccard < 0.15 && d.semantic > 0.5).slice(0, 3)

    // Top 3: both high (similar codes AND texts)
    const highBoth = [...scatterData]
      .filter(d => d.jaccard > 0.25 && d.semantic > 0.5)
      .sort((a, b) => (b.jaccard + b.semantic) - (a.jaccard + a.semantic))
      .slice(0, 2)

    // Lowest semantic similarity
    const lowSem = [...scatterData].sort((a, b) => a.semantic - b.semantic).slice(0, 2)

    return { highSemLowJac, highBoth, lowSem }
  }, [scatterData])

  // Map color scale
  const mapColorScale = useMemo(() => {
    if (!semData) return () => '#eee'
    const values = Object.values(semData.avg_similarity)
    return d3.scaleSequential()
      .domain([Math.min(...values), Math.max(...values)])
      .interpolator(t => d3.interpolateRgb('#f0f7e6', '#5A8A1C')(Math.pow(t, 0.7)))
  }, [semData])

  const projection = useMemo(() => {
    if (!krajeGeo || dimensions.width === 0) return null
    // Map is now secondary — smaller, upper right
    const mapWidth = dimensions.width * 0.32
    const mapHeight = dimensions.height * 0.38
    const proj = d3.geoMercator().fitSize([mapWidth, mapHeight], krajeGeo)
    const [tx, ty] = proj.translate()
    proj.translate([tx + dimensions.width * 0.62, ty + dimensions.height * 0.12])
    return proj
  }, [krajeGeo, dimensions])

  const pathGenerator = useMemo(() => {
    if (!projection) return null
    return d3.geoPath().projection(projection)
  }, [projection])

  // Centroids for kraj labels on map (with manual fix for Středočeský/Praha overlap)
  const centroids = useMemo(() => {
    if (!krajeGeo || !pathGenerator) return {}
    const result = {}
    for (const feature of krajeGeo.features) {
      const name = feature.properties.nazev
      const [cx, cy] = pathGenerator.centroid(feature)
      if (name === 'Středočeský kraj') {
        result[name] = [cx + 20, cy + 25]
      } else {
        result[name] = [cx, cy]
      }
    }
    return result
  }, [krajeGeo, pathGenerator])

  if (!krajeGeo || !pathGenerator || !semData || scatterData.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#f8f9fa]">
        <p className="text-[#777] text-lg">Načítám data…</p>
      </div>
    )
  }

  const { width, height } = dimensions
  const fmt = (n, d = 2) => n.toLocaleString('cs-CZ', { minimumFractionDigits: d, maximumFractionDigits: d })

  // Scatter plot is now the primary element — larger, left/center
  const scatter = {
    x: width * 0.08,
    y: height * 0.20,
    w: width * 0.50,
    h: height * 0.55,
  }
  const xScale = d3.scaleLinear().domain([0, 0.55]).range([0, scatter.w])
  const yScale = d3.scaleLinear().domain([0.3, 0.75]).range([scatter.h, 0])

  // Check if a point is an outlier (for labeling)
  const allOutliers = new Set([
    ...outlierPoints.highSemLowJac.map(d => `${d.shortA}-${d.shortB}`),
    ...outlierPoints.highBoth.map(d => `${d.shortA}-${d.shortB}`),
    ...outlierPoints.lowSem.map(d => `${d.shortA}-${d.shortB}`),
  ])

  return (
    <div className="w-full h-full bg-[#f8f9fa] relative overflow-hidden">
      <InfoPanel text={INFO_TEXT} />
      {/* Title */}
      <div className="absolute top-4 left-6 z-10" style={{ maxWidth: width * 0.48 }}>
        <h2 className="text-2xl font-bold text-[#0A416E]">
          Co říkají texty krajských karet?
        </h2>
        <p className="text-[13px] text-[#0A416E] mt-1 font-medium">
          Tematická blízkost krajských karet
        </p>
        <p className="text-xs text-[#777] mt-0.5">
          Mapa: průměrná sémantická podobnost textů domén každého kraje vůči ostatním
        </p>
      </div>

      {/* Methodology box — next to map, right side */}
      <div className="absolute z-10 bg-white/95 rounded-lg px-4 py-3 shadow-sm border border-[#E3F2FD]"
        style={{ left: width * 0.62, top: height * 0.54, maxWidth: width * 0.34 }}>
        <p className="text-[11px] text-[#0A416E] leading-snug">
          <strong>Jak číst graf:</strong> Každý bod = jeden <strong>pár krajů</strong>.
          Osa X = jak moc sdílejí CZ-NACE kódy (Jaccard index), osa Y = jak podobně <em>popisují</em> své domény
          (AI čte texty krajských karet a měří obsahovou blízkost).
          Body vlevo nahoře = kraje s podobnými texty, ale jinými NACE kódy.
        </p>
        <p className="text-[11px] text-[#0A416E] leading-snug mt-1">
          <strong>Mapa vpravo:</strong> barva = průměrná sémantická podobnost domén kraje vůči ostatním.
        </p>
      </div>

      <svg width={width} height={height} className="absolute inset-0">
        {/* LEFT: Map */}
        {okresyGeo && (
          <g>
            {okresyGeo.features.map((feature) => (
              <path
                key={`o-${feature.properties.nutslau}`}
                d={pathGenerator(feature)}
                fill="#F0F0F0" stroke="#DDD" strokeWidth={0.5}
              />
            ))}
          </g>
        )}

        {/* Kraje choropleth by semantic similarity */}
        <g>
          {krajeGeo.features.map((feature) => {
            const nuts = feature.properties.nutslau
            const name = feature.properties.nazev
            const avgSem = semData.avg_similarity[name]
            return (
              <path
                key={nuts}
                d={pathGenerator(feature)}
                fill={avgSem != null ? mapColorScale(avgSem) : '#eee'}
                stroke="#fff" strokeWidth={1.5}
                className="kraj-path"
                onMouseMove={(e) => {
                  setTooltip({
                    x: e.clientX, y: e.clientY, type: 'map',
                    name, avgSem,
                    domains: semData.domain_count[name] || 0,
                  })
                }}
                onMouseLeave={() => setTooltip(null)}
              />
            )
          })}
        </g>

        {/* Kraj labels on map */}
        {Object.entries(centroids).map(([name, [cx, cy]]) => {
          const shortName = SHORT_NAMES[name] || name
          return (
            <text key={`ml-${name}`}
              x={cx} y={cy}
              textAnchor="middle" dominantBaseline="central"
              fontSize={8} fontWeight={600} fill="#0A416E"
              opacity={0.7} style={{ pointerEvents: 'none' }}>
              {shortName}
            </text>
          )
        })}

        {/* RIGHT: Scatter plot */}
        <g transform={`translate(${scatter.x}, ${scatter.y})`}>
          {/* Background annotation zones */}
          {/* Top-left zone: "Podobné texty, jiné kódy" */}
          <rect x={xScale(0)} y={yScale(0.75)} width={xScale(0.15)} height={yScale(0.5) - yScale(0.75)}
            fill="#5A8A1C" opacity={0.05} rx={4} />
          <text x={xScale(0.075)} y={yScale(0.73)} textAnchor="middle" fontSize={8} fill="#5A8A1C" opacity={0.7} fontWeight={500}>
            Podobné texty,
          </text>
          <text x={xScale(0.075)} y={yScale(0.73) + 10} textAnchor="middle" fontSize={8} fill="#5A8A1C" opacity={0.7} fontWeight={500}>
            jiné kódy
          </text>

          {/* Top-right zone: "Podobné kódy i texty" */}
          <rect x={xScale(0.30)} y={yScale(0.75)} width={xScale(0.55) - xScale(0.30)} height={yScale(0.5) - yScale(0.75)}
            fill="#0A416E" opacity={0.04} rx={4} />
          <text x={xScale(0.425)} y={yScale(0.73)} textAnchor="middle" fontSize={8} fill="#0A416E" opacity={0.6} fontWeight={500}>
            Podobné kódy i texty
          </text>

          {/* Axes */}
          <line x1={0} y1={scatter.h} x2={scatter.w} y2={scatter.h} stroke="#ccc" />
          <line x1={0} y1={0} x2={0} y2={scatter.h} stroke="#ccc" />

          {/* Grid lines */}
          {[0.1, 0.2, 0.3, 0.4, 0.5].map(tick => (
            <line key={`gx-${tick}`} x1={xScale(tick)} y1={0} x2={xScale(tick)} y2={scatter.h}
              stroke="#eee" strokeWidth={0.5} />
          ))}
          {[0.4, 0.5, 0.6, 0.7].map(tick => (
            <line key={`gy-${tick}`} x1={0} y1={yScale(tick)} x2={scatter.w} y2={yScale(tick)}
              stroke="#eee" strokeWidth={0.5} />
          ))}

          {/* X axis ticks */}
          {[0, 0.1, 0.2, 0.3, 0.4, 0.5].map(tick => (
            <g key={`xt-${tick}`} transform={`translate(${xScale(tick)}, ${scatter.h})`}>
              <line y2={4} stroke="#ccc" />
              <text y={16} textAnchor="middle" fontSize={9} fill="#777">{tick}</text>
            </g>
          ))}
          <text x={scatter.w / 2} y={scatter.h + 36} textAnchor="middle" fontSize={12} fill="#0A416E" fontWeight={700}>
            Formální podobnost — sdílené CZ-NACE kódy (Jaccard index)
          </text>

          {/* Y axis ticks */}
          {[0.3, 0.4, 0.5, 0.6, 0.7].map(tick => (
            <g key={`yt-${tick}`} transform={`translate(0, ${yScale(tick)})`}>
              <line x2={-4} stroke="#ccc" />
              <text x={-8} textAnchor="end" dominantBaseline="central" fontSize={9} fill="#777">{tick}</text>
            </g>
          ))}
          <text
            transform={`translate(-42, ${scatter.h / 2}) rotate(-90)`}
            textAnchor="middle" fontSize={12} fill="#0A416E" fontWeight={700}>
            Obsahová podobnost — AI embedding textů domén
          </text>

          {/* Diagonal reference line */}
          <line
            x1={xScale(0)} y1={yScale(0.3)} x2={xScale(0.55)} y2={yScale(0.55 + 0.15)}
            stroke="#ddd" strokeWidth={1} strokeDasharray="4,4"
          />

          {/* Data points */}
          {scatterData.map((d, i) => {
            const cx = xScale(d.jaccard)
            const cy = yScale(d.semantic)
            const bothHaveNace = d.jaccard > 0
            const isOutlier = allOutliers.has(`${d.shortA}-${d.shortB}`)
            return (
              <circle
                key={i}
                cx={cx} cy={cy} r={isOutlier ? 7 : 5}
                fill={bothHaveNace ? '#0A416E' : '#9B9BA0'}
                opacity={isOutlier ? 0.9 : 0.6}
                stroke={isOutlier ? '#0A416E' : 'white'}
                strokeWidth={isOutlier ? 1.5 : 0.5}
                style={{ cursor: 'pointer' }}
                onMouseMove={(e) => {
                  setTooltip({ x: e.clientX, y: e.clientY, type: 'scatter', ...d })
                }}
                onMouseLeave={() => setTooltip(null)}
              />
            )
          })}

          {/* Labels for outlier points */}
          {[...outlierPoints.highSemLowJac, ...outlierPoints.highBoth, ...outlierPoints.lowSem].map((d, i) => {
            const cx = xScale(d.jaccard)
            const cy = yScale(d.semantic)
            // Offset labels to avoid overlap
            const offsetDir = d.jaccard < 0.15 ? 1 : -1
            return (
              <text key={`lbl-${i}`}
                x={cx + 8 * offsetDir} y={cy - 8}
                textAnchor={offsetDir > 0 ? 'start' : 'end'}
                fontSize={8} fill="#0A416E" fontWeight={500}
                style={{ pointerEvents: 'none' }}>
                {d.shortA}–{d.shortB}
              </text>
            )
          })}
        </g>
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div className="map-tooltip" style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}>
          {tooltip.type === 'map' ? (
            <>
              <div className="tooltip-title">{tooltip.name}</div>
              <div className="tooltip-value">
                Průměrná sémantická podobnost: <strong>{fmt(tooltip.avgSem)}</strong>
              </div>
              <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                Domén: {tooltip.domains}
              </div>
            </>
          ) : (
            <>
              <div className="tooltip-title">{tooltip.shortA} × {tooltip.shortB}</div>
              <div className="tooltip-value">
                Jaccard (NACE kódy): <strong>{fmt(tooltip.jaccard)}</strong>
              </div>
              <div className="tooltip-value">
                Sémantická (texty): <strong>{fmt(tooltip.semantic)}</strong>
              </div>
              {tooltip.jaccard === 0 && tooltip.semantic > 0.5 && (
                <div style={{ fontSize: 11, color: '#5A8A1C', marginTop: 2, fontWeight: 500 }}>
                  Podobné texty, ale žádné společné NACE kódy
                </div>
              )}
              {tooltip.jaccard > 0.3 && tooltip.semantic > 0.5 && (
                <div style={{ fontSize: 11, color: '#0A416E', marginTop: 2, fontWeight: 500 }}>
                  Shoda v kódech i textech
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Map legend — under the map, right side */}
      <div className="absolute z-10 bg-white/90 rounded-lg px-4 py-3 shadow-sm" style={{ right: 24, top: height * 0.50, maxWidth: width * 0.22 }}>
        <div className="text-xs font-medium text-[#0A416E] mb-2">Sémantická podobnost (mapa)</div>
        <svg width="120" height="28">
          <defs>
            <linearGradient id="legend-sem">
              <stop offset="0%" stopColor="#f0f7e6" />
              <stop offset="100%" stopColor="#5A8A1C" />
            </linearGradient>
          </defs>
          <rect y="0" width="120" height="12" rx="2" fill="url(#legend-sem)" />
          <text x="0" y="24" fontSize={9} fill="#777">nízká</text>
          <text x="120" y="24" textAnchor="end" fontSize={9} fill="#777">vysoká</text>
        </svg>
      </div>

      {/* Commentary box — bottom left, under scatter */}
      <div className="absolute bottom-20 left-8 z-10 bg-white/90 rounded-lg px-4 py-3 shadow-sm" style={{ maxWidth: width * 0.55 }}>
        <p className="text-xs text-[#0A416E] leading-relaxed">
          <strong>Postup:</strong> Texty popisů domén z krajských karet (Příloha 2 NRIS3) byly převedeny
          jazykovým modelem na číselné vektory (embeddings). Cosine similarity těchto vektorů měří,
          jak obsahově blízké si popisy jsou — nezávisle na formálních NACE kódech.
          Graf porovnává oba pohledy: sdílené kódy (osa X) vs. obsahovou podobnost textů (osa Y).
        </p>
      </div>

      {/* Filtered pairs note */}
      {krajeWithoutNace.length > 0 && (
        <div className="absolute z-10 text-[10px] text-[#777] italic" style={{ left: width * 0.08, bottom: height * 0.18, maxWidth: width * 0.50 }}>
          Vyřazeno {Math.round(krajeWithoutNace.length * (14 - 1) - krajeWithoutNace.length * (krajeWithoutNace.length - 1) / 2)} párů
          zahrnujících kraje bez CZ-NACE klasifikace domén ({krajeWithoutNace.join(', ')}).
        </div>
      )}

      {/* Source */}
      <div className="absolute bottom-4 left-0 right-0 text-center text-[10px] text-[#777] z-10">
        Zdroj: Příloha 2 NRIS3 v08 (MPO, 2026) &middot; Embeddings: paraphrase-multilingual-MiniLM-L12-v2
      </div>
    </div>
  )
}
