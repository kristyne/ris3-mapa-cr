import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import * as d3 from 'd3'
import InfoPanel from '../InfoPanel'

const INFO_TEXT = `Tento slide kombinuje tři pohledy na tematickou blízkost krajů podle textů domén specializace z krajských karet (Příloha 2 NRIS3):

Kartogram (vlevo nahoře): Barva kraje = průměrná sémantická podobnost jeho domén vůči ostatním krajům. Čím tmavší zelená, tím blíže je kraj průměrně ostatním.

Síťový graf (vpravo dole): Každý uzel = kraj. Hrana existuje, pokud sémantická podobnost domén překročí práh 0.45. Uzly lze přetahovat myší, najetím se zvýrazní spojení. Velikost uzlu = počet domén, obrys = podrobnost popisu.

Scatter plot (vlevo dole): Každý bod = pár krajů. Osa X = sdílené CZ-NACE kódy (Jaccard), osa Y = sémantická podobnost textů. Body mimo diagonálu ukazují rozpor mezi formální a obsahovou podobností.

Sémantická podobnost se počítá pomocí jazykového modelu (sentence-transformers), který převádí texty na vektory (embeddings). Cosine similarity měří obsahovou blízkost nezávisle na formálních NACE kódech.`

const ACRONYM = {
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

const EDGE_THRESHOLD = 0.45

// Purple choropleth palette — TC brand Pantone 526 C (rgb 85,40,125 = #55287D)
const MAP_CHOROPLETH = ['#EDE0F5', '#C9A2E0', '#9B62BF', '#7B3FA5', '#55287D']

const NO_NACE_KRAJE = new Set([
  'Hl. m. Praha', 'Olomoucký kraj', 'Ústecký kraj', 'Zlínský kraj',
])

const AVG_TEXT_LEN = {
  'Hl. m. Praha': 271, 'Jihočeský kraj': 206, 'Jihomoravský kraj': 35,
  'Karlovarský kraj': 282, 'Královéhradecký kraj': 614, 'Liberecký kraj': 485,
  'Moravskoslezský kraj': 1162, 'Olomoucký kraj': 98, 'Pardubický kraj': 773,
  'Plzeňský kraj': 340, 'Středočeský kraj': 105, 'Ústecký kraj': 51,
  'Vysočina': 263, 'Zlínský kraj': 358,
}

function computeJaccard(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0
  const intersection = new Set([...setA].filter(x => setB.has(x)))
  const union = new Set([...setA, ...setB])
  return intersection.size / union.size
}

export default function SlideSemanticMerged() {
  const [krajeGeo, setKrajeGeo] = useState(null)
  const [okresyGeo, setOkresyGeo] = useState(null)
  const [semData, setSemData] = useState(null)
  const [domenyData, setDomenyData] = useState(null)
  const [tooltip, setTooltip] = useState(null)
  const [hoveredNode, setHoveredNode] = useState(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [nodes, setNodes] = useState([])
  const [links, setLinks] = useState([])
  const simRef = useRef(null)
  const dragRef = useRef(null)
  const svgRef = useRef(null)

  // Load all data
  useEffect(() => {
    Promise.all([
      fetch('/data/kraje.geojson').then(r => r.json()),
      fetch('/data/okresy.geojson').then(r => r.json()),
      fetch('/data/semanticka_podobnost.json').then(r => r.json()),
      fetch('/data/domeny_kraje.json').then(r => r.json()),
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

  // ── MAP: color scale — quantile with discrete green bins (like slide 3) ──
  const mapColorScale = useMemo(() => {
    if (!semData) return () => '#eee'
    const values = Object.values(semData.avg_similarity)
    return d3.scaleQuantile().domain(values).range(MAP_CHOROPLETH)
  }, [semData])

  // ── MAP: projection — upper left, ~65% width, ~60% height ──
  const projection = useMemo(() => {
    if (!krajeGeo || dimensions.width === 0) return null
    const mapWidth = dimensions.width * 0.65
    const mapHeight = dimensions.height * 0.62
    const proj = d3.geoMercator().fitSize([mapWidth, mapHeight], krajeGeo)
    const [tx, ty] = proj.translate()
    // Position in upper-left area
    proj.translate([tx + dimensions.width * 0.04, ty + dimensions.height * 0.06])
    return proj
  }, [krajeGeo, dimensions])

  const pathGenerator = useMemo(() => {
    if (!projection) return null
    return d3.geoPath().projection(projection)
  }, [projection])

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

  // ── ALL PAIRS with zone classification ──
  const allPairsData = useMemo(() => {
    if (!semData || !domenyData) return []
    const krajNace = {}
    for (const [name, info] of Object.entries(domenyData.kraje)) {
      const codes = new Set()
      for (const d of info.domeny || []) {
        for (const c of d.cz_nace || []) codes.add(c)
      }
      krajNace[name] = codes
    }
    const names = semData.kraje
    const pairs = []
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const a = names[i], b = names[j]
        const sem = semData.matrix[a]?.[b] ?? semData.matrix[b]?.[a] ?? 0
        const hasA = (krajNace[a]?.size || 0) > 0
        const hasB = (krajNace[b]?.size || 0) > 0
        const jac = (hasA && hasB) ? computeJaccard(krajNace[a], krajNace[b]) : 0
        // Quadrants: vertical split at Jaccard 0.20, horizontal at sem 0.5
        let zone = 'grey' // bottom half: low semantic similarity
        if (sem > 0.5 && jac < 0.20) zone = 'green'  // top-left: close texts, low formal overlap
        else if (sem > 0.5 && jac >= 0.20) zone = 'blue' // top-right: close in both
        pairs.push({ a, b, jaccard: jac, semantic: sem, zone, bothNace: hasA && hasB })
      }
    }
    return pairs
  }, [semData, domenyData])

  // Only pairs where both kraje have NACE — for formal vs. content comparison
  const nacePairs = useMemo(() => allPairsData.filter(p => p.bothNace), [allPairsData])

  const zoneCounts = useMemo(() => {
    const green = nacePairs.filter(p => p.zone === 'green').length
    const blue = nacePairs.filter(p => p.zone === 'blue').length
    const grey = nacePairs.filter(p => p.zone === 'grey').length
    return { green, blue, grey, total: nacePairs.length }
  }, [nacePairs])

  // ── NETWORK: graph data ──
  const graphData = useMemo(() => {
    if (!semData) return null
    const krajNames = semData.kraje

    const avgValues = krajNames.filter(n => !NO_NACE_KRAJE.has(n)).map(n => semData.avg_similarity[n] || 0)
    const avgMin = Math.min(...avgValues)
    const avgMax = Math.max(...avgValues)
    const naceColorScale = d3.scaleLinear()
      .domain([avgMin, (avgMin + avgMax) / 2, avgMax])
      .range(['#B3D9F2', '#0087CD', '#0A416E'])
      .clamp(true)

    const nodeList = krajNames.map(name => ({
      id: name,
      acronym: ACRONYM[name] || name.slice(0, 3),
      hasNace: !NO_NACE_KRAJE.has(name),
      avgSim: semData.avg_similarity[name] || 0,
      domainCount: semData.domain_count[name] || 0,
      avgTextLen: AVG_TEXT_LEN[name] || 0,
      color: NO_NACE_KRAJE.has(name) ? '#CDCDD2' : naceColorScale(semData.avg_similarity[name] || 0),
    }))

    const linkList = []
    for (let i = 0; i < krajNames.length; i++) {
      for (let j = i + 1; j < krajNames.length; j++) {
        const sim = semData.matrix[krajNames[i]]?.[krajNames[j]] ?? 0
        if (sim >= EDGE_THRESHOLD) {
          linkList.push({ source: krajNames[i], target: krajNames[j], similarity: sim })
        }
      }
    }
    return { nodes: nodeList, links: linkList }
  }, [semData])

  // ── NETWORK: force simulation — lower-right quadrant ──
  useEffect(() => {
    if (!graphData || dimensions.width === 0) return

    const { width, height } = dimensions
    // Center of the network area: right 73%, bottom 68%
    const cx = width * 0.73
    const cy = height * 0.68
    // Boundaries for nodes: right half, bottom half
    const minX = width * 0.48
    const maxX = width - 40
    const minY = height * 0.42
    const maxY = height - 50

    const nodesCopy = graphData.nodes.map(n => ({ ...n }))
    const linksCopy = graphData.links.map(l => ({
      ...l,
      source: nodesCopy.find(n => n.id === l.source),
      target: nodesCopy.find(n => n.id === l.target),
    }))

    if (simRef.current) simRef.current.stop()

    const sim = d3.forceSimulation(nodesCopy)
      .force('link', d3.forceLink(linksCopy).id(d => d.id)
        .distance(d => (1 - d.similarity) * 340 + 50)
        .strength(d => d.similarity * 0.8))
      .force('charge', d3.forceManyBody().strength(-350))
      .force('center', d3.forceCenter(cx, cy).strength(0.05))
      .force('collision', d3.forceCollide().radius(38))
      .force('x', d3.forceX(cx).strength(0.02))
      .force('y', d3.forceY(cy).strength(0.02))
      .on('tick', () => {
        for (const n of nodesCopy) {
          n.x = Math.max(minX, Math.min(maxX, n.x))
          n.y = Math.max(minY, Math.min(maxY, n.y))
        }
        setNodes([...nodesCopy])
        setLinks([...linksCopy])
      })

    simRef.current = sim
    dragRef.current = { nodesCopy, sim }

    for (let i = 0; i < 350; i++) sim.tick()
    sim.alpha(0.06).restart()

    return () => sim.stop()
  }, [graphData, dimensions])

  // ── NETWORK: drag handler ──
  const handleDragStart = useCallback((e, nodeId) => {
    if (!dragRef.current) return
    const { sim, nodesCopy } = dragRef.current
    const node = nodesCopy.find(n => n.id === nodeId)
    if (!node) return

    sim.alphaTarget(0.3).restart()
    node.fx = node.x
    node.fy = node.y

    const svgEl = svgRef.current
    const onMove = (ev) => {
      const rect = svgEl.getBoundingClientRect()
      node.fx = ev.clientX - rect.left
      node.fy = ev.clientY - rect.top
    }
    const onUp = () => {
      sim.alphaTarget(0)
      node.fx = null
      node.fy = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  // ── NETWORK: stats ──
  const stats = useMemo(() => {
    if (!graphData) return null
    const edgeCount = graphData.links.length
    const maxPairs = graphData.nodes.length * (graphData.nodes.length - 1) / 2
    const strongest = graphData.links.length > 0
      ? graphData.links.reduce((best, l) => l.similarity > best.similarity ? l : best)
      : null
    return { edgeCount, maxPairs, strongest }
  }, [graphData])

  // ── NETWORK: hover highlight ──
  const connectedTo = useMemo(() => {
    if (!hoveredNode) return null
    const set = new Set()
    for (const l of links) {
      if (l.source.id === hoveredNode) set.add(l.target.id)
      if (l.target.id === hoveredNode) set.add(l.source.id)
    }
    set.add(hoveredNode)
    return set
  }, [hoveredNode, links])

  // ── Loading ──
  if (!krajeGeo || !pathGenerator || !semData || !stats || nodes.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#f8f9fa]">
        <p className="text-[#777] text-lg">Načítám data…</p>
      </div>
    )
  }

  const { width, height } = dimensions
  const fmt = (n, d = 2) => n.toLocaleString('cs-CZ', { minimumFractionDigits: d, maximumFractionDigits: d })
  const mapQuantiles = mapColorScale.quantiles ? mapColorScale.quantiles() : []

  // ── NETWORK: scales ──
  const simValues = links.map(l => l.similarity)
  const minSim = Math.min(...simValues, EDGE_THRESHOLD)
  const maxSim = Math.max(...simValues, 0.72)
  const edgeWidthScale = d3.scaleLinear().domain([minSim, maxSim]).range([1.5, 6])
  const edgeColorScale = d3.scaleLinear()
    .domain([minSim, (minSim + maxSim) / 2, maxSim])
    .range(['#B3D9F2', '#0087CD', '#0A416E'])

  const nodeRadius = d3.scaleLinear()
    .domain([d3.min(nodes, d => d.domainCount), d3.max(nodes, d => d.domainCount)])
    .range([16, 28])

  const textLenValues = nodes.map(d => d.avgTextLen)
  const ringScale = d3.scaleLinear()
    .domain([Math.min(...textLenValues), Math.max(...textLenValues)])
    .range([1.5, 4.5])

  // ── SCATTER: mini scatter inside infographic ──
  const miniW = 170, miniH = 100
  const miniXScale = d3.scaleLinear().domain([0, 0.55]).range([0, miniW])
  const miniYScale = d3.scaleLinear().domain([0.25, 0.75]).range([miniH, 0])
  const zoneColor = { green: '#A0BE32', blue: '#0087CD', grey: '#999' }

  return (
    <div className="w-full h-full bg-[#f8f9fa] relative overflow-hidden">
      <InfoPanel text={INFO_TEXT} />

      {/* ── Title ── */}
      <div className="absolute top-4 left-6 z-10" style={{ maxWidth: width * 0.55 }}>
        <h2 className="text-2xl font-bold text-[#0A416E]">
          Jak blízké si jsou krajské specializace?
        </h2>
        <p className="text-[13px] text-[#0A416E] mt-1 font-medium">
          Sémantická podobnost domén specializace z krajských karet
        </p>
        <div className="flex items-center gap-4 mt-1.5">
          <div className="flex items-center gap-1.5">
            <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#55287D' }} />
            <span className="text-[12px] text-[#444]">Mapa: prům. podobnost textů domén</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#0087CD' }} />
            <span className="text-[12px] text-[#444]">Síť: párové textové vazby nad prahem {EDGE_THRESHOLD}</span>
          </div>
        </div>
      </div>

      <svg ref={svgRef} width={width} height={height} className="absolute inset-0">
        {/* ══════ KARTOGRAM (upper left) ══════ */}

        {/* Okresy background */}
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

        {/* Kraje choropleth */}
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

        {/* Kraj labels on map — name + avg similarity + domain count */}
        {Object.entries(centroids).map(([name, [cx, cy]]) => {
          const avgSim = semData.avg_similarity[name]
          const domCount = semData.domain_count[name] || 0
          const fillColor = avgSim != null ? mapColorScale(avgSim) : '#eee'
          const isDark = fillColor === '#7B3FA5' || fillColor === '#55287D'
          const labelFill = isDark ? '#fff' : '#0A416E'
          return (
            <g key={`ml-${name}`} style={{ pointerEvents: 'none' }}>
              <text x={cx} y={cy - 10}
                textAnchor="middle" dominantBaseline="central"
                fontSize={9} fontWeight={600} fill={labelFill}>
                {SHORT_NAMES[name] || name}
              </text>
              {avgSim != null && (
                <text x={cx} y={cy + 2}
                  textAnchor="middle" dominantBaseline="central"
                  fontSize={10} fontWeight={700} fill={labelFill}>
                  {avgSim.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </text>
              )}
              <text x={cx} y={cy + 14}
                textAnchor="middle" dominantBaseline="central"
                fontSize={8} fill={labelFill}>
                {domCount} dom.
              </text>
            </g>
          )
        })}

        {/* ══════ NETWORK (lower right) ══════ */}

        {/* Edges */}
        {links.map((link, i) => {
          const isHighlighted = connectedTo && (connectedTo.has(link.source.id) && connectedTo.has(link.target.id))
          const isDimmed = connectedTo && !isHighlighted
          return (
            <line
              key={`e-${i}`}
              x1={link.source.x} y1={link.source.y}
              x2={link.target.x} y2={link.target.y}
              stroke={edgeColorScale(link.similarity)}
              strokeWidth={isHighlighted ? edgeWidthScale(link.similarity) * 1.5 : edgeWidthScale(link.similarity)}
              opacity={isDimmed ? 0.06 : isHighlighted ? 0.9 : 0.4}
              strokeLinecap="round"
              style={{ transition: 'opacity 0.3s, stroke-width 0.3s' }}
              onMouseMove={(e) => setTooltip({
                x: e.clientX, y: e.clientY, type: 'edge',
                a: ACRONYM[link.source.id], b: ACRONYM[link.target.id],
                aFull: link.source.id, bFull: link.target.id,
                similarity: link.similarity,
              })}
              onMouseLeave={() => setTooltip(null)}
            />
          )
        })}

        {/* Nodes */}
        {nodes.map(node => {
          const r = nodeRadius(node.domainCount)
          const ring = ringScale(node.avgTextLen)
          const isHovered = hoveredNode === node.id
          const isConnected = connectedTo?.has(node.id)
          const isDimmed = connectedTo && !isConnected
          return (
            <g key={node.id}
              style={{ cursor: 'grab', transition: 'opacity 0.3s' }}
              opacity={isDimmed ? 0.15 : 1}
              onMouseDown={(e) => { e.preventDefault(); handleDragStart(e, node.id) }}
              onMouseEnter={() => setHoveredNode(node.id)}
              onMouseLeave={() => { setHoveredNode(null); setTooltip(null) }}
              onMouseMove={(e) => setTooltip({
                x: e.clientX, y: e.clientY, type: 'node',
                name: node.id, acronym: node.acronym,
                hasNace: node.hasNace, avgSim: node.avgSim,
                domainCount: node.domainCount, avgTextLen: node.avgTextLen,
                connections: links.filter(l => l.source.id === node.id || l.target.id === node.id).length,
              })}
            >
              {isHovered && (
                <circle cx={node.x} cy={node.y} r={r + 7}
                  fill="none" stroke={node.color} strokeWidth={2.5} opacity={0.35} />
              )}
              <circle cx={node.x + 1} cy={node.y + 1} r={r} fill="rgba(0,0,0,0.1)" />
              <circle cx={node.x} cy={node.y} r={r + ring / 2 + 1}
                fill="none" stroke={node.hasNace ? '#0A416E' : '#9B9BA0'}
                strokeWidth={ring} opacity={0.3} />
              <circle cx={node.x} cy={node.y} r={r}
                fill={node.color}
                stroke="white" strokeWidth={2}
              />
              <text x={node.x} y={node.y - 1}
                textAnchor="middle" dominantBaseline="central"
                fontSize={11} fontWeight={700} fill="white"
                style={{ pointerEvents: 'none', textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}>
                {node.acronym}
              </text>
              <text x={node.x} y={node.y + 10}
                textAnchor="middle" dominantBaseline="central"
                fontSize={7} fill="rgba(255,255,255,0.8)"
                style={{ pointerEvents: 'none' }}>
                {node.domainCount} dom.
              </text>
            </g>
          )
        })}

        {/* scatter thumbnail removed — replaced by infographic panel */}
      </svg>

      {/* ── Map legend — inside map area, amber border ── */}
      <div className="absolute z-10 bg-white/92 rounded-lg px-3 py-2.5 shadow-sm"
        style={{ left: width * 0.03, top: height * 0.56, borderLeft: '4px solid #55287D' }}>
        <div className="text-[13px] font-bold text-[#0A416E] mb-1.5">Kartogram</div>
        <div className="flex items-end gap-0.5">
          {MAP_CHOROPLETH.map((color, i) => (
            <div key={i} className="flex flex-col items-center">
              <div style={{ width: 32, height: 16, background: color, borderRadius: 2 }} />
              <span className="text-[10px] text-[#444] mt-0.5">
                {i === 0 && mapQuantiles[0] != null ? `<${fmt(mapQuantiles[0])}` : ''}
                {i > 0 && i < MAP_CHOROPLETH.length - 1 && mapQuantiles[i - 1] != null ? fmt(mapQuantiles[i - 1]) : ''}
                {i === MAP_CHOROPLETH.length - 1 && mapQuantiles.length > 0 ? `>${fmt(mapQuantiles[mapQuantiles.length - 1])}` : ''}
              </span>
            </div>
          ))}
        </div>
        <div className="text-[11px] text-[#444] leading-snug mt-1.5">
          Průměrná sémantická podobnost textů domén specializace kraje vůči ostatním
        </div>
      </div>

      {/* ── Network legend + Methodology — stacked, right side, above network ── */}
      <div className="absolute z-10 flex flex-col gap-2"
        style={{ right: 16, top: height * 0.08, maxWidth: 240 }}>

        {/* Network legend */}
        <div className="bg-white/92 rounded-lg px-4 py-3 shadow-sm"
          style={{ borderLeft: '4px solid #0087CD' }}>
          <div className="text-[14px] font-bold text-[#0A416E] mb-2">Síťový graf</div>

          <div className="text-[12px] text-[#0A416E] mb-1 font-semibold">Barva uzlu:</div>
          <div className="flex items-center gap-2 mb-1.5">
            <svg width={70} height={12}>
              <defs>
                <linearGradient id="node-grad-m">
                  <stop offset="0%" stopColor="#B3D9F2" />
                  <stop offset="50%" stopColor="#0087CD" />
                  <stop offset="100%" stopColor="#0A416E" />
                </linearGradient>
              </defs>
              <rect width={70} height={12} rx={6} fill="url(#node-grad-m)" />
            </svg>
            <span className="text-[11px] text-[#333]">prům. podobnost textů domén</span>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <div style={{ width: 12, height: 12, background: '#CDCDD2', borderRadius: '50%' }} />
            <span className="text-[11px] text-[#333]">Šedý = v kartě bez NACE (výpočet sítě na NACE nezávisí)</span>
          </div>

          <div className="text-[12px] text-[#0A416E] mb-1 font-semibold">Uzly:</div>
          <div className="text-[11px] text-[#333] leading-snug mb-2">
            Velikost ∝ počet domén specializace<br />
            Obrys (ring) ∝ podrobnost popisu domén v kartě
          </div>

          <div className="text-[12px] text-[#0A416E] mb-1 font-semibold">Hrany:</div>
          <div className="flex items-center gap-2 mb-1.5">
            <svg width={70} height={12}>
              <line x1={2} y1={6} x2={32} y2={6} stroke="#B3D9F2" strokeWidth={2} strokeLinecap="round" />
              <line x1={38} y1={6} x2={68} y2={6} stroke="#0A416E" strokeWidth={6} strokeLinecap="round" />
            </svg>
            <span className="text-[11px] text-[#333]">slabší → silnější podobnost textů</span>
          </div>
          <div className="text-[11px] text-[#333] leading-snug">
            Práh: cosine sim. textů &gt; {EDGE_THRESHOLD}
          </div>
          <div className="text-[11px] text-[#666] leading-snug mt-1.5 italic">
            Uzly lze přetahovat, najetím se zvýrazní spojení
          </div>
        </div>

        {/* Methodology box */}
        <div className="bg-white/95 rounded-lg px-4 py-2.5 shadow-sm border border-[#E3F2FD]">
          <p className="text-[11px] text-[#0A416E] leading-snug">
            <strong>Postup:</strong> Texty domén z krajských karet převedeny jazykovým modelem
            na vektory (embeddings). Cosine similarity měří obsahovou blízkost textů nezávisle
            na formálních NACE kódech.
          </p>
          <p className="text-[11px] text-[#555] leading-snug mt-1">
            V síti {stats.edgeCount} hran z {stats.maxPairs} možných párů.
            {stats.strongest && (
              <> Nejsilnější: <strong>{ACRONYM[stats.strongest.source?.id]}–{ACRONYM[stats.strongest.target?.id]}</strong> ({fmt(stats.strongest.similarity)}).</>
            )}
          </p>
        </div>
      </div>

      {/* ── Infographic panel — bottom left, prominent colors ── */}
      <div className="absolute z-10 bg-white/95 rounded-lg px-3 py-2.5 shadow-sm"
        style={{ left: width * 0.03, bottom: 36, maxWidth: 230, borderLeft: '4px solid #E6AF14' }}>
        <div className="text-[13px] font-bold text-[#0A416E] mb-0.5">Formální vs. obsahová podobnost</div>
        <div className="text-[10px] text-[#777] mb-2">Pouze {zoneCounts.total} párů krajů s CZ-NACE kódy</div>

        {/* Zone rows — prominent colors */}
        <div className="flex items-center gap-2 mb-2">
          <div style={{ width: 14, height: 14, borderRadius: 3, background: '#7BA318', flexShrink: 0 }} />
          <div>
            <div className="text-[11px] text-[#222] font-semibold">Obsahově blízké, formálně vzdálené</div>
            <div className="text-[10px] text-[#555]">Jaccard NACE &lt; 0,20 &amp; sem. textů &gt; 0,5 · <strong>{zoneCounts.green} párů</strong></div>
          </div>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <div style={{ width: 14, height: 14, borderRadius: 3, background: '#006BAA', flexShrink: 0 }} />
          <div>
            <div className="text-[11px] text-[#222] font-semibold">Shoda obsahová i formální</div>
            <div className="text-[10px] text-[#555]">Jaccard NACE &ge; 0,20 &amp; sem. textů &gt; 0,5 · <strong>{zoneCounts.blue} párů</strong></div>
          </div>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <div style={{ width: 14, height: 14, borderRadius: 3, background: '#999', flexShrink: 0 }} />
          <div>
            <div className="text-[11px] text-[#222] font-semibold">Nízká textová podobnost</div>
            <div className="text-[10px] text-[#555]">Sem. textů &le; 0,5 · <strong>{zoneCounts.grey} párů</strong></div>
          </div>
        </div>

        {/* Mini scatter with zone backgrounds */}
        <svg width={miniW + 24} height={miniH + 22} style={{ display: 'block' }}>
          <g transform="translate(18, 2)">
            {/* Quadrant backgrounds */}
            <rect x={0} y={0} width={miniXScale(0.20)} height={miniYScale(0.5)}
              fill="#7BA318" opacity={0.12} />
            <rect x={miniXScale(0.20)} y={0} width={miniW - miniXScale(0.20)} height={miniYScale(0.5)}
              fill="#006BAA" opacity={0.12} />
            <rect x={0} y={miniYScale(0.5)} width={miniW} height={miniH - miniYScale(0.5)}
              fill="#999" opacity={0.08} />
            {/* Axes */}
            <line x1={0} y1={miniH} x2={miniW} y2={miniH} stroke="#ccc" strokeWidth={0.5} />
            <line x1={0} y1={0} x2={0} y2={miniH} stroke="#ccc" strokeWidth={0.5} />
            {/* Quadrant dividers */}
            <line x1={miniXScale(0.20)} y1={0} x2={miniXScale(0.20)} y2={miniH}
              stroke="#555" strokeWidth={0.8} strokeDasharray="3,2" opacity={0.5} />
            <line x1={0} y1={miniYScale(0.5)} x2={miniW} y2={miniYScale(0.5)}
              stroke="#555" strokeWidth={0.8} strokeDasharray="3,2" opacity={0.5} />
            {/* Data points */}
            {nacePairs.map((d, i) => (
              <circle key={i}
                cx={miniXScale(Math.min(d.jaccard, 0.55))} cy={miniYScale(Math.max(0.25, Math.min(0.75, d.semantic)))}
                r={3.5} fill={zoneColor[d.zone]} opacity={0.7}
                stroke="white" strokeWidth={0.5}
              />
            ))}
            {/* Axis labels */}
            <text x={miniW / 2} y={miniH + 14} textAnchor="middle" fontSize={9} fill="#555">Jaccard (NACE kódy)</text>
            <text transform={`translate(-12, ${miniH / 2}) rotate(-90)`}
              textAnchor="middle" fontSize={9} fill="#555">Sém. podob. textů</text>
          </g>
        </svg>
      </div>

      {/* ── Tooltip ── */}
      {tooltip && (
        <div className="map-tooltip" style={{
          left: Math.min(tooltip.x + 14, width - 320),
          top: Math.max(tooltip.y - 12, 10),
        }}>
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
          ) : tooltip.type === 'node' ? (
            <>
              <div className="tooltip-title">{tooltip.name}</div>
              <div className="tooltip-value">Domén specializace: <strong>{tooltip.domainCount}</strong></div>
              <div className="tooltip-value">Prům. délka popisu: <strong>{tooltip.avgTextLen} znaků</strong></div>
              <div className="tooltip-value">Prům. sém. podobnost: <strong>{fmt(tooltip.avgSim)}</strong></div>
              <div className="tooltip-value">Spojení v síti: {tooltip.connections}</div>
              <div style={{ fontSize: 11, marginTop: 4, fontWeight: 500, color: tooltip.hasNace ? '#0A416E' : '#9B9BA0' }}>
                {tooltip.hasNace ? 'Domény obsahují CZ-NACE kódy' : 'Domény bez CZ-NACE klasifikace'}
              </div>
            </>
          ) : (
            <>
              <div className="tooltip-title">{tooltip.a} ↔ {tooltip.b}</div>
              <div className="tooltip-value" style={{ fontSize: 11, color: '#666' }}>
                {tooltip.aFull} — {tooltip.bFull}
              </div>
              <div className="tooltip-value">Sémantická podobnost: <strong>{fmt(tooltip.similarity)}</strong></div>
            </>
          )}
        </div>
      )}

      {/* ── Source ── */}
      <div className="absolute bottom-3 left-0 right-0 text-center text-[10px] text-[#777] z-10">
        Zdroj: Krajské karty, Příloha 2 NRIS3 v08 (MPO, 2026) &middot; Embeddings: paraphrase-multilingual-MiniLM-L12-v2
      </div>
    </div>
  )
}
