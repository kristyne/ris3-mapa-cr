"""Parse domain descriptions from Priloha_2_NRIS3_v08.pdf"""
import pdfplumber, json, re, sys
sys.stdout.reconfigure(encoding='utf-8')

pdf_path = 'C:/Users/meisl/Downloads/Seminář CzechInvest pro RIS3 Analytiky/seminar_code_viz/ris3-podklady/data/Priloha_2_NRIS3_v08.pdf'

with pdfplumber.open(pdf_path) as pdf:
    full_text = ""
    for page in pdf.pages:
        t = page.extract_text() or ""
        full_text += t + "\n\n"

# Build kraj sections
KRAJ_PATTERNS = [
    ('Jihočeský kraj\nKrajská RIS3', 'Jihočeský kraj'),
    ('Jihomoravský kraj\nKrajská RIS3', 'Jihomoravský kraj'),
    ('Karlovarský kraj\nKrajská RIS3', 'Karlovarský kraj'),
    ('Královéhradecký kraj\nKrajská RIS3', 'Královéhradecký kraj'),
    ('Liberecký kraj\nKrajská RIS3', 'Liberecký kraj'),
    ('Moravskoslezský kraj\nKrajská RIS3', 'Moravskoslezský kraj'),
    ('Olomoucký kraj\nKrajská RIS3', 'Olomoucký kraj'),
    ('Pardubický kraj\nKrajská RIS3', 'Pardubický kraj'),
    ('Plzeňský kraj\nKrajská RIS3', 'Plzeňský kraj'),
    ('Praha\nNázev a schválení', 'Hl. m. Praha'),
    ('Středočeský kraj\nKrajská RIS3', 'Středočeský kraj'),
    ('Ústecký kraj\nKrajská RIS3', 'Ústecký kraj'),
    ('Kraj Vysočina\nKrajská RIS3', 'Vysočina'),
    ('Zlínský kraj\nKrajská RIS3', 'Zlínský kraj'),
]

positions = []
for pattern, name in KRAJ_PATTERNS:
    idx = full_text.find(pattern)
    if idx >= 0:
        positions.append((idx, name))
positions.sort(key=lambda x: x[0])

kraj_texts = {}
for i, (start, name) in enumerate(positions):
    end = positions[i+1][0] if i+1 < len(positions) else len(full_text)
    kraj_texts[name] = full_text[start:end]

def extract_nace(text):
    codes = re.findall(r'\b(\d{2})\b', text)
    return list(dict.fromkeys(c for c in codes if 1 <= int(c) <= 99))

def find_domain_section(text):
    markers = ['Domény specializace', 'Tematické priority:']
    start = None
    for m in markers:
        idx = text.find(m)
        if idx >= 0:
            start = idx
            break
    if start is None:
        return ""
    end = len(text)
    for em in ['Vznikající', 'Emerging', 'Realizace krajské', 'Realizace Krajské',
               'Instituce s hlavní', 'V následující aktualizaci', 'Realizační rámec']:
        eidx = text.find(em, start + 50)
        if eidx >= 0:
            end = min(end, eidx)
    return text[start:end]

