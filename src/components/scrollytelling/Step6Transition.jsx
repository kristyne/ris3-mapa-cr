import { useNavigate } from 'react-router-dom'

/**
 * Krok 6 — "Prozkoumej sám."
 * Plynulý přechod do dashboardu.
 */
export default function Step6Transition({ active }) {
  const navigate = useNavigate()

  return (
    <div
      className="flex flex-col items-center justify-center py-12 transition-opacity duration-700"
      style={{ opacity: active ? 1 : 0.3 }}
    >
      <div className="text-center max-w-lg">
        <p className="text-ris3-gray-700 text-lg mb-6">
          Data ukazují komplexní obraz — průřezy, nesoulady i příležitosti,
          které vyžadují hlubší prozkoumání v kontextu každého kraje.
        </p>
        <button
          onClick={() => navigate('/dashboard')}
          className="bg-ris3-blue text-white px-8 py-3 rounded-lg text-lg font-semibold
                     hover:bg-ris3-blue-light transition-colors shadow-lg cursor-pointer"
        >
          Prozkoumej data sám
        </button>
        <p className="text-sm text-ris3-gray-500 mt-4">
          Interaktivní dashboard se všemi kraji, doménami, trendy a projektovým portfoliem.
        </p>
      </div>
    </div>
  )
}
