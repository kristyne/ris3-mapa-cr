import { useParams, useNavigate } from 'react-router-dom'
import { useData } from '../../lib/DataContext'
import { nutsToName } from '../../lib/kraje'
import LoadingSpinner from '../shared/LoadingSpinner'
import RegionMap from './RegionMap'
import KrajDetail from './KrajDetail'
import KrajeOverview from './KrajeOverview'
import JaccardHeatmap from './JaccardHeatmap'
import TrendChart from './TrendChart'
import SpolupraceChord from './SpolupraceChord'

export default function DashboardPage() {
  const { krajId } = useParams()
  const navigate = useNavigate()
  const { data, loading, error } = useData()

  if (loading) return <LoadingSpinner />
  if (error) return <div className="p-8 text-red-600">Chyba: {error}</div>

  const krajName = krajId ? nutsToName(data.krajeKodovnik, krajId) : null

  return (
    <div className="max-w-[1200px] mx-auto px-5 py-6">
      {/* Title bar */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold text-ris3-gray-900 tracking-tight">
          {krajName || 'Přehled regionů'}
        </h2>
        {krajId && (
          <button
            onClick={() => navigate('/dashboard')}
            className="text-xs text-ris3-gray-500 hover:text-ris3-blue transition-colors cursor-pointer"
          >
            ← Zpět na přehled
          </button>
        )}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Left: Map + Table + Trends */}
        <div className="lg:col-span-3 space-y-5">
          <Panel title="Mapa krajů">
            <RegionMap selectedKraj={krajId} />
          </Panel>

          {!krajId && (
            <Panel title="Přehled VaV ukazatelů 2024">
              <KrajeOverview />
            </Panel>
          )}

          <Panel title="Trendy">
            <TrendChart selectedKraje={krajName ? [krajName] : []} />
          </Panel>
        </div>

        {/* Right: Detail */}
        <div className="lg:col-span-2">
          <div className="panel lg:sticky lg:top-[72px]" style={{ maxHeight: 'calc(100vh - 88px)', overflowY: 'auto' }}>
            <h3 className="text-xs font-semibold text-ris3-gray-500 uppercase tracking-wider mb-3">
              Detail kraje
            </h3>
            <KrajDetail krajId={krajId} />
          </div>
        </div>
      </div>

      {/* Full-width panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
        <Panel title="Doménová matice (Jaccard index)">
          <JaccardHeatmap onSelectKraj={(nuts) => navigate(`/dashboard/${nuts}`)} />
        </Panel>
        <Panel title="Spolupráce mezi kraji">
          <SpolupraceChord highlightKraj={krajId} />
        </Panel>
      </div>
    </div>
  )
}

function Panel({ title, children }) {
  return (
    <div className="panel">
      <h3 className="text-xs font-semibold text-ris3-gray-500 uppercase tracking-wider mb-3">
        {title}
      </h3>
      {children}
    </div>
  )
}
