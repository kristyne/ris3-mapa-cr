import { createContext, useContext, useState, useEffect } from 'react'

const DataContext = createContext(null)

const DATA_FILES = {
  csuVav: '/data/csu_vav_kraje.json',
  projektyCep: '/data/projekty_cep.json',
  subjektyVav: '/data/subjekty_vav.json',
  agregaty: '/data/agregaty_kraje.json',
  fordCodes: '/data/ford_codes.json',
  krajeKodovnik: '/data/kraje_kodovnik.json',
  domenyKraje: '/data/domeny_kraje.json',
  geoJson: '/data/kraje_geo_simplified.json',
  hdpPopulace: '/data/hdp_populace_kraje.json',
}

export function DataProvider({ children }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function loadAll() {
      try {
        const entries = Object.entries(DATA_FILES)
        const results = await Promise.all(
          entries.map(([, url]) => fetch(url).then(r => {
            if (!r.ok) throw new Error(`Failed to load ${url}`)
            return r.json()
          }))
        )
        const loaded = {}
        entries.forEach(([key], i) => {
          loaded[key] = results[i]
        })
        setData(loaded)
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    loadAll()
  }, [])

  return (
    <DataContext.Provider value={{ data, loading, error }}>
      {children}
    </DataContext.Provider>
  )
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}
