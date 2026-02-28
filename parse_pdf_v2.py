"""
Parse domain descriptions from Priloha_2_NRIS3_v08.pdf — v2 (robust per-kraj parsing).
Handles all 14 formatting variants. Extracts: domain names, full descriptions, NACE codes,
and emerging domains.
"""
import pdfplumber, json, re, sys
sys.stdout.reconfigure(encoding='utf-8')

pdf_path = 'C:/Users/meisl/Downloads/Seminář CzechInvest pro RIS3 Analytiky/seminar_code_viz/ris3-podklady/data/Priloha_2_NRIS3_v08.pdf'

with pdfplumber.open(pdf_path) as pdf:
    full_text = ""
    for page in pdf.pages:
        t = page.extract_text() or ""
        full_text += t + "\n\n"

# Also load the pre-extracted fulltext for reference/fallback
fulltext_path = 'C:/Users/meisl/Downloads/Seminář CzechInvest pro RIS3 Analytiky/seminar_code_viz/ris3-podklady/data/_priloha2_v08_fulltext.txt'
with open(fulltext_path, 'r', encoding='utf-8') as f:
    ref_text = f.read()

# ── Build kraj sections ──────────────────────────────────────────────────────
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
    else:
        print(f"  WARNING: Pattern not found for {name}")
positions.sort(key=lambda x: x[0])

kraj_texts = {}
for i, (start, name) in enumerate(positions):
    end = positions[i+1][0] if i+1 < len(positions) else len(full_text)
    kraj_texts[name] = full_text[start:end]

# ── Helper functions ─────────────────────────────────────────────────────────

def extract_nace_codes(text):
    """Extract 2-digit NACE codes from text. Handles various formats."""
    # Find all 2-digit numbers that look like NACE codes (01-99)
    codes = re.findall(r'\b(\d{2})(?:\.\d+)?\b', text)
    # Deduplicate preserving order, filter valid range
    seen = set()
    result = []
    for c in codes:
        if c not in seen and 1 <= int(c) <= 99:
            seen.add(c)
            result.append(c)
    return result

def find_section(text, start_markers, end_markers, start_offset=0):
    """Find text section between start and end markers."""
    start = None
    for m in start_markers:
        idx = text.find(m, start_offset)
        if idx >= 0:
            start = idx
            break
    if start is None:
        return "", 0
    end = len(text)
    for em in end_markers:
        eidx = text.find(em, start + 50)
        if eidx >= 0 and eidx < end:
            end = eidx
    return text[start:end], start

def is_page_marker(line):
    return line.strip().startswith('=== PAGE') or re.match(r'^\d{1,3}$', line.strip())

def is_garbage(line):
    """Detect OCR garbage lines."""
    if len(line.strip()) < 3:
        return True
    # High ratio of unusual character sequences
    alpha = sum(1 for c in line if c.isalpha())
    if alpha > 0 and len(line.strip()) > 10:
        spaces = line.count(' ')
        if spaces / max(1, len(line.strip())) > 0.4:
            return True
    return False

def clean_domain_name(name):
    """Clean up a domain name string."""
    name = name.strip().rstrip(',').rstrip('.')
    name = re.sub(r'\s+', ' ', name)
    return name

# ── Per-kraj parsers ─────────────────────────────────────────────────────────

def parse_jihocesky(text):
    """Plain headers, bullets •, NACE on 'Vazba na CZ-NACE: hlavni vazby: ...'"""
    section, _ = find_section(text,
        ['Domény specializace Jihočeského kraje'],
        ['Vznikající', 'Emerging', 'Realizace krajské'])
    if not section:
        return [], []

    lines = section.split('\n')
    domains = []
    current = None

    for line in lines:
        line_s = line.strip()
        if not line_s or is_page_marker(line):
            continue
        if line_s.startswith('Domény specializace'):
            continue

        nace_match = re.search(r'Vazba na CZ[- ]?NACE[:\s]*(.*)', line_s, re.IGNORECASE)
        if nace_match:
            if current:
                current['nace'] = extract_nace_codes(nace_match.group(1))
                domains.append(current)
                current = None
            continue

        if line_s.startswith(('•', '●', '–', '-')) and current:
            clean = line_s.lstrip('•●–- ').strip()
            if clean:
                current['desc_lines'].append(clean)
        elif not line_s.startswith(('•', '●')) and len(line_s) < 100 and line_s[0].isupper():
            # Save previous domain
            if current and current['desc_lines']:
                domains.append(current)
            current = {'nazev': clean_domain_name(line_s), 'desc_lines': [], 'nace': []}
        elif current:
            current['desc_lines'].append(line_s)

    if current and current['desc_lines']:
        domains.append(current)

    # Emerging
    emerging = []
    em_section, _ = find_section(text,
        ['Vznikající', 'Emerging'],
        ['Realizace krajské', 'Realizace Krajské', 'Instituce s hlavní'])
    if em_section:
        for line in em_section.split('\n'):
            line_s = line.strip()
            if line_s.startswith(('•', '●', '–')):
                clean = line_s.lstrip('•●–- ').strip()
                if clean and len(clean) > 5:
                    emerging.append(clean)

    return _finalize(domains), emerging


