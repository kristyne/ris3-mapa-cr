import { useState, useEffect } from 'react'

export default function SlideConclusion() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 200)
    return () => clearTimeout(t)
  }, [])

  const pipeline = [
    {
      stage: 'Explorace',
      color: '#B07ED8',
      steps: [
        'Analytická zvědavost: jsou si krajské specializace nějak podobné? Dá se to zjistit?',
        'Mapování dostupných zdrojů: krajské karty NRIS3, databáze CEP, ČSÚ. Žádná hotová data, žádné zadání.',
      ],
    },
    {
      stage: 'Sběr dat',
      color: '#0087CD',
      steps: [
        'Parsování PDF krajských karet, extrakce strukturovaných dat ze 14 různých formátů',
      ],
    },
    {
      stage: 'Analýza',
      color: '#E6AF14',
      steps: [
        'Převod textů domén na vektory jazykovým modelem, výpočet sémantické podobnosti',
        'Volba a ladění metod v dialogu: prahové hodnoty, Jaccard vs. embedding, FORD + sémantika',
        'Propojení tisíců VaV projektů s doménami specializace kombinovaným přiřazením',
      ],
    },
    {
      stage: 'Vizualizace',
      color: '#A0BE32',
      steps: [
        'Tvorba interaktivní React + D3 aplikace s kartogramy, síťovými grafy a infografikami',
        'Iterace designu na základě zpětné vazby: rozložení, barvy, legendy, čitelnost na plátně',
      ],
    },
    {
      stage: 'Deploy',
      color: '#C3003C',
      steps: [
        'GitHub repo + GitHub Pages pro sdílení jedním odkazem a reprodukovatelnost',
      ],
    },
  ]

  return (
    <div className="w-full h-full bg-gradient-to-br from-[#0A416E] to-[#0b5a9e] relative overflow-hidden">
      <div
        className="w-full h-full flex flex-col items-center justify-start pt-7 px-10 transition-all duration-700 overflow-y-auto"
        style={{ opacity: visible ? 1 : 0 }}
      >
        <div className="max-w-3xl w-full">
          <h2 className="text-white font-bold text-3xl mb-3 text-center">
            Od zvědavosti k interaktivní aplikaci v dialogu s AI
          </h2>
          <div className="w-16 h-0.5 bg-[#0087CD] mx-auto mb-4" />

          {/* Intro — what this demonstrates */}
          <div className="bg-white/10 backdrop-blur-sm rounded-xl px-8 py-4 mb-3">
            <p className="text-white/90 text-[14px] leading-relaxed">
              Na začátku nebylo zadání ani data, jen analytická zvědavost: jsou si
              krajské specializace nějak podobné? A dá se to vůbec zjistit z toho,
              co je veřejně dostupné? Celá cesta od této otázky k hotové aplikaci vznikla
              v dialogu člověka s AI asistentem (Claude Code). AI asistent zde slouží
              jako <span className="text-white font-bold">akcelerátor
              iterací</span>: člověk určuje směr, nástroj generuje varianty metod, kódu
              a vizualizací.
            </p>
          </div>

          {/* Key takeaways for analysts */}
          <div className="bg-white/10 backdrop-blur-sm rounded-xl px-8 py-4 mb-3">
            <p className="text-white/60 text-[11px] font-semibold uppercase tracking-wider mb-2.5">
              Co to ukazuje pro analytickou práci
            </p>
            <div className="space-y-2">
              {[
                { color: '#0087CD', text: 'Je třeba rozumět metodám, aby bylo jasné kam AI nástroj směrovat, například embeddings, Jaccard index nebo FORD klasifikace. Nástroj je implementuje, ale neřekne, kdy je která vhodná.' },
                { color: '#E6AF14', text: 'Klíčové je rozpoznat, kdy selhání je v datech, ne v metodě. Například NACE pokrytí se liší kraj od kraje (7 krajů plné, 4 žádné). To změní celý analytický přístup, ne jen parametry.' },
                { color: '#A0BE32', text: 'Jedna metoda nestačí. Například kombinované přiřazení VaV projektů (FORD kódy + sémantická podobnost textů) ukázalo, že 40 % shod zachytí jen jedna z metod. Bez kombinace se ztrácejí.' },
                { color: '#C3003C', text: 'Výsledky je třeba ověřovat proti zkušenosti. Například AI asistent navrhne práh podobnosti pro síťový graf, ale jestli dává smysl v kontextu RIS3, posoudí jen člověk se znalostí dat.' },
                { color: '#0087CD', text: 'Celý postup tvoří opakovatelný pipeline: při aktualizaci krajských karet nebo nové verzi NRIS3 stačí pustit stejný řetězec znovu. Ruční práce je jen v rozhodování, ne v provádění.' },
              ].map((item, i) => (
                <div key={i} className="flex gap-3">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0 mt-[7px]" style={{ background: item.color }} />
                  <span className="text-white/85 text-[13px] leading-relaxed">{item.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Pipeline visualization */}
          <div className="bg-white/5 rounded-xl px-8 py-4 mb-3 border-l-4 border-white/10">
            <div className="flex items-center gap-1 mb-3">
              {pipeline.map((p, i) => (
                <div key={i} className="flex items-center">
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full"
                    style={{ background: p.color + '25', border: `1px solid ${p.color}60` }}>
                    <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                    <span className="text-[11px] font-semibold" style={{ color: p.color }}>
                      {p.stage}
                    </span>
                  </div>
                  {i < pipeline.length - 1 && (
                    <span className="text-white/30 text-xs mx-1">→</span>
                  )}
                </div>
              ))}
            </div>
            <div className="space-y-2.5">
              {pipeline.map((p, pi) => (
                <div key={pi} className="space-y-1">
                  {p.steps.map((step, si) => (
                    <div key={si} className="flex gap-3">
                      <span className="font-bold shrink-0 mt-0.5 text-[12px]" style={{ color: p.color }}>→</span>
                      <span className="text-white/70 text-[12px] leading-relaxed">{step}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Disclaimer note */}
          <div className="bg-[#E6AF14]/10 border border-[#E6AF14]/20 rounded-xl px-8 py-3 mb-4">
            <p className="text-white/55 text-[12px] leading-relaxed">
              Výsledek je funkční prototyp. Cesta do produkce znamená další kroky:
              validaci, review, testy, bezpečnost. Na rychlé prototypování, exploraci dat
              a komunikaci výsledků je ale tento přístup mimořádně efektivní.
            </p>
          </div>

          {/* Footer line */}
          <p className="text-white/50 text-xs text-center mb-4">
            Seminář AI pro datové analytiky &middot; 4. března 2026
          </p>
        </div>

        {/* Bottom citation */}
        <div className="absolute bottom-4 text-white/30 text-[10px] text-center px-8">
          Data: ČSÚ, IS VaVaI/CEP, MPO — NRIS3 v08, ArcČR © ČÚZK, ČSÚ, ARCDATA PRAHA 2024 (CC-BY 4.0)
        </div>
      </div>
    </div>
  )
}
