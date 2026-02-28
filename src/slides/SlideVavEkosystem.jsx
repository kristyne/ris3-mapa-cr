import { useState, useEffect, useMemo } from 'react'
import * as d3 from 'd3'
import InfoPanel from '../InfoPanel'

const INFO_TEXT = `Tento slide propojuje projekty z IS VaVaI (CEP, 2021–2025) s doménami specializace z krajských karet (Příloha 2 NRIS3) pomocí dvou nezávislých metod. FORD matching porovnává oborovou klasifikaci projektu s tematickým zaměřením domén. Sémantický matching využívá jazykový model k porovnání textu projektu (název + klíčová slova) s popisy domén. Kombinace metod odhaluje čtyři situace: silná shoda (obor i obsah sedí), skrytý potenciál (obsah blízký, ale jiný obor), formální shoda (obor sedí, ale obsah se liší) a bez shody.`

const SEGMENTS = [
  { key: 'v_obou',        label: 'Obor i obsah',    shortLabel: 'FORD + sém.',  color: '#0A416E', desc: 'Oborová klasifikace (FORD) i textový obsah projektu odpovídají doméně kraje' },
  { key: 'jen_semantic',   label: 'Jen obsah',       shortLabel: 'Jen sém.',     color: '#0087CD', desc: 'Text projektu je blízký doméně, ale oborová klasifikace neodpovídá' },
  { key: 'jen_ford',       label: 'Jen obor',        shortLabel: 'Jen FORD',     color: '#FFB830', desc: 'Oborová klasifikace odpovídá, ale textový obsah se liší' },
  { key: 'mimo_vse',       label: 'Bez shody',       shortLabel: 'Bez shody',    color: '#CDCDD2', desc: 'Projekt neodpovídá žádné doméně kraje ani oborem, ani obsahem' },
]

const SHORT = {
  'Hl. m. Praha': 'Praha', 'Středočeský kraj': 'Středočeský', 'Jihočeský kraj': 'Jihočeský',
  'Plzeňský kraj': 'Plzeňský', 'Karlovarský kraj': 'Karlovarský', 'Ústecký kraj': 'Ústecký',
  'Liberecký kraj': 'Liberecký', 'Královéhradecký kraj': 'Královéhradecký', 'Pardubický kraj': 'Pardubický',
  'Vysočina': 'Vysočina', 'Jihomoravský kraj': 'Jihomoravský', 'Olomoucký kraj': 'Olomoucký',
  'Zlínský kraj': 'Zlínský', 'Moravskoslezský kraj': 'Moravskoslezský',
}

