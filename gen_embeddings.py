"""Generate semantic similarity matrix using sentence-transformers."""
import json, sys, numpy as np
sys.stdout.reconfigure(encoding='utf-8')

# Load domain texts
with open('public/data/domeny_plne_texty.json', encoding='utf-8') as f:
    data = json.load(f)

# Prepare texts per kraj
kraje = sorted(data.keys())
texts_per_kraj = {}
for kraj in kraje:
    # Handle both list and dict-of-dicts format
    items = data[kraj]
    if isinstance(items, dict):
        items = list(items.values())
    texts = [d['text_pro_embedding'] for d in items if d.get('text_pro_embedding')]
    texts_per_kraj[kraj] = texts
    print(f"  {kraj}: {len(texts)} domain texts")

# Load model
print("\nLoading embedding model...")
from sentence_transformers import SentenceTransformer

try:
    model = SentenceTransformer('google/embeddinggemma-300m')
    model_name = 'google/embeddinggemma-300m'
    print(f"Using {model_name}")
except Exception as e:
    print(f"embeddinggemma failed: {e}")
    print("Falling back to paraphrase-multilingual-MiniLM-L12-v2")
    model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')
    model_name = 'paraphrase-multilingual-MiniLM-L12-v2'

# Generate embeddings for all domain texts
print("\nGenerating embeddings...")
all_texts = []
text_to_kraj = []
for kraj in kraje:
    for t in texts_per_kraj[kraj]:
        all_texts.append(t)
        text_to_kraj.append(kraj)

embeddings = model.encode(all_texts, show_progress_bar=True, convert_to_numpy=True)
print(f"Generated {len(embeddings)} embeddings, dim={embeddings.shape[1]}")

# Build per-kraj embedding lists
kraj_embeddings = {k: [] for k in kraje}
for i, kraj in enumerate(text_to_kraj):
    kraj_embeddings[kraj].append(embeddings[i])

# Compute pairwise average-max cosine similarity
def cos_sim(a, b):
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-10)

def avg_max_similarity(embs_a, embs_b):
    """For each domain in A, find max similarity to any domain in B. Average both directions."""
    if len(embs_a) == 0 or len(embs_b) == 0:
        return 0.0

    # A→B direction
    scores_ab = []
    for ea in embs_a:
        max_sim = max(cos_sim(ea, eb) for eb in embs_b)
        scores_ab.append(max_sim)

    # B→A direction
    scores_ba = []
    for eb in embs_b:
        max_sim = max(cos_sim(eb, ea) for ea in embs_a)
        scores_ba.append(max_sim)

    return (np.mean(scores_ab) + np.mean(scores_ba)) / 2

print("\nComputing similarity matrix...")
matrix = {}
for i, k1 in enumerate(kraje):
    matrix[k1] = {}
    for j, k2 in enumerate(kraje):
        if k1 == k2:
            matrix[k1][k2] = 1.0
        elif k2 in matrix and k1 in matrix[k2]:
            matrix[k1][k2] = matrix[k2][k1]  # symmetric
        else:
            sim = avg_max_similarity(kraj_embeddings[k1], kraj_embeddings[k2])
            matrix[k1][k2] = round(float(sim), 4)
    print(f"  {k1}: done")

# Also compute per-kraj average semantic similarity (like Jaccard avg)
avg_similarity = {}
for k1 in kraje:
    others = [matrix[k1][k2] for k2 in kraje if k2 != k1]
    avg_similarity[k1] = round(float(np.mean(others)), 4)

# Save
result = {
    'model': model_name,
    'kraje': kraje,
    'matrix': matrix,
    'avg_similarity': avg_similarity,
    'domain_count': {k: len(texts_per_kraj[k]) for k in kraje},
}

with open('public/data/semanticka_podobnost.json', 'w', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

print("\nSimilarity matrix:")
for k1 in kraje:
    vals = [f"{matrix[k1][k2]:.2f}" for k2 in kraje]
    print(f"  {k1[:12]:12s}: {' '.join(vals)}")

print(f"\nAvg semantic similarity per kraj:")
for k, v in sorted(avg_similarity.items(), key=lambda x: -x[1]):
    print(f"  {k:25s}: {v:.4f}")

print("\nSaved to public/data/semanticka_podobnost.json")
