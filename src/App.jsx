import { Routes, Route } from 'react-router-dom'
import { DataProvider } from './lib/DataContext'
import ScrollytellingPage from './components/scrollytelling/ScrollytellingPage'
import DashboardPage from './components/dashboard/DashboardPage'
import Header from './components/shared/Header'

export default function App() {
  return (
    <DataProvider>
      <div className="min-h-screen flex flex-col bg-white">
        <Header />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<ScrollytellingPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/dashboard/:krajId" element={<DashboardPage />} />
          </Routes>
        </main>
        <footer className="border-t border-ris3-gray-100 py-8 px-6">
          <div className="max-w-3xl mx-auto text-center">
            <p className="text-xs text-ris3-gray-300 leading-relaxed">
              Data: ČSÚ (VaV statistiky 2005–2024, regionální účty, KROK) · IS VaVaI/CEP
              (projekty a subjekty VaV 2021–2025) · NRIS3 Příloha 2 v08 (domény specializace, MPO 2026).
            </p>
            <p className="text-xs text-ris3-gray-300 mt-2">
              Vizualizace má informativní charakter.
              Skóre a podíly jsou relativní ukazatele, nikoli absolutní hodnocení kvality regionů.
            </p>
          </div>
        </footer>
      </div>
    </DataProvider>
  )
}
