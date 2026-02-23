import useKrajData from '../../hooks/useKrajData'
import { fmtNum, fmtMilKc, fmtPct, fmtIntenzita, fmtPerCapita, fmtTisToMilKc } from '../../lib/format'
import SourceNote from '../shared/SourceNote'

export default function KrajDetail({ krajId }) {
  const kraj = useKrajData(krajId)

  if (!kraj) {
    return (
      <div className="text-center py-8 text-ris3-gray-500">
        <p className="text-lg mb-1">Vyberte kraj</p>
        <p className="text-sm">Klikněte na kraj v mapě pro zobrazení detailu.</p>
      </div>
    )
  }

  const v = kraj.vav

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h3 className="text-xl font-bold text-ris3-blue">{kraj.nazev}</h3>
        <p className="text-sm text-ris3-gray-500">
          {fmtNum(v.populace)} obyvatel | HDP {fmtMilKc(v.hdp_mil_kc)}
        </p>
      </div>

      {/* VaV KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <Kpi label="Výdaje na VaV" value={fmtMilKc(v.vydaje_mil_kc)} />
        <Kpi label="Podíl na ČR" value={fmtPct(v.podil_vydaje)} />
        <Kpi label="VaV intenzita" value={fmtIntenzita(v.intenzita)} />
        <Kpi label="VaV na obyvatele" value={fmtPerCapita(v.per_capita_kc)} />
        <Kpi label="Pracovníci FTE" value={fmtNum(v.pracovnici_fte)} />
        <Kpi label="Pracoviště" value={fmtNum(v.pracoviste)} />
      </div>

      <SourceNote>ČSÚ 2024; ČSÚ Regionální účty + KROK</SourceNote>

      {/* Domény */}
      <div>
        <h4 className="text-sm font-semibold text-ris3-gray-700 mb-2">Domény specializace</h4>
        <div className="space-y-1.5">
          {kraj.domeny.map((d, i) => (
            <div key={i} className="bg-ris3-gray-50 rounded px-3 py-2">
              <div className="text-sm font-medium text-ris3-blue">{d.nazev}</div>
              {d.popis && <div className="text-xs text-ris3-gray-500 mt-0.5">{d.popis}</div>}
              {d.cz_nace?.length > 0 && (
                <div className="flex gap-1 mt-1 flex-wrap">
                  {d.cz_nace.map(c => (
                    <span key={c} className="text-xs bg-ris3-gray-200 text-ris3-gray-700 px-1.5 py-0.5 rounded">
                      NACE {c}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        {kraj.emerging.length > 0 && (
          <div className="mt-3">
            <h5 className="text-xs font-semibold text-ris3-gray-500 mb-1">Emerging domény</h5>
            <div className="flex flex-wrap gap-1">
              {kraj.emerging.map((e, i) => (
                <span key={i} className="text-xs bg-ris3-orange/20 text-ris3-gray-700 px-2 py-0.5 rounded">
                  {e}
                </span>
              ))}
            </div>
          </div>
        )}
        <SourceNote>NRIS3 Příloha 2 v08 (MPO, 2026)</SourceNote>
      </div>

      {/* Top poskytovatele */}
      {kraj.topPoskytovatele.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-ris3-gray-700 mb-2">Top poskytovatelé VaV projektů</h4>
          <div className="space-y-1">
            {kraj.topPoskytovatele.map((p, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-ris3-gray-700">{p.name}</span>
                <span className="text-ris3-gray-500 text-xs">
                  {p.pocet} proj. | {fmtTisToMilKc(p.naklady)}
                </span>
              </div>
            ))}
          </div>
          <SourceNote>IS VaVaI/CEP 2021–2025</SourceNote>
        </div>
      )}

      {/* Top FORD obory */}
      {kraj.topFord.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-ris3-gray-700 mb-2">Top FORD obory projektů</h4>
          {(() => {
            const maxNaklady = Math.max(...kraj.topFord.map(f => f.naklady))
            return (
              <div className="space-y-1.5">
                {kraj.topFord.slice(0, 8).map((f, i) => (
                  <div key={i}>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="text-ris3-gray-700">{f.name}</span>
                      <span className="text-ris3-gray-500">{f.pocet} proj.</span>
                    </div>
                    <div className="h-1.5 bg-ris3-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-ris3-blue rounded-full"
                        style={{ width: `${(f.naklady / maxNaklady) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}
          <SourceNote>IS VaVaI/CEP 2021–2025, FORD klasifikace</SourceNote>
        </div>
      )}

      {/* Spolupráce */}
      {kraj.spoluprace.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-ris3-gray-700 mb-2">Mezikrajská spolupráce</h4>
          <div className="space-y-1">
            {kraj.spoluprace.slice(0, 5).map((s, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-ris3-gray-700">{s.partner}</span>
                <span className="text-ris3-gray-500 text-xs">{s.spolecne_projekty} spol. proj.</span>
              </div>
            ))}
          </div>
          <SourceNote>IS VaVaI/CEP 2021–2025, spolupráce = projekt s účastníky z obou krajů</SourceNote>
        </div>
      )}

      {/* Podobné kraje (Jaccard) */}
      {kraj.podobne.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-ris3-gray-700 mb-2">Strategicky nejpodobnější kraje</h4>
          <div className="space-y-1">
            {kraj.podobne.map((p, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-ris3-gray-700">{p.nazev}</span>
                <span className="text-ris3-gray-500 text-xs">J = {p.jaccard.toFixed(2)}</span>
              </div>
            ))}
          </div>
          <SourceNote>Jaccard index nad CZ-NACE kódy domén, NRIS3 Příloha 2 v08</SourceNote>
        </div>
      )}

      {/* Subjekty */}
      {kraj.subjekty && (
        <div>
          <h4 className="text-sm font-semibold text-ris3-gray-700 mb-2">VaV subjekty</h4>
          <div className="grid grid-cols-3 gap-2 text-center">
            <MiniKpi label="Celkem" value={kraj.subjekty.celkem} />
            <MiniKpi label="s.r.o." value={kraj.subjekty.firmy_sro} />
            <MiniKpi label="a.s." value={kraj.subjekty.firmy_as} />
            <MiniKpi label="VŠ" value={kraj.subjekty.vs} />
            <MiniKpi label="v.v.i." value={kraj.subjekty.vvi} />
            <MiniKpi label="Ostatní" value={kraj.subjekty.ostatni} />
          </div>
          <SourceNote>IS VaVaI, subjekty VaV s podporou 2007–2026</SourceNote>
        </div>
      )}
    </div>
  )
}

function Kpi({ label, value }) {
  return (
    <div className="bg-ris3-gray-50 rounded-lg p-3">
      <div className="text-lg font-bold text-ris3-blue">{value}</div>
      <div className="text-xs text-ris3-gray-500">{label}</div>
    </div>
  )
}

function MiniKpi({ label, value }) {
  return (
    <div className="bg-ris3-gray-50 rounded px-2 py-1.5">
      <div className="text-sm font-semibold text-ris3-gray-900">{fmtNum(value)}</div>
      <div className="text-xs text-ris3-gray-500">{label}</div>
    </div>
  )
}
