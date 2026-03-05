# RIS3 Mapa ČR

> **Upozornění:** Tato aplikace je **demonstrativní prototyp** vytvořený pro seminář
> *AI pro datové analytiky* (CzechInvest, březen 2026). Jejím účelem je ukázat
> možnosti i limity a problémy práce s AI asistenty kódu při analytické práci
> s veřejnými daty. Nejedná se o produkční nástroj. Data ani analýza nebyla nezávisle validována,
> kód neprošel formálním review ani testováním.

Interaktivní vizualizace krajských domén specializace na základě tzv. karet krajských RIS3
strategií. Porovnává kraje podle sémantické podobnosti textů domén, formální shody CZ-NACE kódů
a napojení na výzkumné projekty z databáze CEP.

## Online verze

Aplikace je dostupná online na [kristyne.github.io/ris3-mapa-cr](https://kristyne.github.io/ris3-mapa-cr/)
jako statická stránka chráněná heslem přes [StatiCrypt](https://github.com/robinmoisson/staticrypt).
Heslo obdrží účastníci semináře.

## Spuštění lokálně

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Technologie

React 19 + Vite + Tailwind CSS + D3.js + Recharts

## Datový pipeline

Zdrojová data jsou veřejně dostupná. Reprodukce pipeline:

1. `parse_pdf_v2.py` — parsování PDF krajských karet (Příloha 2 NRIS3 v08)
2. `gen_embeddings.py` — generování vektorových reprezentací textů domén
3. `compute_vav_semantic.py` — přiřazení VaV projektů k doménám (FORD + sémantika)

## Zdroje dat

- Krajské karty RIS3 strategií (MPO, Příloha č.2 NRIS3 v08)
- IS VaVaI / CEP (databáze výzkumných projektů)
- ČSÚ (statistiky VaVaI)
- ArcČR © ČÚZK, ČSÚ, ARCDATA PRAHA 2024 (CC-BY 4.0)
