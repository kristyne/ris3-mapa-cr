import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'

export default function Step1Domeny({ insight, active }) {
  const svgRef = useRef()
  const [animated, setAnimated] = useState(false)

  // Draw layout once
  useEffect(() => {
    if (!insight || !svgRef.current) return

    const svg = d3.select(svgRef.current)
    const width = svgRef.current.clientWidth || 500
    const height = 380

    svg.attr('viewBox', `0 0 ${width} ${height}`)
    svg.selectAll('*').remove()

    const data = insight.freq.slice(0, 25).map(f => ({
      nace: f.nace,
      count: f.count,
    }))

    const radiusScale = d3.scaleSqrt()
      .domain([1, d3.max(data, d => d.count)])
      .range([16, 46])

    const colorScale = d3.scaleSequential(d3.interpolateYlOrRd).domain([1, 14])

    const simulation = d3.forceSimulation(data)
      .force('x', d3.forceX(width / 2).strength(0.06))
      .force('y', d3.forceY(height / 2).strength(0.06))
      .force('collide', d3.forceCollide(d => radiusScale(d.count) + 4))
      .stop()
    for (let i = 0; i < 150; i++) simulation.tick()

    const g = svg.append('g')

    const bubbles = g.selectAll('g.bubble')
      .data(data)
      .join('g')
      .attr('class', 'bubble')
      .attr('transform', d => `translate(${d.x},${d.y})`)

    bubbles.append('circle')
      .attr('r', 0)
      .attr('fill', d => colorScale(d.count))
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .attr('opacity', 0.9)

    bubbles.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '-0.15em')
      .attr('font-size', d => Math.max(10, radiusScale(d.count) * 0.38))
      .attr('fill', '#fff')
      .attr('font-weight', 700)
      .attr('opacity', 0)
      .text(d => d.nace)

    bubbles.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '1.1em')
      .attr('font-size', d => Math.max(8, radiusScale(d.count) * 0.3))
      .attr('fill', 'rgba(255,255,255,0.8)')
      .attr('opacity', 0)
      .text(d => `${d.count}×`)

    setAnimated(false)
  }, [insight])

  // Animate on active
  useEffect(() => {
    if (!active || animated || !svgRef.current) return

    const svg = d3.select(svgRef.current)
    const data = insight?.freq?.slice(0, 25) || []

    const radiusScale = d3.scaleSqrt()
      .domain([1, d3.max(data, d => d.count) || 14])
      .range([16, 46])

    svg.selectAll('circle')
      .transition()
      .duration(500)
      .delay((_, i) => i * 25)
      .ease(d3.easeBackOut.overshoot(1.2))
      .attr('r', function () {
        const d = d3.select(this.parentNode).datum()
        return radiusScale(d.count)
      })

    svg.selectAll('text')
      .transition()
      .duration(350)
      .delay((_, i) => 300 + i * 15)
      .attr('opacity', 1)

    setAnimated(true)
  }, [active, animated, insight])

  if (!insight) return null

  return <svg ref={svgRef} className="w-full" style={{ height: 380 }} />
}