export default function SlideVavEkosystem() {
  const [data, setData] = useState(null)
  const [tooltip, setTooltip] = useState(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  useEffect(() => {
    fetch('/data/vav_semantic_match.json').then(r => r.json()).then(setData)
  }, [])

  useEffect(() => {
    const update = () => setDimensions({ width: window.innerWidth, height: window.innerHeight })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // Sort kraje by total projects descending
  const sortedKraje = useMemo(() => {
    if (!data) return null
    return Object.entries(data.kraje)
      .sort((a, b) => b[1].celkem_projektu - a[1].celkem_projektu)
  }, [data])

  if (!sortedKraje || dimensions.width === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#f8f9fa]">
        <p className="text-[#777] text-lg">Načítám data…</p>
      </div>
    )
  }

  const { width, height } = dimensions

  // Chart layout — left 60% for bars, right 40% for explanations
  const chartLeft = 160
  const chartRight = width * 0.58
  const chartTop = height * 0.22
  const chartBottom = height * 0.82
  const chartW = chartRight - chartLeft
  const barCount = sortedKraje.length
  const barGroupH = (chartBottom - chartTop) / barCount
  const barH = Math.min(barGroupH * 0.65, 26)

  const maxTotal = Math.max(...sortedKraje.map(([, s]) => s.celkem_projektu))
  const xScale = d3.scaleLinear().domain([0, maxTotal]).range([0, chartW])

  // Totals for commentary
  const totals = sortedKraje.reduce((acc, [, s]) => ({
    total: acc.total + s.celkem_projektu,
    v_obou: acc.v_obou + s.v_obou,
    jen_semantic: acc.jen_semantic + s.jen_semantic,
    jen_ford: acc.jen_ford + s.jen_ford,
    mimo_vse: acc.mimo_vse + s.mimo_vse,
  }), { total: 0, v_obou: 0, jen_semantic: 0, jen_ford: 0, mimo_vse: 0 })

  const pctAligned = totals.total > 0
    ? ((totals.v_obou + totals.jen_semantic) / totals.total * 100).toFixed(0)
    : 0
  const pctBothTotal = totals.total > 0
    ? (totals.v_obou / totals.total * 100).toFixed(0)
    : 0

  // Nice x-axis ticks
  const ticks = d3.scaleLinear().domain([0, maxTotal]).ticks(5)

  return (
    <div className="w-full h-full bg-[#f8f9fa] relative overflow-hidden">
      <InfoPanel text={INFO_TEXT} />

      {/* Title */}
      <div className="absolute top-4 left-6 z-10" style={{ maxWidth: width * 0.55 }}>
        <h2 className="text-2xl font-bold text-[#0A416E]">
          Jak se výzkumné projekty shodují s doménami specializace?
        </h2>
        <p className="text-sm text-[#777] mt-1">
          {data.meta.pocet_projektu.toLocaleString('cs-CZ')} projektů CEP (2021–2025) porovnáno s popisy domén z krajských karet (Příloha 2 NRIS3)
        </p>
      </div>

      {/* Right panel: Step-by-step methodology — positioned in bottom-right */}
      <div className="absolute z-10" style={{ left: width * 0.60, bottom: height * 0.06, width: width * 0.37 }}>
        <div className="bg-white/95 rounded-lg px-4 py-3 shadow-sm border border-[#E3F2FD]">
          <div className="text-xs font-bold text-[#0A416E] mb-2">Co se tady děje? — Postup krok za krokem</div>

          <div className="text-[11px] text-[#0A416E] leading-relaxed space-y-1.5">
            <div className="flex gap-2">
              <span className="font-bold text-[#0087CD] shrink-0">1.</span>
              <span>Vzali jsme <strong>{data.meta.pocet_projektu.toLocaleString('cs-CZ')} výzkumných projektů</strong> z databáze IS VaVaI (název, klíčová slova, oborové zařazení FORD).</span>
            </div>
            <div className="flex gap-2">
              <span className="font-bold text-[#0087CD] shrink-0">2.</span>
              <span>Vzali jsme <strong>popisy domén specializace</strong> z krajských karet NRIS3 (co kraj deklaruje jako své priority).</span>
            </div>
            <div className="flex gap-2">
              <span className="font-bold text-[#0087CD] shrink-0">3.</span>
              <span><strong>Test A — obor (FORD):</strong> Porovnali jsme oborové zařazení projektu s tematickým zaměřením domén. Sedí obor projektu k doméně?</span>
            </div>
            <div className="flex gap-2">
              <span className="font-bold text-[#0087CD] shrink-0">4.</span>
              <span><strong>Test B — obsah (AI):</strong> Jazykový model přečetl text projektu a text domény a změřil, jak moc si jsou obsahově blízké (cosine similarity &gt; 0,35).</span>
            </div>
            <div className="flex gap-2">
              <span className="font-bold text-[#0087CD] shrink-0">5.</span>
              <span>Každý projekt tak spadne do jedné ze <strong>4 kategorií</strong> — viz legenda níže.</span>
            </div>
          </div>
        </div>

        {/* Legend with detailed descriptions */}
        <div className="bg-white/95 rounded-lg px-4 py-3 shadow-sm mt-3">
          <div className="text-xs font-bold text-[#0A416E] mb-2">4 kategorie shody</div>
          {SEGMENTS.map(seg => (
            <div key={seg.key} className="flex items-baseline gap-2 mt-1.5">
              <div className="shrink-0 relative" style={{ width: 12, height: 12, top: '1px' }}>
                <div style={{ width: 12, height: 12, background: seg.color, borderRadius: 2, opacity: seg.key === 'mimo_vse' ? 0.5 : 0.85 }} />
              </div>
              <div>
                <span className="text-[11px] font-semibold text-[#0A416E]">{seg.label}</span>
                <span className="text-[11px] text-[#555] ml-1">— {seg.desc}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Summary numbers */}
        <div className="bg-white/95 rounded-lg px-4 py-3 shadow-sm mt-3">
          <div className="text-xs font-bold text-[#0A416E] mb-1">Celkem za ČR</div>
          <div className="text-[11px] text-[#0A416E] leading-relaxed">
            Z {totals.total.toLocaleString('cs-CZ')} projektů:
            <strong className="ml-1" style={{ color: '#0A416E' }}>{pctBothTotal} %</strong> odpovídá oborem i obsahem,
            <strong className="ml-1" style={{ color: '#0087CD' }}>{pctAligned} %</strong> je obsahově blízkých (sémanticky).
            {' '}Zbývajících {(100 - parseInt(pctAligned))} % projektů se s doménami kraje tematicky nepřekrývá.
          </div>
        </div>
      </div>

      <svg width={width} height={height} className="absolute inset-0">
        {/* X axis gridlines */}
        {ticks.map(tick => (
          <g key={`xt-${tick}`}>
            <line
              x1={chartLeft + xScale(tick)} y1={chartTop - 5}
              x2={chartLeft + xScale(tick)} y2={chartBottom + 5}
              stroke="#eee" strokeWidth={tick === 0 ? 1 : 0.5}
            />
            <text
              x={chartLeft + xScale(tick)} y={chartBottom + 18}
              textAnchor="middle" fontSize={11} fill="#777">
              {tick.toLocaleString('cs-CZ')}
            </text>
          </g>
        ))}
        <text x={chartLeft + chartW / 2} y={chartBottom + 34} textAnchor="middle" fontSize={12} fill="#0A416E" fontWeight={500}>
          Počet výzkumných projektů
        </text>

        {/* Bars */}
        {sortedKraje.map(([krajName, stats], i) => {
          const y = chartTop + i * barGroupH + (barGroupH - barH) / 2
          const total = stats.celkem_projektu
          const pctBoth = total > 0 ? ((stats.v_obou + stats.jen_semantic) / total * 100).toFixed(0) : '—'

          let x = chartLeft
          return (
            <g key={krajName}>
              {/* Label */}
              <text
                x={chartLeft - 8} y={y + barH / 2}
                textAnchor="end" dominantBaseline="central"
                fontSize={12} fill="#0A416E" fontWeight={500}>
                {SHORT[krajName] || krajName}
              </text>

              {/* Stacked segments */}
              {SEGMENTS.map(seg => {
                const val = stats[seg.key]
                if (val <= 0) return null
                const w = xScale(val)
                const rx = x
                x += w
                return (
                  <rect key={seg.key} x={rx} y={y} width={w} height={barH} rx={2}
                    fill={seg.color} opacity={seg.key === 'mimo_vse' ? 0.5 : 0.85}
                    onMouseMove={(e) => setTooltip({ x: e.clientX, y: e.clientY, kraj: krajName, stats, segment: seg.key })}
                    onMouseLeave={() => setTooltip(null)}
                    style={{ cursor: 'pointer' }}
                  />
                )
              })}

              {/* Count + percentage label */}
              <text
                x={chartLeft + xScale(total) + 6} y={y + barH / 2}
                dominantBaseline="central" fontSize={11} fill="#555">
                {total.toLocaleString('cs-CZ')} ({pctBoth} % obsah. blízkých)
              </text>
            </g>
          )
        })}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div className="map-tooltip" style={{
          left: Math.min(tooltip.x + 12, width - 340),
          top: Math.max(tooltip.y - 10, 10),
        }}>
          <div className="tooltip-title">{tooltip.kraj}</div>
          <div className="tooltip-value">Celkem projektů: <strong>{tooltip.stats.celkem_projektu.toLocaleString('cs-CZ')}</strong></div>
          <div style={{ marginTop: 4, fontSize: 11 }}>
            {SEGMENTS.map(seg => (
              <div key={seg.key} style={{ marginTop: 2, fontWeight: seg.key === tooltip.segment ? 700 : 400 }}>
                <span style={{ color: seg.color }}>■</span>{' '}
                {seg.label}: {tooltip.stats[seg.key]}
                {tooltip.stats.celkem_projektu > 0 && (
                  <span style={{ color: '#999' }}> ({(tooltip.stats[seg.key] / tooltip.stats.celkem_projektu * 100).toFixed(1)} %)</span>
                )}
              </div>
            ))}
          </div>
          {tooltip.stats.top_domeny?.length > 0 && (
            <div style={{ marginTop: 6, borderTop: '1px solid #eee', paddingTop: 4, fontSize: 10 }}>
              <div style={{ fontWeight: 600, color: '#0A416E' }}>Nejčastěji matchující domény:</div>
              {tooltip.stats.top_domeny.slice(0, 3).map((d, i) => (
                <div key={i} style={{ color: '#555', marginTop: 1 }}>
                  {d.nazev.length > 45 ? d.nazev.slice(0, 45) + '…' : d.nazev}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Source */}
      <div className="absolute bottom-4 left-0 right-0 text-center text-[10px] text-[#777] z-10 px-8">
        Zdroj: IS VaVaI / Starfos (2021–2025) &middot; Krajské karty, Příloha 2 NRIS3 v08 (MPO, 2026)
        &middot; Model: {data.meta.model} &middot; Sémantický práh: cosine sim &gt; {data.meta.threshold_semantic}
      </div>
    </div>
  )
}