def parse_jihomoravsky(text):
    """Bullets • with inline NACE '(těžiště v CZ-NACE NN)'. Skip cluster diagram."""
    section, _ = find_section(text,
        ['Domény specializace kraje/ Klíčová', 'Domény specializace kraje/'],
        ['Vznikající', 'Emerging'])
    if not section:
        return [], []

    lines = section.split('\n')
    domains = []

    for line in lines:
        line_s = line.strip()
        if not line_s or is_page_marker(line):
            continue
        # Domain lines are bullets with inline NACE
        if line_s.startswith('•') and 'CZ-NACE' in line_s:
            nace_match = re.search(r'\(těžišt[eě]\s+v\s+CZ-NACE\s+([\d,. a částicásti]+)\)', line_s)
            nace_codes = extract_nace_codes(nace_match.group(1)) if nace_match else []
            # Remove the NACE parenthetical from domain name
            name = re.sub(r'\s*\(těžišt[eě][^)]+\)', '', line_s)
            name = name.lstrip('•●– ').strip()
            if name and len(name) > 3:
                domains.append({
                    'nazev': clean_domain_name(name),
                    'desc_lines': [],  # JHM domains don't have individual descriptions
                    'nace': nace_codes,
                })

    # Emerging
    emerging = []
    em_section, _ = find_section(text,
        ['Vznikající', 'Emerging'],
        ['Realizace krajské', 'Realizace Krajské', 'Instituce s hlavní'])
    if em_section:
        for line in em_section.split('\n'):
            line_s = line.strip()
            if line_s.startswith(('•', '●')):
                clean = line_s.lstrip('•●– ').strip()
                if clean and len(clean) > 5:
                    emerging.append(clean)

    return _finalize(domains), emerging


def parse_karlovarsky(text):
    """Plain headers, bullets •, NACE on 'Vazba na CZ-NACE: ...'"""
    section, _ = find_section(text,
        ['Domény specializace kraje'],
        ['Vznikající', 'Emerging', 'Realizace krajské'])
    if not section:
        return [], []

    lines = section.split('\n')
    domains = []
    current = None

    for line in lines:
        line_s = line.strip()
        if not line_s or is_page_marker(line):
            continue
        if line_s.startswith('Domény specializace'):
            continue

        nace_match = re.search(r'Vazba na CZ[- ]?NACE[:\s]*(.*)', line_s, re.IGNORECASE)
        if nace_match:
            if current:
                current['nace'] = extract_nace_codes(nace_match.group(1))
                domains.append(current)
                current = None
            continue

        if line_s.startswith(('•', '●', '–')) and current:
            clean = line_s.lstrip('•●–- ').strip()
            if clean:
                current['desc_lines'].append(clean)
        elif not line_s.startswith(('•', '●')) and len(line_s) < 100 and line_s[0].isupper() and current is None or (current and not current['desc_lines']):
            if current and current['desc_lines']:
                domains.append(current)
            current = {'nazev': clean_domain_name(line_s), 'desc_lines': [], 'nace': []}
        elif not line_s.startswith(('•', '●')) and len(line_s) < 80 and line_s[0].isupper():
            if current and current['desc_lines']:
                domains.append(current)
            current = {'nazev': clean_domain_name(line_s), 'desc_lines': [], 'nace': []}
        elif current:
            current['desc_lines'].append(line_s)

    if current and current['desc_lines']:
        domains.append(current)

    # Emerging
    emerging = []
    em_section, _ = find_section(text,
        ['Vznikající', 'Emerging'],
        ['Realizace krajské', 'Realizace Krajské', 'Instituce s hlavní'])
    if em_section:
        for line in em_section.split('\n'):
            line_s = line.strip()
            if line_s.startswith(('•', '●')):
                clean = line_s.lstrip('•●– ').strip()
                if clean and len(clean) > 10:
                    emerging.append(clean)

    return _finalize(domains), emerging


