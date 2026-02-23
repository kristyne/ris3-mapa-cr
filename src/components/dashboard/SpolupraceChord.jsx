import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { useData } from '../../lib/DataContext'
import { spolupraceChordData } from '../../lib/projekty'
import { nameToZkratka } from '../../lib/kraje'
import SourceNote from '../shared/SourceNote'

/**
 * E. Spolupráce — chord diagram mezikrajské spolupráce.
 */
export default function SpolupraceChord({ highlightKraj }) {
  const svgRef = useRef()
  const { data } = useData()
  const [tooltip, setTooltip] = useState(null)

  useEffect(() => {
    if (!data || !svgRef.current) return

    const svg = d3.select(svgRef.current)
    const containerWidth = svgRef.current.clientWidth || 450
    const size = Math.min(containerWidth, 450)
    const outerRadius = size / 2 - 35
    const innerRadius = outerRadius - 18

    svg.attr('viewBox', `0 0 ${size} ${size}`)
    svg.selectAll('*').remove()

    const { names, matrix } = spolupraceChordData(data.agregaty, data.krajeKodovnik)

    const highlightIdx = highlightKraj
      ? names.indexOf(data.krajeKodovnik.kraje.find(k => k.kod_nuts === highlightKraj)?.nazev)
      : -1

    const chord = d3.chord().padAngle(0.04).sortSubgroups(d3.descending)
    const chords = chord(matrix)

    const arc = d3.arc().innerRadius(innerRadius).outerRadius(outerRadius)
    const ribbon = d3.ribbon().radius(innerRadius)

    const color = d3.scaleOrdinal()
      .domain(names)
      .range(d3.schemeTableau10.concat(d3.schemeSet3))

    const g = svg.append('g')
      .attr('transform', `translate(${size / 2},${size / 2})`)

    // Arcs
    g.selectAll('g.arc')
      .data(chords.groups)
      .join('g')
      .attr('class', 'arc')
      .each(function (d) {
        const isHighlighted = highlightIdx === -1 || d.index === highlightIdx

        d3.select(this).append('path')
          .attr('d', arc)
          .attr('fill', color(names[d.index]))
          .attr('stroke', '#fff')
          .attr('opacity', isHighlighted ? 0.9 : 0.3)

        d.angle = (d.startAngle + d.endAngle) / 2
        const flip = d.angle > Math.PI

        d3.select(this).append('text')
          .attr('transform', `rotate(${d.angle * 180 / Math.PI - 90}) translate(${outerRadius + 8}) ${flip ? 'rotate(180)' : ''}`)
          .attr('text-anchor', flip ? 'end' : 'start')
          .attr('dominant-baseline', 'central')
          .attr('font-size', 9)
          .attr('fill', '#495057')
          .text(nameToZkratka(data.krajeKodovnik, names[d.index]))
      })

    // Ribbons
    g.selectAll('path.ribbon')
      .data(chords)
      .join('path')
      .attr('class', 'ribbon')
      .attr('d', ribbon)
      .attr('fill', d => color(names[d.source.index]))
      .attr('opacity', d => {
        if (highlightIdx === -1) return 0.35
        return (d.source.index === highlightIdx || d.target.index === highlightIdx) ? 0.6 : 0.05
      })
      .attr('cursor', 'pointer')
      .on('mouseenter', (event, d) => {
        setTooltip({
          x: event.offsetX,
          y: event.offsetY,
          a: names[d.source.index],
          b: names[d.target.index],
          value: matrix[d.source.index][d.target.index],
        })
      })
      .on('mouseleave', () => setTooltip(null))

  }, [data, highlightKraj])

  if (!data) return null

  return (
    <div className="relative">
      <svg ref={svgRef} className="w-full" style={{ maxWidth: 450, margin: '0 auto', minHeight: 300 }} />
      {tooltip && (
        <div
          className="absolute bg-white border border-ris3-gray-200 shadow-lg rounded px-3 py-2 text-xs pointer-events-none z-10"
          style={{ left: tooltip.x + 10, top: tooltip.y - 40 }}
        >
          <div className="font-semibold">{tooltip.a} × {tooltip.b}</div>
          <div className="text-ris3-gray-500">{tooltip.value} společných projektů</div>
        </div>
      )}
      <SourceNote>IS VaVaI/CEP 2021–2025, spolupráce = projekt s účastníky z obou krajů</SourceNote>
    </div>
  )
}
