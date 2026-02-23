import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { useData } from '../../lib/DataContext'
import { spolupraceChordData } from '../../lib/projekty'
import { nameToZkratka } from '../../lib/kraje'

export default function Step5Spoluprace({ insight, active }) {
  const svgRef = useRef()
  const { data } = useData()
  const [animated, setAnimated] = useState(false)

  // Draw structure
  useEffect(() => {
    if (!data || !insight || !svgRef.current) return

    const svg = d3.select(svgRef.current)
    const size = Math.min(svgRef.current.clientWidth || 420, 420)
    const outerRadius = size / 2 - 35
    const innerRadius = outerRadius - 18

    svg.attr('viewBox', `0 0 ${size} ${size}`)
    svg.selectAll('*').remove()

    const { names, matrix } = spolupraceChordData(data.agregaty, data.krajeKodovnik)

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
    const arcs = g.selectAll('g.arc')
      .data(chords.groups)
      .join('g')
      .attr('class', 'arc')

    arcs.append('path')
      .attr('d', arc)
      .attr('fill', d => color(names[d.index]))
      .attr('stroke', '#fff')
      .attr('stroke-width', 1)
      .attr('opacity', 0.15)

    arcs.each(function (d) {
      d.angle = (d.startAngle + d.endAngle) / 2
      const flip = d.angle > Math.PI
      d3.select(this).append('text')
        .attr('transform', `rotate(${d.angle * 180 / Math.PI - 90}) translate(${outerRadius + 8}) ${flip ? 'rotate(180)' : ''}`)
        .attr('text-anchor', flip ? 'end' : 'start')
        .attr('dominant-baseline', 'central')
        .attr('font-size', 9)
        .attr('font-weight', 600)
        .attr('fill', '#3b4252')
        .attr('opacity', 0)
        .text(nameToZkratka(data.krajeKodovnik, names[d.index]))
    })

    // Ribbons
    g.selectAll('path.ribbon')
      .data(chords)
      .join('path')
      .attr('class', 'ribbon')
      .attr('d', ribbon)
      .attr('fill', d => color(names[d.source.index]))
      .attr('stroke', 'none')
      .attr('opacity', 0)

    setAnimated(false)
  }, [data, insight])

  // Animate
  useEffect(() => {
    if (!active || animated || !svgRef.current) return

    const svg = d3.select(svgRef.current)

    svg.selectAll('.arc path')
      .transition()
      .duration(500)
      .delay((_, i) => i * 30)
      .attr('opacity', 0.85)

    svg.selectAll('.arc text')
      .transition()
      .duration(350)
      .delay((_, i) => 300 + i * 30)
      .attr('opacity', 1)

    svg.selectAll('.ribbon')
      .transition()
      .duration(600)
      .delay((_, i) => 400 + i * 12)
      .attr('opacity', 0.35)

    setAnimated(true)
  }, [active, animated])

  if (!insight) return null

  return (
    <svg
      ref={svgRef}
      className="w-full mx-auto block"
      style={{ height: 420, maxWidth: 420 }}
    />
  )
}