def parse_kralovehradecky(text):
    """Plain headers, bullets •, NACE on 'Vazba domény na CZ-NACE: ...' with semicolons"""
    section, _ = find_section(text,
        ['Domény specializace kraje'],
        ['Vznikající', 'Emerging', 'Realizace krajské'])
    if not section:
        return [], []

    lines = section.split('\n')
    domains = []
    current = None

    for line in lines:
        line_s = line.strip()
        if not line_s or is_page_marker(line):
            continue
        if line_s.startswith('Domény specializace'):
            continue

        nace_match = re.search(r'Vazb[ay]\s+dom[eé]n[yě]?\s+na\s+CZ[- ]?NACE[:\s]*(.*)', line_s, re.IGNORECASE)
        if nace_match:
            if current:
                current['nace'] = extract_nace_codes(nace_match.group(1))
                domains.append(current)
                current = None
            continue

        # Sub-category headers within domains (e.g. "Činnost institucí:", "Tradiční činnosti:")
        if line_s.endswith(':') and len(line_s) < 50 and current:
            current['desc_lines'].append(line_s)
            continue

        if line_s.startswith(('•', '●', '–')) and current:
            clean = line_s.lstrip('•●–- ').strip()
            if clean:
                current['desc_lines'].append(clean)
        elif not line_s.startswith(('•', '●')) and len(line_s) < 100 and line_s[0].isupper():
            if current and (current['desc_lines'] or current['nace']):
                domains.append(current)
            current = {'nazev': clean_domain_name(line_s), 'desc_lines': [], 'nace': []}
        elif current:
            current['desc_lines'].append(line_s)

    if current and (current['desc_lines'] or current['nace']):
        domains.append(current)

    # Emerging
    emerging = []
    em_section, _ = find_section(text,
        ['Vznikající', 'Emerging'],
        ['Realizace krajské', 'Realizace Krajské', 'Instituce s hlavní'])
    if em_section:
        for line in em_section.split('\n'):
            line_s = line.strip()
            if line_s.startswith(('•', '●')):
                clean = line_s.lstrip('•●– ').strip()
                if clean and len(clean) > 5:
                    emerging.append(clean)

    return _finalize(domains), emerging


def parse_liberecky(text):
    """Plain headers, bullets •, NACE on 'Vazba domény na CZ-NACE: ...'"""
    section, _ = find_section(text,
        ['Domény specializace Libereckého kraje'],
        ['Vznikající', 'Emerging', 'Realizace krajské', 'Realiza'])
    if not section:
        return [], []

    lines = section.split('\n')
    domains = []
    current = None

    for line in lines:
        line_s = line.strip()
        if not line_s or is_page_marker(line) or is_garbage(line_s):
            continue
        if line_s.startswith('Domény specializace'):
            continue

        nace_match = re.search(r'Vazb[ay]\s+dom[eé]n[yě]?\s+na\s+CZ[- ]?NACE[:\s]*(.*)', line_s, re.IGNORECASE)
        if nace_match:
            if current:
                current['nace'] = extract_nace_codes(nace_match.group(1))
                domains.append(current)
                current = None
            continue

        if line_s.startswith(('•', '●', '–')) and current:
            clean = line_s.lstrip('•●–- ').strip()
            if clean:
                current['desc_lines'].append(clean)
        elif not line_s.startswith(('•', '●')) and len(line_s) < 120 and len(line_s) > 10 and line_s[0].isupper() and not any(skip in line_s for skip in ['Informuje', 'předpokládat', 'perspektiv']):
            if current and (current['desc_lines'] or current['nace']):
                domains.append(current)
            current = {'nazev': clean_domain_name(line_s), 'desc_lines': [], 'nace': []}
        elif current:
            current['desc_lines'].append(line_s)

    if current and (current['desc_lines'] or current['nace']):
        domains.append(current)

    # Emerging
    emerging = []
    em_section, _ = find_section(text,
        ['Vznikající', 'Emerging'],
        ['Realizace krajské', 'Realizace Krajské', 'Realiza'])
    if em_section:
        for line in em_section.split('\n'):
            line_s = line.strip()
            if len(line_s) > 10 and not is_page_marker(line) and not is_garbage(line_s) and not line_s.startswith(('Vznikající', 'Emerging')):
                emerging.append(line_s)

    return _finalize(domains), emerging


