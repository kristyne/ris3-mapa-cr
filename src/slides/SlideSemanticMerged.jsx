import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import * as d3 from 'd3'
import InfoPanel from '../InfoPanel'
import CollapsiblePanel from '../CollapsiblePanel'

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
  const [infoExpanded, setInfoExpanded] = useState(false)
  const simRef = useRef(null)
  const dragRef = useRef(null)
  const svgRef = useRef(null)

  // Load all data
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

  const isDesktop = dimensions.width > 1024
  const isTablet = dimensions.width > 768 && dimensions.width <= 1024
  const isMobile = dimensions.width <= 768
  const isCompact = isDesktop && dimensions.height < 900

  // ── MAP: color scale ──
  const mapColorScale = useMemo(() => {
    if (!semData) return () => '#eee'
    const values = Object.values(semData.avg_similarity)
    return d3.scaleQuantile().domain(values).range(MAP_CHOROPLETH)
  }, [semData])

  // ── MAP: SVG dimensions ──
  const mapSvgW = dimensions.width
  const mapSvgH = isDesktop ? dimensions.height : isTablet ? dimensions.height * 0.42 : dimensions.height * 0.34

  // ── MAP: projection ──
  const projection = useMemo(() => {
    if (!krajeGeo || dimensions.width === 0) return null
    const mapWidth = isDesktop ? dimensions.width * (isCompact ? 0.55 : 0.58) : dimensions.width * 0.92
    const mapHeight = isDesktop ? dimensions.height * (isCompact ? 0.50 : 0.55) : mapSvgH * 0.82
    const proj = d3.geoMercator().fitSize([mapWidth, mapHeight], krajeGeo)
    const [tx, ty] = proj.translate()
    // Title on this slide is tall (~90px: title + subtitle + indicators), push map below
    proj.translate([tx + dimensions.width * 0.04, ty + (isDesktop ? Math.max(80, dimensions.height * 0.11) : mapSvgH * 0.06)])
    return proj
  }, [krajeGeo, dimensions, isDesktop, isCompact, mapSvgH])

  const pathGenerator = useMemo(() => {
    if (!projection) return null
    return d3.geoPath().projection(projection)
  }, [projection])

  const centroids = useMemo(() => {
    if (!krajeGeo || !pathGenerator) return {}
    const result = {}
    const scale = Math.min(dimensions.width, dimensions.height) / 1000
    for (const feature of krajeGeo.features) {
      const name = feature.properties.nazev
      const [cx, cy] = pathGenerator.centroid(feature)
      if (name === 'Středočeský kraj') {
        result[name] = [cx + 20 * scale, cy + 25 * scale]
      } else {
        result[name] = [cx, cy]
      }
    }
    return result
  }, [krajeGeo, pathGenerator, dimensions])

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
        let zone = 'grey'
        if (sem > 0.5 && jac < 0.20) zone = 'green'
        else if (sem > 0.5 && jac >= 0.20) zone = 'blue'
        pairs.push({ a, b, jaccard: jac, semantic: sem, zone, bothNace: hasA && hasB })
      }
    }
    return pairs
  }, [semData, domenyData])

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

  // ── NETWORK: SVG area ──
  const netSvgW = dimensions.width
  const netSvgH = isDesktop ? dimensions.height : isTablet ? dimensions.height * 0.38 : dimensions.height * 0.34

  // ── NETWORK: force simulation ──
  useEffect(() => {
    if (!graphData || dimensions.width === 0) return

    const { width, height } = dimensions
    let cx, cy, minX, maxX, minY, maxY

    if (isDesktop) {
      cx = width * 0.73; cy = height * (isCompact ? 0.62 : 0.68)
      minX = width * (isCompact ? 0.42 : 0.48); maxX = width - 40
      minY = height * (isCompact ? 0.36 : 0.42); maxY = height - (isCompact ? 40 : 50)
    } else {
      // For tablet/mobile the network is rendered in its own SVG
      cx = netSvgW * 0.50; cy = netSvgH * 0.50
      minX = 30; maxX = netSvgW - 30
      minY = 30; maxY = netSvgH - 30
    }

    const nodesCopy = graphData.nodes.map(n => ({ ...n }))
    const linksCopy = graphData.links.map(l => ({
      ...l,
      source: nodesCopy.find(n => n.id === l.source),
      target: nodesCopy.find(n => n.id === l.target),
    }))

    if (simRef.current) simRef.current.stop()

    const vScale = Math.min(isDesktop ? width : netSvgW, isDesktop ? height : netSvgH) / 1080
    const sim = d3.forceSimulation(nodesCopy)
      .force('link', d3.forceLink(linksCopy).id(d => d.id)
        .distance(d => (1 - d.similarity) * 340 * vScale + 50 * vScale)
        .strength(d => d.similarity * 0.8))
      .force('charge', d3.forceManyBody().strength(-350 * vScale))
      .force('center', d3.forceCenter(cx, cy).strength(0.05))
      .force('collision', d3.forceCollide().radius(Math.max(20, 38 * vScale)))
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
  }, [graphData, dimensions, isDesktop, netSvgW, netSvgH])

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
  const fs = (base) => Math.max(base * 0.6, Math.min(base, Math.min(width, height) / 1080 * base))

  // ── NETWORK: scales ──
  const simValues = links.map(l => l.similarity)
  const minSim = Math.min(...simValues, EDGE_THRESHOLD)
  const maxSim = Math.max(...simValues, 0.72)
  const edgeWidthScale = d3.scaleLinear().domain([minSim, maxSim]).range([1.5, 6])
  const edgeColorScale = d3.scaleLinear()
    .domain([minSim, (minSim + maxSim) / 2, maxSim])
    .range(['#B3D9F2', '#0087CD', '#0A416E'])

  const vScale = Math.min(width, height) / 1080
  const nodeRadius = d3.scaleLinear()
    .domain([d3.min(nodes, d => d.domainCount), d3.max(nodes, d => d.domainCount)])
    .range([Math.max(10, 16 * vScale), Math.max(16, 28 * vScale)])

  const textLenValues = nodes.map(d => d.avgTextLen)
  const ringScale = d3.scaleLinear()
    .domain([Math.min(...textLenValues), Math.max(...textLenValues)])
    .range([1.5, 4.5])

  // ── SCATTER: mini scatter ──
  const miniW = Math.max(100, Math.min(170, width * 0.14)), miniH = Math.max(60, Math.min(100, height * 0.1))
  const miniXScale = d3.scaleLinear().domain([0, 0.55]).range([0, miniW])
  const miniYScale = d3.scaleLinear().domain([0.25, 0.75]).range([miniH, 0])
  const zoneColor = { green: '#A0BE32', blue: '#0087CD', grey: '#999' }

  // ── Shared: network SVG content ──
  const renderNetworkContent = () => (
    <>
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
              fontSize={fs(11)} fontWeight={700} fill="white"
              style={{ pointerEvents: 'none', textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}>
              {node.acronym}
            </text>
            <text x={node.x} y={node.y + Math.max(7, fs(10))}
              textAnchor="middle" dominantBaseline="central"
              fontSize={fs(7)} fill="rgba(255,255,255,0.8)"
              style={{ pointerEvents: 'none' }}>
              {node.domainCount} dom.
            </text>
          </g>
        )
      })}
    </>
  )

  // ── Map legend content ──
  const mapLegendContent = (compact = false) => (
    <>
      <div style={{ fontSize: 'clamp(10px, 1.3vw, 13px)' }} className="font-bold text-[#0A416E] mb-1 sm:mb-1.5">Kartogram</div>
      <div className="flex items-end gap-0.5">
        {MAP_CHOROPLETH.map((color, i) => (
          <div key={i} className="flex flex-col items-center">
            <div style={{ width: Math.max(16, Math.min(32, width * 0.025)), height: Math.max(10, Math.min(16, height * 0.016)), background: color, borderRadius: 2 }} />
            <span style={{ fontSize: 'clamp(7px, 1vw, 10px)' }} className="text-[#444] mt-0.5">
              {i === 0 && mapQuantiles[0] != null ? `<${fmt(mapQuantiles[0])}` : ''}
              {i > 0 && i < MAP_CHOROPLETH.length - 1 && mapQuantiles[i - 1] != null ? fmt(mapQuantiles[i - 1]) : ''}
              {i === MAP_CHOROPLETH.length - 1 && mapQuantiles.length > 0 ? `>${fmt(mapQuantiles[mapQuantiles.length - 1])}` : ''}
            </span>
          </div>
        ))}
      </div>
      {!compact && (
        <div className="text-[11px] text-[#444] leading-snug mt-1.5">
          Průměrná sémantická podobnost textů domén specializace kraje vůči ostatním
        </div>
      )}
    </>
  )

  // ── Network legend content ──
  const networkLegendContent = (compact = false) => (
    <>
      <div className="text-[14px] font-bold text-[#0A416E] mb-2">Síťový graf</div>

      {!compact && (
        <>
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
        </>
      )}

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
      {!compact && (
        <div className="text-[11px] text-[#666] leading-snug mt-1.5 italic">
          Uzly lze přetahovat, najetím se zvýrazní spojení
        </div>
      )}
    </>
  )

  // ── Methodology content ──
  const methodologyContent = (
    <>
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
    </>
  )

  // ── Infographic content ──
  const infographicBody = (
    <>
      <div className="text-[10px] text-[#777] mb-2">Pouze {zoneCounts.total} párů krajů s CZ-NACE kódy</div>

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
          <rect x={0} y={0} width={miniXScale(0.20)} height={miniYScale(0.5)}
            fill="#7BA318" opacity={0.12} />
          <rect x={miniXScale(0.20)} y={0} width={miniW - miniXScale(0.20)} height={miniYScale(0.5)}
            fill="#006BAA" opacity={0.12} />
          <rect x={0} y={miniYScale(0.5)} width={miniW} height={miniH - miniYScale(0.5)}
            fill="#999" opacity={0.08} />
          <line x1={0} y1={miniH} x2={miniW} y2={miniH} stroke="#ccc" strokeWidth={0.5} />
          <line x1={0} y1={0} x2={0} y2={miniH} stroke="#ccc" strokeWidth={0.5} />
          <line x1={miniXScale(0.20)} y1={0} x2={miniXScale(0.20)} y2={miniH}
            stroke="#555" strokeWidth={0.8} strokeDasharray="3,2" opacity={0.5} />
          <line x1={0} y1={miniYScale(0.5)} x2={miniW} y2={miniYScale(0.5)}
            stroke="#555" strokeWidth={0.8} strokeDasharray="3,2" opacity={0.5} />
          {nacePairs.map((d, i) => (
            <circle key={i}
              cx={miniXScale(Math.min(d.jaccard, 0.55))} cy={miniYScale(Math.max(0.25, Math.min(0.75, d.semantic)))}
              r={3.5} fill={zoneColor[d.zone]} opacity={0.7}
              stroke="white" strokeWidth={0.5}
            />
          ))}
          <text x={miniW / 2} y={miniH + 14} textAnchor="middle" fontSize={9} fill="#555">Jaccard (NACE kódy)</text>
          <text transform={`translate(-12, ${miniH / 2}) rotate(-90)`}
            textAnchor="middle" fontSize={9} fill="#555">Sém. podob. textů</text>
        </g>
      </svg>
    </>
  )

  const infographicContent = (
    <>
      <div className="text-[13px] font-bold text-[#0A416E] mb-0.5">Formální vs. obsahová podobnost</div>
      {infographicBody}
    </>
  )

  // ── Tooltip ──
  const tooltipEl = tooltip && (
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
  )

  const sourceText = 'Zdroj: Krajské karty, Příloha 2 NRIS3 v08 (MPO, 2026) · Embeddings: paraphrase-multilingual-MiniLM-L12-v2'

  // ════════════════════════════════════════
  // DESKTOP LAYOUT (>1024px) — diagonal with absolute overlays
  // ════════════════════════════════════════
  if (isDesktop) {
    return (
      <div className="w-full h-full bg-[#f8f9fa] relative overflow-hidden">
        <InfoPanel text={INFO_TEXT} />

        {/* Title */}
        <div className="absolute top-3 sm:top-4 left-4 sm:left-6 z-10" style={{ maxWidth: width * 0.55 }}>
          <h2 className="font-bold text-[#0A416E]" style={{ fontSize: 'clamp(0.9rem, 2.5vw, 1.5rem)' }}>
            Jak blízké si jsou krajské specializace?
          </h2>
          <p className="text-[#0A416E] mt-1 font-medium" style={{ fontSize: 'clamp(0.6rem, 1.3vw, 0.8125rem)' }}>
            Sémantická podobnost domén specializace z krajských karet
          </p>
          <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-1.5">
            <div className="flex items-center gap-1.5">
              <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#55287D' }} />
              <span className="text-[#444]" style={{ fontSize: 'clamp(9px, 1.2vw, 12px)' }}>Mapa: prům. podobnost textů domén</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#0087CD' }} />
              <span className="text-[#444]" style={{ fontSize: 'clamp(9px, 1.2vw, 12px)' }}>Síť: párové textové vazby nad prahem {EDGE_THRESHOLD}</span>
            </div>
          </div>
        </div>

        <svg ref={svgRef} width={width} height={height} className="absolute inset-0">
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

          {/* Kraj labels on map */}
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
                  fontSize={fs(9)} fontWeight={600} fill={labelFill}>
                  {SHORT_NAMES[name] || name}
                </text>
                {avgSim != null && (
                  <text x={cx} y={cy + 2}
                    textAnchor="middle" dominantBaseline="central"
                    fontSize={fs(10)} fontWeight={700} fill={labelFill}>
                    {avgSim.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </text>
                )}
                <text x={cx} y={cy + 14}
                  textAnchor="middle" dominantBaseline="central"
                  fontSize={fs(8)} fill={labelFill}>
                  {domCount} dom.
                </text>
              </g>
            )
          })}

          {/* Network */}
          {renderNetworkContent()}
        </svg>

        {/* Map legend */}
        <div className="absolute z-10 bg-white/92 rounded-lg px-2 py-1.5 shadow-sm"
          style={{
            left: width * 0.03,
            top: height * (isCompact ? 0.52 : 0.56),
            borderLeft: '4px solid #55287D',
          }}>
          {mapLegendContent(false)}
        </div>

        {/* Network legend + Methodology */}
        <div className="absolute z-10 flex flex-col gap-1.5"
          style={{ right: 12, top: Math.max(80, height * 0.11), maxWidth: isCompact ? 195 : 210 }}>
          <div className="bg-white/92 rounded-lg px-3 py-2 shadow-sm" style={{ borderLeft: '4px solid #0087CD' }}>
            {networkLegendContent(false)}
          </div>
          <div className="bg-white/95 rounded-lg px-3 py-2 shadow-sm border border-[#E3F2FD]">
            {methodologyContent}
          </div>
        </div>

        {/* Infographic panel — bottom left, collapsible on compact */}
        <div className="absolute z-10 bg-white/95 rounded-lg px-3 py-2 shadow-sm"
          style={{
            left: width * 0.03,
            bottom: isCompact ? 28 : 36,
            maxWidth: Math.min(isCompact ? 200 : 220, width * 0.18),
            borderLeft: '4px solid #E6AF14',
          }}>
          {isCompact ? (
            <>
              <div className="flex items-center gap-2 cursor-pointer select-none"
                onClick={() => setInfoExpanded(!infoExpanded)}>
                <span className="text-[12px] font-bold text-[#0A416E]">Formální vs. obsahová podobnost</span>
                <span className="text-[#0087CD] text-[11px]">{infoExpanded ? '▾' : '▸'}</span>
              </div>
              {infoExpanded && <div className="mt-2">{infographicBody}</div>}
            </>
          ) : (
            infographicContent
          )}
        </div>

        {tooltipEl}

        {/* Source */}
        <div className="absolute bottom-2 sm:bottom-3 left-0 right-0 text-center text-[#777] z-10 px-4" style={{ fontSize: 'clamp(7px, 1vw, 10px)' }}>
          {sourceText}
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════
  // TABLET + MOBILE — flow column
  // ════════════════════════════════════════
  return (
    <div className="w-full h-full bg-[#f8f9fa] overflow-y-auto flex flex-col">
      <InfoPanel text={INFO_TEXT} />

      {/* Title */}
      <div className="px-4 pt-3 pb-1">
        <h2 className="font-bold text-[#0A416E]" style={{ fontSize: 'clamp(0.9rem, 2.5vw, 1.5rem)' }}>
          Jak blízké si jsou krajské specializace?
        </h2>
        <p className="text-[#0A416E] mt-1 font-medium" style={{ fontSize: 'clamp(0.6rem, 1.3vw, 0.8125rem)' }}>
          Sémantická podobnost domén specializace z krajských karet
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-1.5">
          <div className="flex items-center gap-1.5">
            <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#55287D' }} />
            <span className="text-[#444]" style={{ fontSize: 'clamp(9px, 1.2vw, 12px)' }}>Mapa: prům. podobnost</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#0087CD' }} />
            <span className="text-[#444]" style={{ fontSize: 'clamp(9px, 1.2vw, 12px)' }}>Síť: textové vazby &gt; {EDGE_THRESHOLD}</span>
          </div>
        </div>
      </div>

      {/* Kartogram */}
      <div className="relative" style={{ height: mapSvgH, minHeight: 200, flexShrink: 0 }}>
        <svg width={width} height={mapSvgH} style={{ display: 'block' }}>
          {okresyGeo && (
            <g>
              {okresyGeo.features.map((feature) => (
                <path key={`o-${feature.properties.nutslau}`}
                  d={pathGenerator(feature)} fill="#F0F0F0" stroke="#DDD" strokeWidth={0.5} />
              ))}
            </g>
          )}
          <g>
            {krajeGeo.features.map((feature) => {
              const nuts = feature.properties.nutslau
              const name = feature.properties.nazev
              const avgSem = semData.avg_similarity[name]
              return (
                <path key={nuts} d={pathGenerator(feature)}
                  fill={avgSem != null ? mapColorScale(avgSem) : '#eee'}
                  stroke="#fff" strokeWidth={1.5} className="kraj-path"
                  onMouseMove={(e) => setTooltip({ x: e.clientX, y: e.clientY, type: 'map', name, avgSem, domains: semData.domain_count[name] || 0 })}
                  onMouseLeave={() => setTooltip(null)} />
              )
            })}
          </g>
          {Object.entries(centroids).map(([name, [cx, cy]]) => {
            const avgSim = semData.avg_similarity[name]
            const domCount = semData.domain_count[name] || 0
            const fillColor = avgSim != null ? mapColorScale(avgSim) : '#eee'
            const isDark = fillColor === '#7B3FA5' || fillColor === '#55287D'
            const labelFill = isDark ? '#fff' : '#0A416E'
            return (
              <g key={`ml-${name}`} style={{ pointerEvents: 'none' }}>
                <text x={cx} y={cy - 10} textAnchor="middle" dominantBaseline="central"
                  fontSize={fs(9)} fontWeight={600} fill={labelFill}>
                  {SHORT_NAMES[name] || name}
                </text>
                {avgSim != null && (
                  <text x={cx} y={cy + 2} textAnchor="middle" dominantBaseline="central"
                    fontSize={fs(10)} fontWeight={700} fill={labelFill}>
                    {avgSim.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </text>
                )}
                <text x={cx} y={cy + 14} textAnchor="middle" dominantBaseline="central"
                  fontSize={fs(8)} fill={labelFill}>
                  {domCount} dom.
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      {/* Síťový graf */}
      <div className="relative" style={{ height: netSvgH, minHeight: 200, flexShrink: 0 }}>
        <svg ref={svgRef} width={netSvgW} height={netSvgH} style={{ display: 'block' }}>
          {renderNetworkContent()}
        </svg>
      </div>

      {tooltipEl}

      {/* Panels below visualizations */}
      <div className="px-4 py-2 flex flex-col gap-2 flex-shrink-0">
        {/* Legends */}
        {isMobile ? (
          <>
            <div className="bg-white/92 rounded-lg px-3 py-2 shadow-sm flex flex-wrap gap-4">
              <div className="flex-1 min-w-[130px]" style={{ borderLeft: '3px solid #55287D', paddingLeft: 8 }}>
                {mapLegendContent(true)}
              </div>
              <div className="flex-1 min-w-[130px]" style={{ borderLeft: '3px solid #0087CD', paddingLeft: 8 }}>
                {networkLegendContent(true)}
              </div>
            </div>
            <CollapsiblePanel title="Metodologie">
              {methodologyContent}
            </CollapsiblePanel>
            <CollapsiblePanel title="Formální vs. obsahová podobnost">
              {infographicContent}
            </CollapsiblePanel>
          </>
        ) : (
          <>
            <div className="flex gap-3">
              <div className="bg-white/92 rounded-lg px-3 py-2 shadow-sm flex-1" style={{ borderLeft: '4px solid #55287D' }}>
                {mapLegendContent(false)}
              </div>
              <div className="bg-white/92 rounded-lg px-3 py-2 shadow-sm flex-1" style={{ borderLeft: '4px solid #0087CD' }}>
                {networkLegendContent(false)}
              </div>
            </div>
            <div className="bg-white/95 rounded-lg px-4 py-2.5 shadow-sm border border-[#E3F2FD]">
              {methodologyContent}
            </div>
            <div className="bg-white/95 rounded-lg px-3 py-2.5 shadow-sm" style={{ borderLeft: '4px solid #E6AF14' }}>
              {infographicContent}
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
