import { useState, useRef, useEffect } from 'react'

export default function CollapsiblePanel({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  const contentRef = useRef(null)
  const [maxH, setMaxH] = useState(defaultOpen ? 'none' : '0px')

  useEffect(() => {
    if (open) {
      const el = contentRef.current
      if (el) setMaxH(el.scrollHeight + 'px')
    } else {
      setMaxH('0px')
    }
  }, [open])

  // Update maxH if children change while open
  useEffect(() => {
    if (open && contentRef.current) {
      setMaxH(contentRef.current.scrollHeight + 'px')
    }
  }, [children, open])

  return (
    <div className="bg-white/95 rounded-lg shadow-sm w-full">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
        style={{ fontSize: 13 }}
      >
        <span style={{ fontSize: 14 }}>ℹ️</span>
        <span className="font-semibold text-[#0A416E] flex-1">{title}</span>
        <span className="text-[#777]" style={{ fontSize: 12 }}>
          {open ? '▾' : '▸'}
        </span>
      </button>
      <div
        ref={contentRef}
        style={{
          maxHeight: maxH,
          overflow: 'hidden',
          transition: 'max-height 0.3s ease',
        }}
      >
        <div className="px-3 pb-2">
          {children}
        </div>
      </div>
    </div>
  )
}
