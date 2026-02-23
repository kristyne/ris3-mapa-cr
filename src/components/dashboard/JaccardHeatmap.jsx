import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { useData } from '../../lib/DataContext'
import { jaccardMatrix, getKrajNaceCodes } from '../../lib/domeny'
import { nameToZkratka } from '../../lib/kraje'
import SourceNote from '../shared/SourceNote'

/**
 * C. Doménová matice — Jaccard heatmap 14×14.
 */
export default function JaccardHeatmap({ onSelectKraj }) {
  const svgRef = useRef()
  const { data } = useData()
  const [tooltip, setTooltip] = useState(null)

  useEffect(() => {
    if (!data || !svgRef.current) return

    const { krajNames, matrix } = jaccardMatrix(data.domenyKraje, data.krajeKodovnik)
    const n = krajNames.length
    const labels = krajNames.map(name => nameToZkratka(data.krajeKodovnik, name))

    const svg = d3.select(svgRef.current)
    const containerWidth = svgRef.current.clientWidth || 500
    const margin = { top: 45, right: 10, bottom: 10, left: 45 }
    const size = Math.min(containerWidth - margin.left - margin.right, 450)
    const cellSize = size / n
    const width = size + margin.left + margin.right
    const height = size + margin.top + margin.bottom

    svg.attr('viewBox', `0 0 ${width} ${height}`)
    svg.selectAll('*').remove()

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const colorScale = d3.scaleSequential(d3.interpolateYlOrRd).domain([0, 0.5])

    // Cells
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const val = matrix[i][j]
        g.append('rect')
          .attr('x', j * cellSize)
          .attr('y', i * cellSize)
          .attr('width', cellSize - 1)
          .attr('height', cellSize - 1)
          .attr('fill', i === j ? '#e9ecef' : colorScale(val))
          .attr('rx', 2)
          .attr('cursor', 'pointer')
          .on('mouseenter', (event) => {
            const sharedNace = findSharedNace(data.domenyKraje, krajNames[i], krajNames[j])
            setTooltip({
              x: event.offsetX,
              y: event.offsetY,
              krajA: krajNames[i],
              krajB: krajNames[j],
              jaccard: val,
              sharedNace,
            })
          })
          .on('mousemove', (event) => {
            setTooltip(prev => prev ? { ...prev, x: event.offsetX, y: event.offsetY } : null)
          })
          .on('mouseleave', () => setTooltip(null))
          .on('click', () => {
            if (i !== j && onSelectKraj) {
              const kraj = data.krajeKodovnik.kraje.find(k => k.nazev === krajNames[i])
              if (kraj) onSelectKraj(kraj.kod_nuts)
            }
          })

        // Value text for larger cells
        if (cellSize > 28 && i !== j) {
          g.append('text')
            .attr('x', j * cellSize + cellSize / 2)
            .attr('y', i * cellSize + cellSize / 2)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'central')
            .attr('font-size', Math.min(9, cellSize * 0.35))
            .attr('fill', val > 0.25 ? '#fff' : '#495057')
            .attr('pointer-events', 'none')
            .text(val > 0 ? val.toFixed(2) : '')
        }
      }
    }

    // Column labels (top)
    g.selectAll('text.col')
      .data(labels)
      .join('text')
      .attr('class', 'col')
      .attr('x', (_, i) => i * cellSize + cellSize / 2)
      .attr('y', -6)
      .attr('text-anchor', 'middle')
      .attr('font-size', Math.min(10, cellSize * 0.38))
      .attr('fill', '#495057')
      .text(d => d)

    // Row labels (left)
    g.selectAll('text.row')
      .data(labels)
      .join('text')
      .attr('class', 'row')
      .attr('x', -6)
      .attr('y', (_, i) => i * cellSize + cellSize / 2)
      .attr('text-anchor', 'end')
      .attr('dominant-baseline', 'central')
      .attr('font-size', Math.min(10, cellSize * 0.38))
      .attr('fill', '#495057')
      .text(d => d)

  }, [data, onSelectKraj])

  if (!data) return null

  return (
    <div className="relative">
      <svg ref={svgRef} className="w-full" style={{ minHeight: 300 }} />
      {tooltip && (
        <div
          className="absolute bg-white border border-ris3-gray-200 shadow-lg rounded px-3 py-2 text-xs pointer-events-none z-10"
          style={{
            left: Math.min(tooltip.x + 10, (svgRef.current?.clientWidth || 400) - 200),
            top: tooltip.y + 10,
          }}
        >
          <div className="font-semibold">
            {tooltip.krajA} × {tooltip.krajB}
          </div>
          <div className="text-ris3-gray-500">
            Jaccard: <strong>{tooltip.jaccard.toFixed(3)}</strong>
          </div>
          {tooltip.sharedNace.length > 0 && (
            <div className="mt-1 text-ris3-gray-500">
              Sdílené NACE: {tooltip.sharedNace.join(', ')}
            </div>
          )}
        </div>
      )}
      <SourceNote>Jaccard index nad CZ-NACE kódy, NRIS3 Příloha 2 v08</SourceNote>
    </div>
  )
}

function findSharedNace(domenyKraje, krajA, krajB) {
  const setA = getKrajNaceCodes(domenyKraje, krajA)
  const setB = getKrajNaceCodes(domenyKraje, krajB)
  return [...setA].filter(c => setB.has(c)).sort()
}