def parse_moravskoslezsky(text):
    """Numbered domains in 2 groups, 'Zaměření domény:' blocks, 'Hlavní vazby na CZ-NACE - NN'"""
    section, _ = find_section(text,
        ['Tematická specializace RIS MSK', 'Z pohledu koncových trhů'],
        ['Realizace krajské', 'Instituce s hlavní výkonnou'])
    if not section:
        return [], []

    lines = section.split('\n')
    domains = []
    current = None
    in_description = False

    for line in lines:
        line_s = line.strip()
        if not line_s or is_page_marker(line):
            continue

        # Skip intro paragraphs
        if any(skip in line_s for skip in [
            'Tematická specializace', 'Z hlediska EDP', 'Z pohledu koncových',
            'Z pohledu technologických', 'byly formulovány', 'prioritám při rozvoji',
            'aktualizaci RIS MSK', 'Současně s tím', 'příležitosti pro více',
            'specializace vychází', 'vzájemně propojených'
        ]):
            continue

        # NACE line — use \u2013 explicitly for EN DASH
        nace_match = re.search(r'Hlavní vazby na CZ[\-\s]?NACE\s*[\-\u2013:]\s*(.*)', line_s, re.IGNORECASE)
        if nace_match:
            if current:
                current['nace'] = extract_nace_codes(nace_match.group(1))
                domains.append(current)
                current = None
                in_description = False
            continue

        # Numbered domain
        numbered = re.match(r'^(\d+)\.\s+(.+)', line_s)
        if numbered and 'Zaměření' not in line_s:
            if current:
                # Previous domain — save it
                if current['desc_lines']:
                    domains.append(current)
            current = {'nazev': clean_domain_name(numbered.group(2)), 'desc_lines': [], 'nace': []}
            in_description = False
            continue

        # "Zaměření domény:" marker
        if 'Zaměření domény' in line_s:
            in_description = True
            continue

        # Emerging section marker
        if 'Emerging domén' in line_s or 'Emerging oblasti' in line_s:
            if current and current['desc_lines']:
                domains.append(current)
                current = None
            # Continue parsing — emerging domains also numbered
            continue

        if in_description and current:
            current['desc_lines'].append(line_s)
        elif current and not in_description:
            pass

    if current and current['desc_lines']:
        domains.append(current)

    # Separate main vs emerging
    emerging = []
    em_idx = text.find('Emerging domén')
    if em_idx >= 0:
        em_text = text[em_idx:]
        em_end = em_text.find('Realiza')
        if em_end < 0:
            em_end = em_text.find('Instituce s hlavní')
        if em_end > 0:
            em_text = em_text[:em_end]
        for m in re.finditer(r'\d+\.\s+([^\n]+)', em_text):
            name = m.group(1).strip()
            if name and 'Zaměření' not in name and len(name) > 5:
                emerging.append(name)

    return _finalize(domains), emerging


def parse_olomoucky(text):
    """Bullets • with inline description after em dash –. No NACE. No Emerging."""
    section, _ = find_section(text,
        ['Domény specializace kraje:'],
        ['RIS3 mise', 'Realizace krajské', 'Realizace Krajské', 'Instituce s hlavní'])
    if not section:
        return [], []

    lines = section.split('\n')
    domains = []

    for line in lines:
        line_s = line.strip()
        if not line_s or is_page_marker(line):
            continue
        if line_s.startswith('Domény specializace'):
            continue

        if line_s.startswith(('•', '●')):
            clean = line_s.lstrip('•●– ').strip()
            if '–' in clean:
                parts = clean.split('–', 1)
                name = parts[0].strip()
                desc = parts[1].strip() if len(parts) > 1 else ''
            elif '−' in clean:
                parts = clean.split('−', 1)
                name = parts[0].strip()
                desc = parts[1].strip() if len(parts) > 1 else ''
            else:
                name = clean
                desc = ''
            if name and len(name) > 3:
                domains.append({
                    'nazev': clean_domain_name(name),
                    'desc_lines': [desc] if desc else [],
                    'nace': [],
                })

    return _finalize(domains), []


def parse_pardubicky(text):
    """Plain headers, narrative descriptions, 'Stěžejní CZ NACE pro tuto doménu: ...'"""
    section, _ = find_section(text,
        ['Domény specializace kraje'],
        ['Vznikající', 'Emerging', 'Realizace krajské', 'směřuje budoucí'])
    if not section:
        return [], []

    lines = section.split('\n')
    domains = []
    current = None

    for line in lines:
        line_s = line.strip()
        if not line_s or is_page_marker(line):
            continue
        if line_s.startswith('Domény specializace'):
            continue

        nace_match = re.search(r'Stěžejní\s+CZ\s*[-]?NACE\s+pro\s+tuto\s+doménu[:\s]*(.*)', line_s, re.IGNORECASE)
        if nace_match:
            if current:
                current['nace'] = extract_nace_codes(nace_match.group(1))
                domains.append(current)
                current = None
            continue

        if line_s.startswith(('•', '●', '–')) and current:
            clean = line_s.lstrip('•●–- ').strip()
            if clean:
                current['desc_lines'].append(clean)
        elif not line_s.startswith(('•', '●')) and 10 < len(line_s) < 100 and line_s[0].isupper() and not any(w in line_s.lower() for w in ['zaměření', 'stěžejní', 'preferované']):
            if current and current['desc_lines']:
                domains.append(current)
            current = {'nazev': clean_domain_name(line_s), 'desc_lines': [], 'nace': []}
        elif current:
            current['desc_lines'].append(line_s)

    if current and current['desc_lines']:
        domains.append(current)

    # Emerging
    emerging = []
    em_section, _ = find_section(text,
        ['Vznikající', 'Emerging'],
        ['Realizace krajské', 'Realizace Krajské'])
    if em_section:
        for line in em_section.split('\n'):
            line_s = line.strip()
            if len(line_s) > 10 and not line_s.startswith(('Vznikající', 'Emerging')) and not is_page_marker(line):
                emerging.append(line_s)

    return _finalize(domains), emerging


