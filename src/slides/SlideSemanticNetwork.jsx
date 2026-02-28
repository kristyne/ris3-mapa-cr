import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import * as d3 from 'd3'
import InfoPanel from '../InfoPanel'

const INFO_TEXT = `Síťový graf zobrazuje tematickou blízkost krajů na základě textů domén specializace z krajských karet (Příloha 2 NRIS3). Každý uzel = kraj. Hrana mezi dvěma kraji existuje, pokud sémantická podobnost jejich domén překročí práh (cosine similarity). Čím silnější hrana, tím blíže si kraje tematicky jsou. Uzly lze přetahovat myší. Najetím na uzel se zvýrazní jeho spojení. Velikost uzlu odráží počet domén, obrys ukazuje podrobnost popisu domén v kartě.`

// Official abbreviations
const ACRONYM = {
  'Hl. m. Praha': 'PHA', 'Středočeský kraj': 'STČ', 'Jihočeský kraj': 'JHČ',
  'Plzeňský kraj': 'PLK', 'Karlovarský kraj': 'KVK', 'Ústecký kraj': 'ULK',
  'Liberecký kraj': 'LBK', 'Královéhradecký kraj': 'HKK', 'Pardubický kraj': 'PAK',
  'Vysočina': 'VYS', 'Jihomoravský kraj': 'JHM', 'Olomoucký kraj': 'OLK',
  'Zlínský kraj': 'ZLK', 'Moravskoslezský kraj': 'MSK',
}

const EDGE_THRESHOLD = 0.45

const NO_NACE_KRAJE = new Set([
  'Hl. m. Praha', 'Olomoucký kraj', 'Ústecký kraj', 'Zlínský kraj',
])

// Avg text length per domain (from domeny_plne_texty.json, pre-computed)
const AVG_TEXT_LEN = {
  'Hl. m. Praha': 271, 'Jihočeský kraj': 206, 'Jihomoravský kraj': 35,
  'Karlovarský kraj': 282, 'Královéhradecký kraj': 614, 'Liberecký kraj': 485,
  'Moravskoslezský kraj': 1162, 'Olomoucký kraj': 98, 'Pardubický kraj': 773,
  'Plzeňský kraj': 340, 'Středočeský kraj': 105, 'Ústecký kraj': 51,
  'Vysočina': 263, 'Zlínský kraj': 358,
}

