"""
Dual matching: FORD lookup + semantic embedding
For each CEP project, determines if it matches a domain in its kraj via:
  1. FORD discipline → domain text similarity (structural/field match)
  2. Project text → domain text similarity (content/semantic match)

Output: public/data/vav_semantic_match.json
"""

import json, sys
import numpy as np
from sentence_transformers import SentenceTransformer
from pathlib import Path
import time

sys.stdout.reconfigure(encoding='utf-8')

DATA_DIR = Path("public/data")
THRESHOLD = 0.35       # semantic: project text vs domain
FORD_THRESHOLD = 0.38  # FORD discipline name vs domain text

# ── Load data ────────────────────────────────────────────────────────
print("Loading data...")
with open(DATA_DIR / "projekty_cep.json", "r", encoding="utf-8") as f:
    cep_data = json.load(f)
projects = cep_data["projekty"]

with open(DATA_DIR / "domeny_plne_texty.json", "r", encoding="utf-8") as f:
    domeny = json.load(f)

with open(DATA_DIR / "ford_codes.json", "r", encoding="utf-8") as f:
    ford_data = json.load(f)

ford_disc = ford_data["ford_discipliny"]   # "101" → "Matematika"
ford_groups = ford_data["ford_skupiny"]    # "1xx" → "Přírodní vědy"

# ── Load model ───────────────────────────────────────────────────────
print("Loading embedding model...")
model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
model_name = "paraphrase-multilingual-MiniLM-L12-v2"

# ── Prepare domain texts (flat list with kraj tracking) ──────────────
all_domain_texts = []
domain_kraj_map = []   # (kraj, local_domain_idx)
domain_names_map = {}  # kraj → [name, ...]
domain_texts_map = {}  # kraj → [text, ...]

for kraj, doms in domeny.items():
    # Handle both list and dict-of-dicts format
    if isinstance(doms, dict):
        doms = list(doms.values())
    domain_names_map[kraj] = [d["nazev"] for d in doms]
    domain_texts_map[kraj] = [d["text_pro_embedding"] for d in doms]
    for i, d in enumerate(doms):
        all_domain_texts.append(d["text_pro_embedding"])
        domain_kraj_map.append((kraj, i))

# ── Prepare FORD discipline texts ───────────────────────────────────
# Enrich FORD names with group context for better matching
ford_codes_list = list(ford_disc.keys())
ford_texts = []
for code in ford_codes_list:
    group_key = code[0] + "xx"
    group_name = ford_groups.get(group_key, "")
    ford_texts.append(f"{ford_disc[code]} ({group_name})")

# ── Encode domains ──────────────────────────────────────────────────
print(f"Encoding {len(all_domain_texts)} domain texts...")
domain_embeddings = model.encode(all_domain_texts, show_progress_bar=True, batch_size=32)
domain_embeddings = domain_embeddings / np.linalg.norm(domain_embeddings, axis=1, keepdims=True)

# ── Encode FORD disciplines ─────────────────────────────────────────
print(f"Encoding {len(ford_texts)} FORD discipline texts...")
ford_embeddings = model.encode(ford_texts, batch_size=32)
ford_embeddings = ford_embeddings / np.linalg.norm(ford_embeddings, axis=1, keepdims=True)

# ── Build FORD→domain match lookup per kraj ─────────────────────────
# For each (ford_3digit, kraj): does this discipline match any domain in the kraj?
ford_domain_sim = np.dot(ford_embeddings, domain_embeddings.T)  # (n_ford, n_domains)

# Index: which global domain indices belong to which kraj
kraj_domain_indices = {}
for di, (kraj, _) in enumerate(domain_kraj_map):
    kraj_domain_indices.setdefault(kraj, []).append(di)

ford_kraj_match = {}  # (ford_3digit, kraj) → bool
ford_kraj_best = {}   # (ford_3digit, kraj) → (best_sim, best_domain_name)

for fi, ford_code in enumerate(ford_codes_list):
    for kraj in domeny:
        d_indices = kraj_domain_indices.get(kraj, [])
        if not d_indices:
            continue
        sims = ford_domain_sim[fi, d_indices]
        best_idx = np.argmax(sims)
        best_sim = float(sims[best_idx])
        best_domain_local = domain_kraj_map[d_indices[best_idx]][1]
        ford_kraj_match[(ford_code, kraj)] = best_sim > FORD_THRESHOLD
        ford_kraj_best[(ford_code, kraj)] = (best_sim, domain_names_map[kraj][best_domain_local])

# Diagnostics: FORD matching coverage
ford_match_count = sum(1 for v in ford_kraj_match.values() if v)
ford_total = len(ford_kraj_match)
print(f"FORD→domain matches: {ford_match_count}/{ford_total} ({ford_match_count/ford_total*100:.1f}%)")

# ── Prepare project texts ───────────────────────────────────────────
print("Preparing project texts...")
project_texts = []
for p in projects:
    text = p.get("nazev", "")
    kw = p.get("klicova_slova", "")
    if kw:
        text += " " + kw
    project_texts.append(text)

# ── Encode projects ─────────────────────────────────────────────────
print(f"Encoding {len(projects)} project texts...")
t0 = time.time()
project_embeddings = model.encode(project_texts, show_progress_bar=True, batch_size=64)
project_embeddings = project_embeddings / np.linalg.norm(project_embeddings, axis=1, keepdims=True)
print(f"Done in {time.time()-t0:.1f}s")