def parse_plzensky(text):
    """Plain headers, dash-bullet sub-items, 'Související odvětví (CZ-NACE)' then descriptive line"""
    section, _ = find_section(text,
        ['Tematické priority'],
        ['Realizace krajské', 'Realizace Krajské', 'Instituce s hlavní'])
    if not section:
        return [], []

    lines = section.split('\n')
    domains = []
    current = None
    in_nace_block = False

    for line in lines:
        line_s = line.strip()
        if not line_s or is_page_marker(line):
            continue
        if line_s.startswith('Tematické priority'):
            continue

        # NACE block header
        if 'Související odvětví' in line_s and 'CZ-NACE' in line_s:
            in_nace_block = True
            continue

        if in_nace_block:
            if line_s.startswith('-') or line_s.startswith('–'):
                codes = extract_nace_codes(line_s)
                if current:
                    current['nace'].extend(codes)
            else:
                in_nace_block = False
                # This line is likely the next domain or section
                if current:
                    domains.append(current)
                    current = None
                # Fall through to domain detection below

        if in_nace_block:
            continue

        # "Preferované perspektivní směry:" — skip this marker
        if 'Preferované perspektivní' in line_s:
            continue

        if line_s.startswith(('-', '–')) and current:
            clean = line_s.lstrip('-– ').strip()
            if clean:
                current['desc_lines'].append(clean)
        elif not line_s.startswith(('-', '–', '•')) and 10 < len(line_s) < 80 and line_s[0].isupper():
            if current and (current['desc_lines'] or current['nace']):
                domains.append(current)
            current = {'nazev': clean_domain_name(line_s), 'desc_lines': [], 'nace': []}
        elif current:
            current['desc_lines'].append(line_s)

    if current and (current['desc_lines'] or current['nace']):
        domains.append(current)

    return _finalize(domains), []


def parse_praha(text):
    """Letter-numbered A.-D., bullets ●. No NACE."""
    section, _ = find_section(text,
        ['Tematické priority – Domény', 'Tematické priority — Domény', 'Tematické priority:'],
        ['V následující aktualizaci', 'Realizace krajské'])
    if not section:
        return [], []

    domains = []
    parts = re.split(r'\n([A-D])\.\s+', section)

    for i in range(1, len(parts)-1, 2):
        content = parts[i+1]
        lines = content.strip().split('\n')
        name = lines[0].strip().rstrip(',')
        desc_lines = []
        for l in lines[1:]:
            clean = l.strip().lstrip('●•–- ').strip()
            if clean and not is_page_marker(l) and len(clean) > 3:
                desc_lines.append(clean)
        domains.append({
            'nazev': clean_domain_name(name),
            'desc_lines': desc_lines,
            'nace': [],
        })

    # Check for planned future domains
    emerging = []
    em_section, _ = find_section(text,
        ['V následující aktualizaci'],
        ['Realizace krajské', 'Realizace Krajské'])
    if em_section:
        for line in em_section.split('\n'):
            line_s = line.strip()
            if line_s.startswith(('•', '●')):
                clean = line_s.lstrip('•●– ').strip()
                if clean and len(clean) > 5:
                    emerging.append(clean)

    return _finalize(domains), emerging


