import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { useData } from '../../lib/DataContext'
import { nameToZkratka } from '../../lib/kraje'

const CLUSTER_COLORS = ['#4e79a7', '#e15759', '#59a14f', '#f28e2b']

export default function Step2Clusters({ insight, active }) {
  const svgRef = useRef()
  const { data } = useData()
  const [drawn, setDrawn] = useState(false)

  useEffect(() => {
    if (!insight || !data?.geoJson || !svgRef.current) return

    const svg = d3.select(svgRef.current)
    const width = svgRef.current.clientWidth || 500
    const height = Math.round(width * 0.72)

    svg.attr('viewBox', `0 0 ${width} ${height}`)
    svg.selectAll('*').remove()

    const projection = d3.geoMercator().fitSize(
      [width - 20, height - 40],
      data.geoJson
    )

    const path = d3.geoPath().projection(projection)
    const g = svg.append('g')

    // Draw regions
    const regions = g.selectAll('path')
      .data(data.geoJson.features)
      .join('path')
      .attr('d', path)
      .attr('fill', '#e5e7eb')
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)

    // Labels (abbreviations centered on each region)
    g.selectAll('text.label')
      .data(data.geoJson.features)
      .join('text')
      .attr('class', 'label')
      .attr('x', d => path.centroid(d)[0])
      .attr('y', d => path.centroid(d)[1])
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', 9)
      .attr('font-weight', 600)
      .attr('fill', '#fff')
      .attr('opacity', 0)
      .text(d => nameToZkratka(data.krajeKodovnik, d.properties.nazev))

    setDrawn(false)
  }, [insight, data])

  // Separate effect for animation — triggers on `active` change
  useEffect(() => {
    if (!insight || !svgRef.current || !active || drawn) return

    const svg = d3.select(svgRef.current)

    svg.selectAll('path')
      .transition()
      .duration(700)
      .delay((_, i) => i * 50)
      .attr('fill', d => {
        const name = d.properties?.nazev
        const clusterId = insight.krajCluster[name]
        return clusterId != null
          ? CLUSTER_COLORS[clusterId % CLUSTER_COLORS.length]
          : '#e5e7eb'
      })

    svg.selectAll('text.label')
      .transition()
      .duration(400)
      .delay((_, i) => 500 + i * 40)
      .attr('opacity', 0.9)

    setDrawn(true)
  }, [active, insight, drawn])

  if (!insight) return null

  return (
    <div>
      <svg ref={svgRef} className="w-full" style={{ minHeight: 280 }} />
      <div className="flex flex-wrap gap-3 mt-3 justify-center">
        {insight.clusters.map((cluster, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs text-ris3-gray-700">
            <span
              className="w-3 h-3 rounded-sm inline-block"
              style={{ backgroundColor: CLUSTER_COLORS[i] }}
            />
            Skupina {i + 1} ({cluster.members.length} krajů)
          </div>
        ))}
      </div>
    </div>
  )
}
