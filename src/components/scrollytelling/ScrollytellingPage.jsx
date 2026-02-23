import { useMemo } from 'react'
import { useData } from '../../lib/DataContext'
import useScrollytelling from '../../hooks/useScrollytelling'
import { analyzeStep1, analyzeStep2, analyzeStep3, analyzeStep4, analyzeStep5 } from '../../lib/insights'
import { fmtNum, fmtPct } from '../../lib/format'
import LoadingSpinner from '../shared/LoadingSpinner'
import SourceNote from '../shared/SourceNote'
import Step1Domeny from './Step1Domeny'
import Step2Clusters from './Step2Clusters'
import Step3Nesoulad from './Step3Nesoulad'
import Step4Champions from './Step4Champions'
import Step5Spoluprace from './Step5Spoluprace'
import Step6Transition from './Step6Transition'

const STEP_COUNT = 6

export default function ScrollytellingPage() {
  const { data, loading, error } = useData()
  const { activeStep, setStepRef } = useScrollytelling(STEP_COUNT)

  const insights = useMemo(() => {
    if (!data) return null
    return {
      step1: analyzeStep1(data.domenyKraje, data.krajeKodovnik),
      step2: analyzeStep2(data.domenyKraje, data.krajeKodovnik),
      step3: analyzeStep3(data.domenyKraje, data.agregaty, data.krajeKodovnik),
      step4: analyzeStep4(data.csuVav, data.domenyKraje, data.agregaty, data.krajeKodovnik),
      step5: analyzeStep5(data.domenyKraje, data.agregaty, data.krajeKodovnik),
    }
  }, [data])

  if (loading) return <LoadingSpinner />
  if (error) return <div className="p-8 text-red-600">Chyba: {error}</div>
  if (!insights) return null

  const s1 = insights.step1
  const s2 = insights.step2
  const s5 = insights.step5

  const steps = [
    {
      title: `${s1.totalDomeny} domén. Kolik je opravdu unikátních?`,
      text: (
        <>
          <p>
            14 krajů České republiky deklaruje celkem{' '}
            <strong>{s1.totalDomeny} specializačních domén</strong>.
            Pod povrchem různých názvů se ale překrývají — najdeme pouze{' '}
            <strong>{s1.uniqueNaceCodes} unikátních CZ-NACE kódů</strong>.
          </p>
          <p className="mt-4">
            {s1.topShared.length > 0 && (
              <>
                Nejčastěji sdílené obory — NACE {s1.topShared[0]?.nace}{' '}
                ({s1.topShared[0]?.count} krajů)
                {s1.topShared[1] && (
                  <> nebo {s1.topShared[1]?.nace} ({s1.topShared[1]?.count} krajů)</>
                )}
                {' '}— ukazují na společný průmyslový základ.
                Nabízí se otázka, zda skutečná specializace vzniká teprve
                na úrovni konkrétních aplikací a kompetencí.
              </>
            )}
          </p>
        </>
      ),
      viz: <Step1Domeny insight={s1} active={activeStep === 0} />,
      source: 'NRIS3 Příloha 2 v08 (MPO, 2026)',
    },
    {
      title: 'Existují přirozené skupiny podobných strategií?',
      text: (
        <>
          <p>
            Jaccardův index podobnosti nad CZ-NACE profily odhaluje,
            že se kraje přirozeně seskupují do{' '}
            <strong>{s2.clusters.length} skupin</strong> s podobným
            strategickým zaměřením.
          </p>
          <p className="mt-4">
            Nejpodobnější dvojice:{' '}
            {s2.topPairs.slice(0, 3).map((p, i) => (
              <span key={i}>
                {i > 0 && ', '}
                <strong>{p.a}</strong> a <strong>{p.b}</strong>{' '}
                <span className="text-ris3-gray-500">(J={p.jaccard.toFixed(2)})</span>
              </span>
            ))}.
          </p>
          <p className="mt-4 text-ris3-gray-500 text-sm">
            Tyto shluky mohou naznačovat příležitosti pro koordinaci —
            kraje s podobným zaměřením by mohly sdílet infrastrukturu
            či společně adresovat výzvy svého odvětví.
          </p>
        </>
      ),
      viz: <Step2Clusters insight={s2} active={activeStep === 1} />,
      source: 'NRIS3 Příloha 2 v08, Jaccard index nad CZ-NACE kódy',
    },
    {
      title: 'Odpovídá zaměření projektů deklarovaným doménám?',
      text: (
        <>
          <p>
            Deklarované domény popisují strategický záměr.
            Data o financovaných projektech z IS VaVaI ukazují,
            kam ve skutečnosti směřují prostředky.
          </p>
          <p className="mt-4">
            Pro vybrané kraje jsou zobrazeny tři nejfinancovanější
            FORD obory. Tam, kde se oborový profil liší od deklarovaných
            domén, může jít o přirozený vývoj, reakci na výzvy či oblast,
            která si zaslouží pozornost při aktualizaci strategie.
          </p>
          <p className="mt-3 text-sm text-ris3-gray-500">
            Odchylky nemusí znamenat problém — nová doména potřebuje čas,
            mezikrajská spolupráce posouvá projekty jinam, a některé obory
            mají přirozený přesah přes hranice domén.
          </p>
        </>
      ),
      viz: <Step3Nesoulad insight={insights.step3} active={activeStep === 2} />,
      source: 'IS VaVaI/CEP 2021–2025, NRIS3 Příloha 2 v08',
    },
    {
      title: 'Obory se silným výzkumem mimo deklarované domény.',
      text: (
        <>
          <p>
            Některé kraje mají výrazné výzkumné kapacity v oborech,
            které v jejich strategii specializace explicitně nefigurují.
            To může odrážet historické vazby, příhraniční spolupráci
            či odvětví, která teprve získávají kritickou hmotu.
          </p>
          <p className="mt-4">
            Zobrazené podíly ukazují, jaká část projektového portfolia
            připadá na jednotlivé obory. Ty s vysokým podílem a bez
            přímé vazby na deklarovanou doménu mohou představovat
            kandidáty pro budoucí rozšíření strategie.
          </p>
        </>
      ),
      viz: <Step4Champions insight={insights.step4} active={activeStep === 3} />,
      source: 'IS VaVaI/CEP 2021–2025, NRIS3 Příloha 2 v08',
    },
    {
      title: 'Kde jsou příležitosti pro spolupráci?',
      text: (
        <>
          <p>
            Chord diagram ukazuje sílu mezikrajské spolupráce
            měřenou počtem společných projektů. Praha je přirozeným
            centrem — na spolupráci s ní připadá{' '}
            <strong>{fmtPct(s5.prahaShare)}</strong> všech
            mezikrajských vazeb.
          </p>
          <p className="mt-4">
            Zajímavější je otázka nevyužitého potenciálu: páry krajů
            s podobnou strategií, ale překvapivě nízkou spoluprací.
            {s5.blindSpots.length > 0 && (
              <> Například <strong>{s5.blindSpots[0].a}</strong> a{' '}
              <strong>{s5.blindSpots[0].b}</strong>{' '}
              <span className="text-ris3-gray-500">
                (J={s5.blindSpots[0].jaccard.toFixed(2)},
                {' '}{s5.blindSpots[0].spoluprace} společných projektů)
              </span>.</>
            )}
          </p>
          <p className="mt-3 text-sm text-ris3-gray-500">
            Nízká spolupráce může mít objektivní důvody (geografická
            vzdálenost, odlišné fáze vývoje). Data naznačují příležitost,
            ne nutně problém.
          </p>
        </>
      ),
      viz: <Step5Spoluprace insight={s5} active={activeStep === 4} />,
      source: 'IS VaVaI/CEP 2021–2025, spolupráce = projekt s účastníky z obou krajů',
    },
    {
      title: 'Prozkoumej data sám.',
      text: (
        <p>
          Předchozí kroky odhalily průřezové vzorce, které běžná
          krajská analytika nezachytí. Dashboard umožňuje prozkoumat
          každý kraj individuálně — domény, VaV kapacity, projektové
          portfolio i spolupráci.
        </p>
      ),
      viz: <Step6Transition active={activeStep === 5} />,
      source: null,
    },
  ]

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-b from-ris3-blue to-ris3-blue-light text-white py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-6 leading-tight tracking-tight">
            Co říkají data o české specializaci
          </h1>
          <p className="text-lg text-white/75 leading-relaxed max-w-xl mx-auto">
            Průřezová analýza {fmtNum(s1.totalDomeny)} domén,{' '}
            {fmtNum(data.projektyCep.projekty.length)} projektů
            a {fmtNum(data.subjektyVav.subjekty.length)} subjektů
            VaV ve 14 krajích ČR.
          </p>
          <div className="mt-12 text-white/30 text-sm tracking-widest uppercase">
            Scrollujte dolů
          </div>
          <div className="mt-2 text-white/30 text-xl">&#8595;</div>
        </div>
      </section>

      {/* Scrollytelling — sticky viz + scrolling text */}
      <div className="scrolly-container">
        <div className="max-w-7xl mx-auto relative">
          <div className="flex flex-col lg:flex-row">
            {/* Sticky viz panel (right) */}
            <div className="hidden lg:block lg:w-[55%] lg:order-2">
              <div className="scrolly-viz-sticky p-6">
                <div className="w-full">
                  {steps.map((step, i) => (
                    <div
                      key={i}
                      className="absolute inset-0 flex items-center justify-center p-8 transition-opacity duration-500"
                      style={{
                        opacity: activeStep === i ? 1 : 0,
                        pointerEvents: activeStep === i ? 'auto' : 'none',
                      }}
                    >
                      <div className="w-full max-w-lg">
                        {step.viz}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Scrolling text steps (left) */}
            <div className="lg:w-[45%] lg:order-1">
              {steps.map((step, i) => (
                <section
                  key={i}
                  ref={setStepRef(i)}
                  className="scrolly-step px-6 lg:px-10"
                >
                  <div
                    className="max-w-md transition-all duration-500 py-8"
                    style={{
                      opacity: activeStep === i ? 1 : 0.15,
                      transform: activeStep === i ? 'translateY(0)' : 'translateY(8px)',
                    }}
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-ris3-blue text-white text-xs font-bold">
                        {i + 1}
                      </span>
                      <span className="text-xs text-ris3-gray-300 font-mono tracking-wider uppercase">
                        Krok {i + 1} z {STEP_COUNT}
                      </span>
                    </div>

                    <h2 className="text-2xl font-bold text-ris3-gray-900 mb-5 leading-snug">
                      {step.title}
                    </h2>

                    <div className="text-ris3-gray-700 leading-relaxed text-[15px]">
                      {step.text}
                    </div>

                    {step.source && (
                      <SourceNote>{step.source}</SourceNote>
                    )}

                    {/* Mobile: inline viz */}
                    <div className="lg:hidden mt-6">
                      {step.viz}
                    </div>
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