def parse_stredocesky(text):
    """Plain headers with inline NACE '(CZ-NACE NN, NN)', bullets • with sub-NACEs."""
    section, _ = find_section(text,
        ['Domény specializace kraje (vertikální', 'Domény specializace kraje'],
        ['Vznikající', 'Emerging', 'Realizace krajské'])
    if not section:
        return [], []

    lines = section.split('\n')
    domains = []
    current = None

    for line in lines:
        line_s = line.strip()
        if not line_s or is_page_marker(line):
            continue
        if line_s.startswith('Domény specializace'):
            continue
        # Skip footnotes
        if re.match(r'^\d+\s+viz:', line_s):
            continue

        inline_nace = re.search(r'\(CZ-NACE\s+([\d,.\s]+)\)', line_s)
        if inline_nace and not line_s.startswith(('•', '●')):
            # Domain name with inline NACE
            if current and (current['desc_lines'] or current['nace']):
                domains.append(current)
            name = re.sub(r'\s*\(CZ-NACE[^)]+\)', '', line_s).strip()
            current = {
                'nazev': clean_domain_name(name),
                'desc_lines': [],
                'nace': extract_nace_codes(inline_nace.group(1)),
            }
        elif line_s.startswith(('•', '●')) and current:
            clean = line_s.lstrip('•●– ').strip()
            if clean:
                current['desc_lines'].append(clean)
        elif current:
            current['desc_lines'].append(line_s)

    if current and (current['desc_lines'] or current['nace']):
        domains.append(current)

    # Emerging
    emerging = []
    em_section, _ = find_section(text,
        ['Vznikající', 'Emerging'],
        ['Realizace krajské', 'Realizace Krajské'])
    if em_section:
        for line in em_section.split('\n'):
            line_s = line.strip()
            if line_s.startswith(('•', '●')):
                clean = line_s.lstrip('•●– ').strip()
                if clean and len(clean) > 5:
                    emerging.append(clean)

    return _finalize(domains), emerging


def parse_ustecky(text):
    """Three-tier structure: Hlavní, KETs, Subdomény. Bullets •. No NACE."""
    section, _ = find_section(text,
        ['Tematické priority:'],
        ['Realizace krajské', 'Realizace Krajské', 'Instituce s hlavní'])
    if not section:
        return [], []

    lines = section.split('\n')
    domains = []
    current_tier = None
    current = None

    tier_headers = {
        'Hlavní oblasti specializace': 'hlavní',
        'KETs (průřezové)': 'KETs',
        'Užší subdomény': 'subdomény',
    }

    for line in lines:
        line_s = line.strip()
        if not line_s or is_page_marker(line):
            continue
        if line_s.startswith('Tematické priority'):
            continue

        # Detect tier
        for header, tier in tier_headers.items():
            if header in line_s:
                current_tier = tier
                break

        if line_s.startswith(('•', '●')):
            clean = line_s.lstrip('•●–- ').strip()
            if '–' in clean:
                parts = clean.split('–', 1)
                name = parts[0].strip()
                desc = parts[1].strip()
            elif '−' in clean:
                parts = clean.split('−', 1)
                name = parts[0].strip()
                desc = parts[1].strip()
            else:
                name = clean
                desc = ''
            if name and len(name) > 3:
                domains.append({
                    'nazev': clean_domain_name(name),
                    'desc_lines': [desc] if desc else [],
                    'nace': [],
                    'tier': current_tier,
                })

    return _finalize(domains), []


def parse_vysocina(text):
    """Plain headers, bullets • with inline NACE '(NACE NN)' (no CZ- prefix)."""
    section, _ = find_section(text,
        ['Domény specializace Kraje Vysočina'],
        ['Vznikající', 'Emerging', 'Realizace krajské'])
    if not section:
        return [], []

    lines = section.split('\n')
    domains = []
    current = None

    for line in lines:
        line_s = line.strip()
        if not line_s or is_page_marker(line):
            continue
        if line_s.startswith('Domény specializace'):
            continue

        if line_s.startswith(('•', '●', '–')) and current:
            clean = line_s.lstrip('•●–- ').strip()
            # Extract inline NACE codes
            nace_matches = re.findall(r'\((?:CZ-)?NACE\s+([\d,. a]+)\)', clean)
            for m in nace_matches:
                current['nace'].extend(extract_nace_codes(m))
            # Remove NACE references from description
            clean_desc = re.sub(r'\((?:CZ-)?NACE[^)]+\)', '', clean).strip()
            if clean_desc:
                current['desc_lines'].append(clean_desc)
        elif not line_s.startswith(('•', '●')) and 10 < len(line_s) < 80 and line_s[0].isupper():
            if current and (current['desc_lines'] or current['nace']):
                domains.append(current)
            current = {'nazev': clean_domain_name(line_s), 'desc_lines': [], 'nace': []}
        elif current:
            # Continuation line — also check for NACE codes
            nace_matches = re.findall(r'\((?:CZ-)?NACE\s+([\d,. a]+)\)', line_s)
            for m in nace_matches:
                current['nace'].extend(extract_nace_codes(m))
            clean_desc = re.sub(r'\((?:CZ-)?NACE[^)]+\)', '', line_s).strip()
            if clean_desc:
                current['desc_lines'].append(clean_desc)

    if current and (current['desc_lines'] or current['nace']):
        domains.append(current)

    # Emerging
    emerging = []
    em_section, _ = find_section(text,
        ['Vznikající', 'Emerging'],
        ['Realizace krajské', 'Realizace Krajské'])
    if em_section:
        for line in em_section.split('\n'):
            line_s = line.strip()
            if len(line_s) > 10 and not line_s.startswith(('Vznikající', 'Emerging')) and not is_page_marker(line):
                emerging.append(line_s)

    return _finalize(domains), emerging


