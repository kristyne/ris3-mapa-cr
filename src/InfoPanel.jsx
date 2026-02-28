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
            className="relative bg-white rounded-xl shadow-xl max-w-lg mx-4 flex flex-col"
            style={{ maxHeight: '85vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setOpen(false)}
              className="sticky top-0 self-end shrink-0 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-[#9B9BA0] text-lg mr-2 mt-2 z-10"
            >
              ×
            </button>
            <div className="overflow-y-auto px-6 pb-6 -mt-2">
              <p className="text-sm text-[#0A416E] leading-relaxed whitespace-pre-line">
                {text}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
