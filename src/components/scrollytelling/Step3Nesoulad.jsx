import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'

export default function Step3Nesoulad({ insight, active }) {
  const svgRef = useRef()
  const [animated, setAnimated] = useState(false)

  // Draw structure once
  useEffect(() => {
    if (!insight || !svgRef.current) return

    const svg = d3.select(svgRef.current)
    const width = svgRef.current.clientWidth || 500
    const height = 400

    svg.attr('viewBox', `0 0 ${width} ${height}`)
    svg.selectAll('*').remove()

    const featured = insight
      .filter(k => k.kraj !== 'Hl. m. Praha' && k.totalNaklady > 500000)
      .slice(0, 4)
    if (featured.length === 0) return

    const barHeight = 20
    const margin = { top: 8, right: 20, bottom: 8, left: 50 }
    const groupHeight = featured[0].topFord.length * (barHeight + 5) + 28
    const totalH = featured.length * groupHeight
    const scale = Math.min(1, (height - margin.top - margin.bottom) / totalH)

    const root = svg.append('g')
      .attr('transform', `translate(0,${margin.top}) scale(${scale})`)

    featured.forEach((kraj, ki) => {
      const g = root.append('g')
        .attr('transform', `translate(0, ${ki * groupHeight})`)

      g.append('text')
        .attr('x', margin.left - 6)
        .attr('y', 10)
        .attr('text-anchor', 'end')
        .attr('font-size', 13)
        .attr('font-weight', 700)
        .attr('fill', '#1a2e44')
        .text(kraj.zkratka)

      const xScale = d3.scaleLinear()
        .domain([0, d3.max(kraj.topFord, d => d.naklady)])
        .range([0, width - margin.left - margin.right])

      kraj.topFord.forEach((ford, fi) => {
        const barG = g.append('g')
          .attr('class', 'bar')
          .attr('transform', `translate(${margin.left}, ${fi * (barHeight + 5)})`)

        barG.append('rect')
          .attr('width', 0)
          .attr('height', barHeight)
          .attr('fill', '#4e79a7')
          .attr('rx', 4)
          .attr('data-target-width', xScale(ford.naklady))

        barG.append('text')
          .attr('x', 8)
          .attr('y', barHeight / 2)
          .attr('dominant-baseline', 'central')
          .attr('font-size', 11)
          .attr('fill', '#fff')
          .attr('font-weight', 500)
          .attr('opacity', 0)
          .text(`${ford.ford} — ${ford.pocet} proj.`)
      })
    })

    setAnimated(false)
  }, [insight])

  // Animate bars
  useEffect(() => {
    if (!active || animated || !svgRef.current) return

    const svg = d3.select(svgRef.current)

    svg.selectAll('.bar rect')
      .transition()
      .duration(600)
      .delay((_, i) => i * 80)
      .ease(d3.easeCubicOut)
      .attr('width', function () {
        return +d3.select(this).attr('data-target-width')
      })

    svg.selectAll('.bar text')
      .transition()
      .duration(350)
      .delay((_, i) => 250 + i * 80)
      .attr('opacity', 1)

    setAnimated(true)
  }, [active, animated])

  if (!insight) return null

  return <svg ref={svgRef} className="w-full" style={{ height: 400 }} />
}