def parse_zlinsky(text):
    """Two domain sets: horizontal (under Strategická orientace) and vertical (under Tematické priority).
    Vertical grouped in 3 tiers 1) 2) 3). No NACE."""

    # Vertical (application) domains — under Tematické priority
    v_section, _ = find_section(text,
        ['Odvětvové (aplikační) domény', 'Tematické priority:'],
        ['Vznikající', 'Emerging', 'Realizace krajské'])
    if not v_section:
        return [], []

    lines = v_section.split('\n')
    domains = []
    current = None
    current_tier = None

    for line in lines:
        line_s = line.strip()
        if not line_s or is_page_marker(line):
            continue
        if any(skip in line_s for skip in ['Odvětvové (aplikační)', 'Tematické priority']):
            continue

        # Tier headers: 1) ... 2) ... 3) ...
        tier_match = re.match(r'^(\d)\)\s+(.+)', line_s)
        if tier_match:
            current_tier = tier_match.group(2)[:50]
            continue

        if line_s.startswith(('•', '●', '–')) and current:
            clean = line_s.lstrip('•●–- ').strip()
            if clean:
                current['desc_lines'].append(clean)
        elif not line_s.startswith(('•', '●')) and 10 < len(line_s) < 100 and line_s[0].isupper():
            # Check it's not a tier description continuation
            if any(skip in line_s.lower() for skip in ['odvetví', 'odvetvích', 'jsou přitom', 'tato odvětvová']):
                if current:
                    current['desc_lines'].append(line_s)
                continue
            if current and (current['desc_lines']):
                domains.append(current)
            current = {'nazev': clean_domain_name(line_s), 'desc_lines': [], 'nace': [], 'tier': current_tier}
        elif current:
            current['desc_lines'].append(line_s)

    if current and current['desc_lines']:
        domains.append(current)

    # Also get horizontal domains from Strategická orientace section
    h_section_start = text.find('Horizontální průřezové domény')
    if h_section_start < 0:
        h_section_start = text.find('horizontální průřezové domény')
    if h_section_start >= 0:
        # End before "Opatření" or "Mezinárodní" or "Tematické priority"
        h_end = len(text)
        for marker in ['Opatření pro průmyslovou', 'Mezinárodní aktivity', 'Tematické priority']:
            idx = text.find(marker, h_section_start + 20)
            if idx >= 0 and idx < h_end:
                h_end = idx
        h_section = text[h_section_start:h_end]
        h_current = None
        h_domains = []
        for line in h_section.split('\n'):
            line_s = line.strip()
            if not line_s or is_page_marker(line):
                continue
            if 'Horizontální' in line_s:
                continue

            if line_s.startswith(('•', '●', '–')) and h_current:
                clean = line_s.lstrip('•●–- ').strip()
                if clean:
                    h_current['desc_lines'].append(clean)
            elif not line_s.startswith(('•', '●')) and 10 < len(line_s) < 80 and line_s[0].isupper():
                if h_current and h_current['desc_lines']:
                    h_domains.append(h_current)
                h_current = {'nazev': clean_domain_name(line_s), 'desc_lines': [], 'nace': [], 'tier': 'horizontální'}
            elif h_current:
                h_current['desc_lines'].append(line_s)
        if h_current and h_current['desc_lines']:
            h_domains.append(h_current)
        # Insert horizontal domains at the beginning
        domains = h_domains + domains

    # Emerging
    emerging = []
    em_section, _ = find_section(text,
        ['Vznikající', 'Emerging'],
        ['Realizace krajské', 'Realizace Krajské'])
    if em_section:
        for line in em_section.split('\n'):
            line_s = line.strip()
            if len(line_s) > 10 and not line_s.startswith(('Vznikající', 'Emerging')) and not is_page_marker(line):
                emerging.append(line_s)

    return _finalize(domains), emerging


# ── Finalization ─────────────────────────────────────────────────────────────

def _finalize(domains):
    """Convert raw domain dicts to final format."""
    result = []
    for d in domains:
        nazev = d['nazev']
        if len(nazev) < 4 or nazev.startswith('Zaměření'):
            continue
        popis = ' '.join(d['desc_lines']).strip()
        # Clean up description
        popis = re.sub(r'\s+', ' ', popis)
        nace = list(dict.fromkeys(d['nace']))  # Deduplicate
        text_pro_embedding = f"{nazev}: {popis}" if popis else nazev
        entry = {
            'nazev': nazev,
            'popis': popis,
            'nace': nace,
            'text_pro_embedding': text_pro_embedding,
        }
        if 'tier' in d and d['tier']:
            entry['tier'] = d['tier']
        result.append(entry)
    return result


