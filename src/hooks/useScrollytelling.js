import { useState, useEffect, useRef } from 'react'

/**
 * Hook pro scrollytelling s Intersection Observer.
 * Vrátí activeStep (index aktuálně viditelného kroku) a refy pro každý krok.
 */
export default function useScrollytelling(stepCount) {
  const [activeStep, setActiveStep] = useState(0)
  const stepRefs = useRef([])

  useEffect(() => {
    const observers = []

    for (let i = 0; i < stepCount; i++) {
      const el = stepRefs.current[i]
      if (!el) continue

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setActiveStep(i)
          }
        },
        {
          rootMargin: '-30% 0px -30% 0px',
          threshold: 0.1,
        }
      )
      observer.observe(el)
      observers.push(observer)
    }

    return () => observers.forEach(o => o.disconnect())
  }, [stepCount])

  const setStepRef = (index) => (el) => {
    stepRefs.current[index] = el
  }

  return { activeStep, setStepRef }
}
