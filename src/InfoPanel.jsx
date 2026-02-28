import { useState } from 'react'

export default function InfoPanel({ text }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="absolute top-6 right-6 z-20 w-7 h-7 flex items-center justify-center rounded-full bg-white/80 hover:bg-white shadow text-[#0087CD] text-sm font-bold cursor-pointer"
        title="Vysvětlivka"
      >
        i
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={() => setOpen(false)}
        >
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative bg-white rounded-xl shadow-xl p-6 max-w-lg mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-100 text-[#9B9BA0] text-sm"
            >
              ×
            </button>
            <p className="text-sm text-[#0A416E] leading-relaxed whitespace-pre-line">
              {text}
            </p>
          </div>
        </div>
      )}
    </>
  )
}