# ── Match each project ──────────────────────────────────────────────
print("Computing matches...")
results_by_kraj = {}
raw_scores = {}

for kraj in domeny:
    results_by_kraj[kraj] = {
        "celkem_projektu": 0,
        "v_obou": 0,
        "jen_semantic": 0,
        "jen_ford": 0,
        "mimo_vse": 0,
        "top_domeny": {},
    }
    raw_scores[kraj] = []

skipped = 0
for pi, project in enumerate(projects):
    kraj = project.get("kraj_hlavni_prijemce", "")
    if kraj not in domeny:
        skipped += 1
        continue

    results_by_kraj[kraj]["celkem_projektu"] += 1

    # ─ Semantic match: project text vs domain texts in this kraj ─
    d_indices = kraj_domain_indices.get(kraj, [])
    if not d_indices:
        results_by_kraj[kraj]["mimo_vse"] += 1
        continue

    sims = np.dot(project_embeddings[pi], domain_embeddings[d_indices].T)
    max_sim_idx = int(np.argmax(sims))
    max_sim = float(sims[max_sim_idx])
    best_domain_local = domain_kraj_map[d_indices[max_sim_idx]][1]
    best_domain_name = domain_names_map[kraj][best_domain_local]

    semantic_match = max_sim > THRESHOLD

    # ─ FORD match: project's FORD discipline vs domains in this kraj ─
    ford_code_full = project.get("ford_kod", "")
    ford_3digit = ford_code_full[:3] if len(ford_code_full) >= 3 else ""
    ford_match = ford_kraj_match.get((ford_3digit, kraj), False) if ford_3digit else False

    # ─ Classify ─
    if semantic_match and ford_match:
        results_by_kraj[kraj]["v_obou"] += 1
        cat = "v_obou"
    elif semantic_match:
        results_by_kraj[kraj]["jen_semantic"] += 1
        cat = "jen_semantic"
    elif ford_match:
        results_by_kraj[kraj]["jen_ford"] += 1
        cat = "jen_ford"
    else:
        results_by_kraj[kraj]["mimo_vse"] += 1
        cat = "mimo_vse"

    # Track top domains (for tooltip)
    if semantic_match or ford_match:
        td = results_by_kraj[kraj]["top_domeny"]
        if best_domain_name not in td:
            td[best_domain_name] = {"semantic_count": 0, "ford_count": 0}
        if semantic_match:
            td[best_domain_name]["semantic_count"] += 1
        if ford_match:
            td[best_domain_name]["ford_count"] += 1

    # Raw score (first 5 per kraj for diagnostics, full list for data)
    raw_scores[kraj].append({
        "projekt_kod": project.get("kod", ""),
        "max_similarity": round(max_sim, 4),
        "best_domena": best_domain_name,
        "ford_match": ford_match,
        "semantic_match": semantic_match,
        "category": cat,
    })

print(f"Skipped {skipped} projects (no matching kraj in domains)")

# Convert top_domeny to sorted lists
for kraj in results_by_kraj:
    td = results_by_kraj[kraj]["top_domeny"]
    results_by_kraj[kraj]["top_domeny"] = sorted(
        [{"nazev": k, **v} for k, v in td.items()],
        key=lambda x: x["semantic_count"] + x["ford_count"],
        reverse=True,
    )[:10]

# ── Output ──────────────────────────────────────────────────────────
output = {
    "meta": {
        "zdroj": "IS VaVaI + Příloha 2 NRIS3 v08",
        "model": model_name,
        "threshold_semantic": THRESHOLD,
        "threshold_ford": FORD_THRESHOLD,
        "datum": "2026-02-25",
        "pocet_projektu": len(projects),
    },
    "kraje": results_by_kraj,
    "raw_scores": raw_scores,
}

out_path = DATA_DIR / "vav_semantic_match.json"
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

print(f"\nSaved to {out_path}")
total_processed = sum(r["celkem_projektu"] for r in results_by_kraj.values())
print(f"Projects processed: {total_processed}")
print()

# Summary table
print(f"{'Kraj':<28} {'Celkem':>6} {'Oba':>5} {'Sem':>5} {'FORD':>5} {'Nic':>5}  {'Oba%':>5} {'Oba+Sem%':>8}")
print("-" * 90)
for kraj in sorted(results_by_kraj.keys()):
    r = results_by_kraj[kraj]
    t = r["celkem_projektu"]
    if t == 0:
        continue
    pct_both = r["v_obou"] / t * 100
    pct_aligned = (r["v_obou"] + r["jen_semantic"]) / t * 100
    print(f"{kraj:<28} {t:>6} {r['v_obou']:>5} {r['jen_semantic']:>5} {r['jen_ford']:>5} {r['mimo_vse']:>5}  {pct_both:>5.1f} {pct_aligned:>8.1f}")

# Distribution of similarity scores
all_sims = []
for kraj_scores in raw_scores.values():
    for s in kraj_scores:
        all_sims.append(s["max_similarity"])
all_sims = np.array(all_sims)
print(f"\nSimilarity score distribution:")
print(f"  Min: {all_sims.min():.4f}  Max: {all_sims.max():.4f}")
print(f"  Mean: {all_sims.mean():.4f}  Median: {np.median(all_sims):.4f}")
for t in [0.25, 0.30, 0.35, 0.40, 0.45, 0.50]:
    pct = (all_sims > t).mean() * 100
    print(f"  > {t}: {pct:.1f}%")
