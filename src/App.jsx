import { useState, useEffect, useCallback, useRef } from 'react'
import SlideTitle from './slides/SlideTitle'
import SlideMapVav from './slides/SlideMapVav'
import SlideJaccardHeatmap from './slides/SlideJaccardHeatmap'
import SlideSemanticMerged from './slides/SlideSemanticMerged'
import SlideVavEkosystem from './slides/SlideVavEkosystem'
import SlideConclusion from './slides/SlideConclusion'

const SLIDES = [
  { component: SlideTitle, name: 'Úvod' },
  { component: SlideMapVav, name: 'VaV výdaje' },
  { component: SlideJaccardHeatmap, name: 'Jaccard NACE' },
  { component: SlideSemanticMerged, name: 'Sémantická blízkost' },
  { component: SlideVavEkosystem, name: 'VaV vs. domény' },
  { component: SlideConclusion, name: 'Shrnutí' },
]

const TOTAL_SLIDES = SLIDES.length

export default function App() {
  const [currentSlide, setCurrentSlide] = useState(0)
  const [isPaused, setIsPaused] = useState(true)

  const goTo = useCallback((idx) => {
    setCurrentSlide(Math.max(0, Math.min(TOTAL_SLIDES - 1, idx)))
  }, [])

  const next = useCallback(() => goTo(currentSlide + 1), [currentSlide, goTo])
  const prev = useCallback(() => goTo(currentSlide - 1), [currentSlide, goTo])

  // Keyboard navigation
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next() }
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev() }
      if (e.key === 'Home') { e.preventDefault(); goTo(0) }
      if (e.key === 'End') { e.preventDefault(); goTo(TOTAL_SLIDES - 1) }
      if (e.key === 'p') setIsPaused(p => !p)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [next, prev, goTo])

  // Touch swipe navigation
  const touchStartX = useRef(null)
  useEffect(() => {
    const onStart = (e) => { touchStartX.current = e.touches[0].clientX }
    const onEnd = (e) => {
      if (touchStartX.current == null) return
      const dx = e.changedTouches[0].clientX - touchStartX.current
      if (Math.abs(dx) > 50) { dx < 0 ? next() : prev() }
      touchStartX.current = null
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchend', onEnd)
    }
  }, [next, prev])

  // Autoplay
  useEffect(() => {
    if (isPaused) return
    const timer = setInterval(() => {
      setCurrentSlide(s => (s + 1) % TOTAL_SLIDES)
    }, 9000)
    return () => clearInterval(timer)
  }, [isPaused])

  return (
    <div className="relative w-full h-full">
      {/* Slides */}
      {SLIDES.map(({ component: Comp }, i) => (
        <div key={i} className={`slide ${currentSlide === i ? 'active' : ''}`}>
          <Comp />
        </div>
      ))}

      {/* Bottom navigation bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-center gap-2 sm:gap-3 py-1.5 sm:py-2.5 bg-gradient-to-t from-black/15 to-transparent pointer-events-none">
        <div className="flex items-center gap-2 sm:gap-3 pointer-events-auto">
          {/* Play/Pause */}
          <button
            onClick={() => setIsPaused(p => !p)}
            className="w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-full bg-white/80 hover:bg-white shadow text-xs"
            title={isPaused ? 'Play (P)' : 'Pause (P)'}
          >
            {isPaused ? '▶' : '⏸'}
          </button>

          {/* Dots with current indicator */}
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full transition-all ${
                currentSlide === i
                  ? 'bg-[#0087CD] scale-125'
                  : 'bg-[#CDCDD2] hover:bg-[#9B9BA0]'
              }`}
              title={`${i + 1}/${TOTAL_SLIDES} ${SLIDES[i].name}`}
            />
          ))}

          {/* Slide counter + name */}
          <span className="text-[10px] sm:text-[11px] text-white/70 font-medium ml-1 min-w-0 sm:min-w-[140px] text-center"
            style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
            <span className="hidden sm:inline">{currentSlide + 1}/{TOTAL_SLIDES} &middot; {SLIDES[currentSlide].name}</span>
            <span className="sm:hidden">{currentSlide + 1}/{TOTAL_SLIDES}</span>
          </span>
        </div>
      </div>

      {/* Arrow buttons — hidden on small screens (use swipe) */}
      {currentSlide > 0 && (
        <button
          onClick={prev}
          className="fixed left-2 sm:left-4 top-1/2 -translate-y-1/2 w-8 h-8 sm:w-10 sm:h-10 hidden sm:flex items-center justify-center rounded-full bg-white/80 hover:bg-white shadow z-50 text-[#0A416E] text-lg"
        >
          ‹
        </button>
      )}
      {currentSlide < TOTAL_SLIDES - 1 && (
        <button
          onClick={next}
          className="fixed right-2 sm:right-4 top-1/2 -translate-y-1/2 w-8 h-8 sm:w-10 sm:h-10 hidden sm:flex items-center justify-center rounded-full bg-white/80 hover:bg-white shadow z-50 text-[#0A416E] text-lg"
        >
          ›
        </button>
      )}
    </div>
  )
}