# ── Dispatch and run ─────────────────────────────────────────────────────────

PARSERS = {
    'Jihočeský kraj': parse_jihocesky,
    'Jihomoravský kraj': parse_jihomoravsky,
    'Karlovarský kraj': parse_karlovarsky,
    'Královéhradecký kraj': parse_kralovehradecky,
    'Liberecký kraj': parse_liberecky,
    'Moravskoslezský kraj': parse_moravskoslezsky,
    'Olomoucký kraj': parse_olomoucky,
    'Pardubický kraj': parse_pardubicky,
    'Plzeňský kraj': parse_plzensky,
    'Hl. m. Praha': parse_praha,
    'Středočeský kraj': parse_stredocesky,
    'Ústecký kraj': parse_ustecky,
    'Vysočina': parse_vysocina,
    'Zlínský kraj': parse_zlinsky,
}

result = {}
all_emerging = {}
total_domains = 0
total_emerging = 0

print("=" * 80)
print("PARSING DOMAINS FROM PŘÍLOHA 2 NRIS3 v08")
print("=" * 80)

for kraj_name in PARSERS:
    text = kraj_texts.get(kraj_name, '')
    if not text:
        print(f"\n  WARNING: No text found for {kraj_name}")
        continue

    parser = PARSERS[kraj_name]
    domains, emerging = parser(text)

    result[kraj_name] = domains
    all_emerging[kraj_name] = emerging
    total_domains += len(domains)
    total_emerging += len(emerging)

    nace_count = sum(1 for d in domains if d['nace'])
    avg_desc = sum(len(d['popis']) for d in domains) / max(1, len(domains))
    print(f"\n  {kraj_name:25s}: {len(domains):2d} domén, {nace_count} s NACE, prům. popis {avg_desc:.0f} znaků")
    for d in domains:
        tier_str = f" [{d['tier']}]" if 'tier' in d else ''
        print(f"    - {d['nazev'][:60]:60s} [{len(d['nace']):2d} NACE, {len(d['popis']):5d} zn.]{tier_str}")
    if emerging:
        print(f"    Emerging ({len(emerging)}):")
        for e in emerging[:3]:
            print(f"      + {e[:70]}")

# Save main output
out_path = 'C:/Users/meisl/Downloads/Seminář CzechInvest pro RIS3 Analytiky/seminar_code_viz/ris3-mapa-cr/public/data/domeny_plne_texty.json'
# Convert list format to dict-of-dict format matching existing structure
output = {}
for kraj_name, domains in result.items():
    kraj_dict = {}
    for i, d in enumerate(domains):
        kraj_dict[str(i)] = d
    output[kraj_name] = kraj_dict

with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

# Also save domeny_kraje.json update
kraje_out = {
    'meta': {
        'zdroj': 'Příloha 2 NRIS3 v08 (MPO, prosinec 2025)',
        'parser': 'parse_pdf_v2.py',
        'poznamka': 'Extrahováno z PDF automatickým parserem. NACE kódy pouze tam, kde jsou v dokumentu explicitně uvedeny.'
    },
    'kraje': {},
    'statistika': {}
}
for kraj_name, domains in result.items():
    kraje_out['kraje'][kraj_name] = {
        'domeny': [
            {
                'nazev': d['nazev'],
                'popis': d['popis'][:200] if d['popis'] else '',
                'cz_nace': d['nace'],
            }
            for d in domains
        ],
        'emerging': all_emerging.get(kraj_name, []),
    }
    kraje_out['statistika'][kraj_name] = {
        'pocet_domen': len(domains),
        'pocet_s_nace': sum(1 for d in domains if d['nace']),
        'prumerna_delka_popisu': round(sum(len(d['popis']) for d in domains) / max(1, len(domains))),
    }

kraje_out_path = 'C:/Users/meisl/Downloads/Seminář CzechInvest pro RIS3 Analytiky/seminar_code_viz/ris3-mapa-cr/public/data/domeny_kraje.json'
with open(kraje_out_path, 'w', encoding='utf-8') as f:
    json.dump(kraje_out, f, ensure_ascii=False, indent=2)

print(f"\n{'=' * 80}")
print(f"HOTOVO: {total_domains} domén + {total_emerging} emerging položek")
print(f"Uloženo: {out_path}")
print(f"Uloženo: {kraje_out_path}")