export default function SlideSemanticNetwork() {
  const [semData, setSemData] = useState(null)
  const [tooltip, setTooltip] = useState(null)
  const [hoveredNode, setHoveredNode] = useState(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [nodes, setNodes] = useState([])
  const [links, setLinks] = useState([])
  const simRef = useRef(null)
  const dragRef = useRef(null)
  const svgRef = useRef(null)

  useEffect(() => {
    fetch('/data/semanticka_podobnost.json').then(r => r.json()).then(setSemData)
  }, [])

  useEffect(() => {
    const update = () => setDimensions({ width: window.innerWidth, height: window.innerHeight })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // Build graph data
  const graphData = useMemo(() => {
    if (!semData) return null
    const krajNames = semData.kraje

    // Node color: shades of one blue for NACE, grey for non-NACE
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
          linkList.push({
            source: krajNames[i],
            target: krajNames[j],
            similarity: sim,
          })
        }
      }
    }
    return { nodes: nodeList, links: linkList }
  }, [semData])

  // Run force simulation — spread across most of the screen
  useEffect(() => {
    if (!graphData || dimensions.width === 0) return

    const { width, height } = dimensions
    const cx = width * 0.46
    const cy = height * 0.50
    const pad = 60

    const nodesCopy = graphData.nodes.map(n => ({ ...n }))
    const linksCopy = graphData.links.map(l => ({
      ...l,
      source: nodesCopy.find(n => n.id === l.source),
      target: nodesCopy.find(n => n.id === l.target),
    }))

    if (simRef.current) simRef.current.stop()

    const sim = d3.forceSimulation(nodesCopy)
      .force('link', d3.forceLink(linksCopy).id(d => d.id)
        .distance(d => (1 - d.similarity) * 400 + 60)
        .strength(d => d.similarity * 0.8))
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(cx, cy).strength(0.04))
      .force('collision', d3.forceCollide().radius(44))
      .force('x', d3.forceX(cx).strength(0.015))
      .force('y', d3.forceY(cy).strength(0.015))
      .on('tick', () => {
        for (const n of nodesCopy) {
          n.x = Math.max(pad, Math.min(width - pad, n.x))
          n.y = Math.max(pad + 40, Math.min(height - pad - 20, n.y))
        }
        setNodes([...nodesCopy])
        setLinks([...linksCopy])
      })

    simRef.current = sim
    dragRef.current = { nodesCopy, sim }

    // Pre-settle more iterations for spread layout
    for (let i = 0; i < 350; i++) sim.tick()
    sim.alpha(0.06).restart()

    return () => sim.stop()
  }, [graphData, dimensions])

  // Drag handler
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

  // Stats
  const stats = useMemo(() => {
    if (!graphData) return null
    const edgeCount = graphData.links.length
    const maxPairs = graphData.nodes.length * (graphData.nodes.length - 1) / 2
    const strongest = graphData.links.length > 0
      ? graphData.links.reduce((best, l) => l.similarity > best.similarity ? l : best)
      : null
    return { edgeCount, maxPairs, strongest }
  }, [graphData])

  // Connected nodes for hover highlight
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

  if (!semData || nodes.length === 0 || !stats) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#f8f9fa]">
        <p className="text-[#777] text-lg">Načítám data…</p>
      </div>
    )
  }

  const { width, height } = dimensions
  const fmt = (n) => n.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // Scales
  const simValues = links.map(l => l.similarity)
  const minSim = Math.min(...simValues, EDGE_THRESHOLD)
  const maxSim = Math.max(...simValues, 0.72)
  const edgeWidthScale = d3.scaleLinear().domain([minSim, maxSim]).range([1.5, 7])
  const edgeColorScale = d3.scaleLinear()
    .domain([minSim, (minSim + maxSim) / 2, maxSim])
    .range(['#B3D9F2', '#0087CD', '#0A416E'])

  const nodeRadius = d3.scaleLinear()
    .domain([d3.min(nodes, d => d.domainCount), d3.max(nodes, d => d.domainCount)])
    .range([20, 34])

  // Text detail ring thickness: thicker = more text per domain
  const textLenValues = nodes.map(d => d.avgTextLen)
  const ringScale = d3.scaleLinear()
    .domain([Math.min(...textLenValues), Math.max(...textLenValues)])
    .range([1.5, 5])

  return (
    <div className="w-full h-full bg-[#f8f9fa] relative overflow-hidden">
      <InfoPanel text={INFO_TEXT} />

      {/* Title */}
      <div className="absolute top-4 left-6 z-10" style={{ maxWidth: width * 0.50 }}>
        <h2 className="text-2xl font-bold text-[#0A416E]">
          Síť tematické blízkosti krajů
        </h2>
        <p className="text-[13px] text-[#0A416E] mt-1 font-medium">
          Sémantická podobnost domén specializace z krajských karet
        </p>
        <p className="text-xs text-[#777] mt-0.5">
          Hrana = cosine similarity textů domén &gt; {EDGE_THRESHOLD} &middot; Uzly lze přetahovat myší
        </p>
      </div>

      <svg ref={svgRef} width={width} height={height} className="absolute inset-0">
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
              {/* Glow on hover */}
              {isHovered && (
                <circle cx={node.x} cy={node.y} r={r + 8}
                  fill="none" stroke={node.color} strokeWidth={3} opacity={0.35} />
              )}
              {/* Shadow */}
              <circle cx={node.x + 1} cy={node.y + 1} r={r} fill="rgba(0,0,0,0.1)" />
              {/* Detail ring — thicker = more text per domain */}
              <circle cx={node.x} cy={node.y} r={r + ring / 2 + 1}
                fill="none" stroke={node.hasNace ? '#0A416E' : '#9B9BA0'}
                strokeWidth={ring} opacity={0.3} />
              {/* Node circle */}
              <circle cx={node.x} cy={node.y} r={r}
                fill={node.color}
                stroke="white" strokeWidth={2.5}
              />
              {/* Acronym label */}
              <text x={node.x} y={node.y - 1}
                textAnchor="middle" dominantBaseline="central"
                fontSize={12} fontWeight={700} fill="white"
                style={{ pointerEvents: 'none', textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}>
                {node.acronym}
              </text>
              {/* Domain count below acronym */}
              <text x={node.x} y={node.y + 11}
                textAnchor="middle" dominantBaseline="central"
                fontSize={8} fill="rgba(255,255,255,0.8)"
                style={{ pointerEvents: 'none' }}>
                {node.domainCount} dom.
              </text>
            </g>
          )
        })}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div className="map-tooltip" style={{
          left: Math.min(tooltip.x + 14, width - 320),
          top: Math.max(tooltip.y - 12, 10),
        }}>
          {tooltip.type === 'node' ? (
            <>
              <div className="tooltip-title">{tooltip.name}</div>
              <div className="tooltip-value">Domén specializace: <strong>{tooltip.domainCount}</strong></div>
              <div className="tooltip-value">Prům. délka popisu domény: <strong>{tooltip.avgTextLen} znaků</strong></div>
              <div className="tooltip-value">Prům. sém. podobnost s ostatními: <strong>{fmt(tooltip.avgSim)}</strong></div>
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

      {/* Legend — top right */}
      <div className="absolute top-4 right-8 z-10 bg-white/92 rounded-lg px-4 py-3 shadow-sm" style={{ maxWidth: 250 }}>
        <div className="text-[11px] font-bold text-[#0A416E] mb-2">Legenda</div>

        <div className="text-[10px] text-[#0A416E] mb-1 font-medium">Barva uzlu (odstín modré):</div>
        <div className="flex items-center gap-1.5 mb-1">
          <svg width={80} height={12}>
            <defs>
              <linearGradient id="node-grad">
                <stop offset="0%" stopColor="#B3D9F2" />
                <stop offset="50%" stopColor="#0087CD" />
                <stop offset="100%" stopColor="#0A416E" />
              </linearGradient>
            </defs>
            <rect width={80} height={12} rx={6} fill="url(#node-grad)" />
          </svg>
          <span className="text-[10px] text-[#777]">nízká → vysoká prům. podobnost</span>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <div style={{ width: 14, height: 14, background: '#CDCDD2', borderRadius: '50%' }} />
          <span className="text-[10px] text-[#777]">Kraj bez CZ-NACE kódů</span>
        </div>

        <div className="text-[10px] text-[#0A416E] mb-1 font-medium">Velikost a obrys uzlu:</div>
        <div className="text-[10px] text-[#777] leading-snug mb-2">
          Velikost ∝ počet domén<br />
          Obrys (ring) ∝ podrobnost popisu domén v kartě
        </div>

        <div className="text-[10px] text-[#0A416E] mb-1 font-medium">Hrany:</div>
        <div className="flex items-center gap-2">
          <svg width={50} height={10}>
            <line x1={0} y1={5} x2={20} y2={5} stroke="#B3D9F2" strokeWidth={1.5} strokeLinecap="round" />
            <line x1={28} y1={5} x2={50} y2={5} stroke="#0A416E" strokeWidth={5} strokeLinecap="round" />
          </svg>
          <span className="text-[10px] text-[#777]">slabší → silnější podobnost</span>
        </div>
        <div className="text-[10px] text-[#777] mt-1">
          Práh: cosine sim &gt; {EDGE_THRESHOLD}
        </div>
      </div>

      {/* Commentary — bottom left */}
      <div className="absolute bottom-12 left-8 z-10 bg-white/92 rounded-lg px-4 py-3 shadow-sm" style={{ maxWidth: width * 0.42 }}>
        <p className="text-[11px] text-[#0A416E] leading-relaxed">
          <strong>Postup:</strong> Texty domén z krajských karet převedeny jazykovým modelem na vektory (embeddings).
          Podobnost měřena cosine similarity. V síti je <strong>{stats.edgeCount} hran</strong> z {stats.maxPairs} možných párů.
          {stats.strongest && (
            <> Nejsilnější vazba: <strong>{ACRONYM[stats.strongest.source?.id]}–{ACRONYM[stats.strongest.target?.id]}</strong> ({fmt(stats.strongest.similarity)}).</>
          )}
        </p>
        <p className="text-[10px] text-[#666] mt-2 leading-relaxed">
          <strong>Pozn.:</strong> Podrobnost popisů domén se mezi kraji výrazně liší
          (od ~35 do ~655 znaků v průměru na doménu). To ovlivňuje kvalitu textového matchingu —
          kraje s kratšími popisy mají méně informací pro srovnání.
        </p>
      </div>

      {/* Source */}
      <div className="absolute bottom-3 left-0 right-0 text-center text-[10px] text-[#777] z-10">
        Zdroj: Krajské karty, Příloha 2 NRIS3 v08 (MPO, 2026) &middot; Embeddings: {semData.model}
      </div>
    </div>
  )
}
