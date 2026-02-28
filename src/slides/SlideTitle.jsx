import { useState, useEffect, useMemo } from 'react'
import * as d3 from 'd3'

export default function SlideTitle() {
  const [visible, setVisible] = useState(false)
  const [krajeGeo, setKrajeGeo] = useState(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 200)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/kraje.geojson`).then(r => r.json()).then(setKrajeGeo)
  }, [])

  useEffect(() => {
    const update = () => setDimensions({ width: window.innerWidth, height: window.innerHeight })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const pathData = useMemo(() => {
    if (!krajeGeo || dimensions.width === 0) return null
    const { width, height } = dimensions
    const mapW = width * 0.70
    const mapH = height * 0.70
    const proj = d3.geoMercator().fitSize([mapW, mapH], krajeGeo)
    const [tx, ty] = proj.translate()
    proj.translate([tx + (width - mapW) / 2, ty + (height - mapH) / 2 + height * 0.02])
    const gen = d3.geoPath().projection(proj)
    return krajeGeo.features.map(f => ({
      d: gen(f),
      nuts: f.properties.nutslau,
    }))
  }, [krajeGeo, dimensions])

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#0A416E] to-[#0b5a9e] px-4 sm:px-8 relative overflow-hidden">
      {/* Stylized map background */}
      {pathData && (
        <svg
          width={dimensions.width} height={dimensions.height}
          className="absolute inset-0 pointer-events-none"
          style={{ opacity: visible ? 0.08 : 0, transition: 'opacity 2s ease-in' }}
        >
          {pathData.map(({ d, nuts }) => (
            <path key={nuts} d={d} fill="white" stroke="white" strokeWidth={1.5} />
          ))}
        </svg>
      )}

      <div
        className="text-center transition-all duration-1000 w-full max-w-5xl relative z-10"
        style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(20px)' }}
      >
        {/* Subtitle above main title */}
        <p className="text-[#7bbfea] font-semibold mb-5 leading-relaxed tracking-wide" style={{ fontSize: 'clamp(0.85rem, 1.4vw, 1.1rem)' }}>
          Ukázka datové vizualizace — od sběru dat přes analýzu
          po interaktivní prezentaci s Claude Code
        </p>

        {/* Main title */}
        <h1 className="text-white font-bold mb-8 tracking-tight leading-tight" style={{ fontSize: 'clamp(2.2rem, 4.5vw, 3.6rem)' }}>
          Pohled do krajských domén specializace
        </h1>

        <div className="w-20 h-0.5 bg-[#0087CD] mx-auto mb-8" />

        {/* Disclaimer */}
        <p className="text-[#E6AF14] font-bold tracking-wide uppercase leading-snug mb-10 px-4" style={{ fontSize: 'clamp(0.7rem, 1.1vw, 0.9rem)' }}>
          Pracovní demo — data a analýzy mohou obsahovat faktické chyby a nepřesnosti
        </p>

        {/* Bottom info */}
        <p className="text-white/60 font-medium" style={{ fontSize: 'clamp(0.75rem, 1vw, 0.9rem)' }}>
          Seminář AI pro datové analytiky &middot; 4. března 2026
        </p>
      </div>

      {/* Footer citation */}
      <div className="absolute bottom-4 sm:bottom-6 text-white/30 text-center px-4 sm:px-8 z-10" style={{ fontSize: 'clamp(9px, 1.2vw, 12px)' }}>
        Data: ČSÚ, IS VaVaI/CEP, MPO — NRIS3 v08, ArcČR © ČÚZK, ČSÚ, ARCDATA PRAHA 2024 (CC-BY 4.0)
      </div>
    </div>
  )
}