def parse_generic(text, kraj_name):
    """Generic parser that works for most kraje."""
    section = find_domain_section(text)
    if not section:
        return []

    lines = section.split('\n')
    domains = []
    current_name = None
    current_text = []
    current_nace = []

    skip_patterns = [
        'Domény specializace', 'Tematické priority', 'Klíčová hospodářská',
        'Informuje ty', 'předpokládat', 'perspektiv', 'Tematická specializace',
        'Z hlediska EDP', 'Z pohledu koncových', 'byly formulovány',
        'Preferované perspektivní', 'Související odvětví',
    ]

    # For MSK, skip intro paragraphs until numbered items
    in_intro = kraj_name == 'Moravskoslezský kraj'

    for line in lines:
        line = line.strip()
        if not line:
            continue

        if any(line.startswith(p) for p in skip_patterns):
            continue

        if in_intro:
            if re.match(r'^\d+\.', line):
                in_intro = False
            else:
                continue

        # NACE reference line
        nace_match = re.search(r'(?:Vazba na |Stěžejní )?CZ[\s-]*NACE[:\s]*(.*)', line, re.IGNORECASE)
        if nace_match:
            codes = extract_nace(nace_match.group(1))
            if current_name:
                desc = ' '.join(current_text).strip()
                domains.append({
                    'nazev': current_name,
                    'popis': desc,
                    'nace': codes,
                    'text_pro_embedding': f"{current_name}: {desc}" if desc else current_name
                })
            current_name = None
            current_text = []
            continue

        # Inline NACE in parentheses (Středočeský style)
        inline_nace = re.search(r'\(CZ-NACE[\s:]*([\d,.\s]+)\)', line)

        # Numbered domain (MSK: "1. Name")
        numbered = re.match(r'^(\d+)\.\s+(.+)', line)

        is_bullet = line[0] in '•●–-' if line else False

        if numbered:
            if current_name and current_text:
                desc = ' '.join(current_text).strip()
                if desc:
                    domains.append({
                        'nazev': current_name, 'popis': desc,
                        'nace': current_nace,
                        'text_pro_embedding': f"{current_name}: {desc}"
                    })
            current_name = numbered.group(2)
            current_text = []
            current_nace = []
        elif is_bullet:
            clean = line.lstrip('•●–- ').strip()
            if clean:
                current_text.append(clean)
        elif inline_nace and len(line) < 120:
            # Domain name with inline NACE
            if current_name and current_text:
                desc = ' '.join(current_text).strip()
                if desc:
                    domains.append({
                        'nazev': current_name, 'popis': desc,
                        'nace': current_nace,
                        'text_pro_embedding': f"{current_name}: {desc}"
                    })
            current_name = re.sub(r'\(CZ-NACE[^)]+\)', '', line).strip()
            current_text = []
            current_nace = extract_nace(inline_nace.group(1))
        elif len(line) < 80 and not is_bullet and line[0].isupper():
            # Likely a domain name
            if current_name and current_text:
                desc = ' '.join(current_text).strip()
                if len(desc) > 10:
                    domains.append({
                        'nazev': current_name, 'popis': desc,
                        'nace': current_nace,
                        'text_pro_embedding': f"{current_name}: {desc}"
                    })
            current_name = line
            current_text = []
            current_nace = []
        else:
            # Description text
            if current_name:
                current_text.append(line)

    # Last domain
    if current_name and current_text:
        desc = ' '.join(current_text).strip()
        if len(desc) > 10:
            domains.append({
                'nazev': current_name, 'popis': desc,
                'nace': current_nace,
                'text_pro_embedding': f"{current_name}: {desc}"
            })

    return domains

def parse_praha(text):
    section = find_domain_section(text)
    if not section:
        return []

    domains = []
    parts = re.split(r'\n([A-D])\.\s+', section)

    for i in range(1, len(parts)-1, 2):
        letter = parts[i]
        content = parts[i+1]
        lines = content.strip().split('\n')
        name = lines[0].strip().rstrip(',')
        desc_lines = []
        for l in lines[1:]:
            clean = l.strip().lstrip('●•- ').strip()
            if clean:
                desc_lines.append(clean)
        desc = ' '.join(desc_lines)
        domains.append({
            'nazev': f"{name}",
            'popis': desc,
            'nace': [],
            'text_pro_embedding': f"{name}: {desc}"
        })

    return domains

# Parse all kraje
result = {}
for kraj_name, text in kraj_texts.items():
    if kraj_name == 'Hl. m. Praha':
        domains = parse_praha(text)
    else:
        domains = parse_generic(text, kraj_name)

    # Filter out garbage
    domains = [d for d in domains if len(d['nazev']) > 3 and len(d['nazev']) < 120
               and not d['nazev'].startswith('Zaměření domény')]

    result[kraj_name] = domains
    nace_count = sum(1 for d in domains if d['nace'])
    avg_desc = sum(len(d['popis']) for d in domains) / max(1, len(domains))
    print(f"  {kraj_name:25s}: {len(domains):2d} domains, {nace_count} with NACE, avg desc {avg_desc:.0f} chars")
    for d in domains:
        print(f"    - {d['nazev'][:60]:60s} [{len(d['nace'])} NACE, {len(d['popis']):4d} chars]")

out_path = 'C:/Users/meisl/Downloads/Seminář CzechInvest pro RIS3 Analytiky/seminar_code_viz/ris3-mapa-cr/public/data/domeny_plne_texty.json'
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

total = sum(len(v) for v in result.values())
with_desc = sum(1 for v in result.values() for d in v if len(d['popis']) > 30)
print(f"\nTotal: {total} domains, {with_desc} with descriptions > 30 chars. Saved.")
