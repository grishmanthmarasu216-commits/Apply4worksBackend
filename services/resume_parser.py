"""
resume_parser.py V2
Enhanced 4-stage pipeline:
  Stage 1: Text extraction (PyMuPDF / python-docx / OCR fallback)
  Stage 2: Section boundary detection
  Stage 3: spaCy NER extraction
  Stage 4: Structured parsing with confidence scoring

Output: JSON to stdout matching V2 resumeData schema.
Usage: python resume_parser.py <file_path>
"""

import sys
import json
import re
import os
from typing import Dict, List, Any, Optional

# ── NLP Setup ────────────────────────────────────────────────────────────────
try:
    import spacy
    nlp = spacy.load("en_core_web_sm")
except Exception:
    nlp = None

# ── STAGE 1: Text Extraction ─────────────────────────────────────────────────

def extract_text_pdf(file_path: str) -> str:
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(file_path)
        pages = []
        for page in doc:
            pages.append(page.get_text("text"))
        return "\n".join(pages)
    except Exception as e:
        return ""

def extract_text_docx(file_path: str) -> str:
    try:
        import docx
        doc = docx.Document(file_path)
        lines = []
        for para in doc.paragraphs:
            if para.text.strip():
                lines.append(para.text)
        return "\n".join(lines)
    except Exception as e:
        return ""

def extract_text_ocr(file_path: str) -> str:
    """Tesseract OCR fallback for scanned PDFs."""
    try:
        from pdf2image import convert_from_path
        import pytesseract
        images = convert_from_path(file_path)
        return "\n".join(pytesseract.image_to_string(img) for img in images)
    except Exception:
        return ""

def extract_text(file_path: str) -> str:
    ext = os.path.splitext(file_path)[1].lower()
    text = ""
    if ext == ".pdf":
        text = extract_text_pdf(file_path)
        if not text.strip():
            text = extract_text_ocr(file_path)
    elif ext in (".docx", ".doc"):
        text = extract_text_docx(file_path)
    return text

# ── STAGE 2: Section Boundary Detection ─────────────────────────────────────

SECTION_PATTERNS = {
    "summary":        r"(?i)^(summary|profile|about\s+me|objective|professional\s+summary|career\s+objective|personal\s+statement)\s*$",
    "experience":     r"(?i)^(experience|work\s+history|employment|professional\s+experience|work\s+experience|employment\s+history|career\s+history)\s*$",
    "education":      r"(?i)^(education|academic|qualification|degree|educational\s+background|academic\s+background)\s*$",
    "skills":         r"(?i)^(skills|technical\s+skills|competencies|expertise|core\s+competencies|key\s+skills|technologies|tech\s+stack)\s*$",
    "projects":       r"(?i)^(projects|personal\s+projects|academic\s+projects|side\s+projects|portfolio|key\s+projects)\s*$",
    "certifications": r"(?i)^(certifications?|credentials?|licenses?|certificates?|professional\s+certifications?)\s*$",
    "achievements":   r"(?i)^(achievements?|awards?|honors?|accomplishments?|recognition)\s*$",
    "languages":      r"(?i)^(languages?|spoken\s+languages?)\s*$",
}

def identify_sections(text: str) -> Dict[str, str]:
    sections = {k: "" for k in ["personalInfo", "summary", "experience", "education",
                                  "skills", "projects", "certifications", "achievements", "languages"]}
    lines = text.split("\n")
    current = "personalInfo"

    for line in lines:
        stripped = line.strip()
        if not stripped:
            sections[current] += "\n"
            continue

        matched = False
        # Only check short lines as potential headers (avoid matching content)
        if len(stripped) <= 60 and len(stripped.split()) <= 6:
            for section, pattern in SECTION_PATTERNS.items():
                if re.match(pattern, stripped):
                    current = section
                    matched = True
                    break

        if not matched:
            sections[current] += stripped + "\n"

    return sections

# ── STAGE 3: NER Extraction ───────────────────────────────────────────────────

def extract_personal_info(text: str, raw_text: str) -> Dict[str, str]:
    info = {
        "name": "", "email": "", "phone": "",
        "location": "", "linkedin": "", "github": "", "portfolio": ""
    }

    # Email
    email_match = re.search(r"[\w.%+\-]+@[\w.\-]+\.[a-zA-Z]{2,}", raw_text)
    if email_match:
        info["email"] = email_match.group(0).lower()

    # Phone — handle international formats
    phone_match = re.search(r"(\+?[\d\s\-().]{10,17})", raw_text)
    if phone_match:
        candidate = phone_match.group(0).strip()
        # Ensure it has enough digits to be a real phone number
        digits = re.sub(r"\D", "", candidate)
        if 7 <= len(digits) <= 15:
            info["phone"] = candidate

    # LinkedIn
    linkedin_match = re.search(
        r"(?:https?://)?(?:www\.)?linkedin\.com/in/[\w\-]+",
        raw_text, re.IGNORECASE
    )
    if linkedin_match:
        info["linkedin"] = linkedin_match.group(0)

    # GitHub
    github_match = re.search(
        r"(?:https?://)?(?:www\.)?github\.com/[\w\-]+",
        raw_text, re.IGNORECASE
    )
    if github_match:
        info["github"] = github_match.group(0)

    # Portfolio / website
    portfolio_match = re.search(
        r"(?:https?://)?(?:www\.)?(?!linkedin|github)[\w\-]+\.\w{2,}(?:/[\w\-./]*)?",
        raw_text, re.IGNORECASE
    )
    if portfolio_match:
        url = portfolio_match.group(0)
        if "linkedin" not in url.lower() and "github" not in url.lower():
            info["portfolio"] = url

    # Location — look for City, State / City, Country pattern
    location_match = re.search(
        r"\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)*),\s*([A-Z]{2}|[A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\b",
        raw_text
    )
    if location_match:
        info["location"] = location_match.group(0)

    # Name extraction
    info["name"] = extract_name(text, raw_text)

    return info

def extract_name(section_text: str, raw_text: str) -> str:
    """Extract candidate name using spaCy NER or heuristics."""
    lines = raw_text.split("\n")[:10]  # Name is always near the top

    # Strategy 1: spaCy PERSON entity
    if nlp:
        for line in lines[:6]:
            stripped = line.strip()
            if not stripped or "@" in stripped or "http" in stripped:
                continue
            doc = nlp(stripped)
            persons = [ent.text for ent in doc.ents if ent.label_ == "PERSON"]
            if persons and len(persons[0].split()) >= 2:
                return persons[0].strip()

    # Strategy 2: Heuristic — first non-URL, non-email, multi-word uppercase line
    for line in lines[:8]:
        stripped = line.strip()
        if not stripped:
            continue
        if "@" in stripped or "http" in stripped.lower() or re.search(r"\d{3,}", stripped):
            continue
        words = stripped.split()
        if 2 <= len(words) <= 4:
            # Check if it looks like a name (title-cased or all-caps)
            if all(w[0].isupper() or w.isupper() for w in words if len(w) > 1):
                return stripped.title() if stripped.isupper() else stripped

    return ""

# ── Experience & Projects Parsing ────────────────────────────────────────────

DATE_PATTERN = re.compile(
    r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|"
    r"June|July|August|September|October|November|December)[\s,]*(\d{4})"
    r"|(\d{4})\s*[-–—]\s*(\d{4}|Present|Current|Now)",
    re.IGNORECASE
)

def parse_experience(text: str) -> List[Dict]:
    """Parse experience entries from section text."""
    entries = []
    if not text.strip():
        return entries

    lines = [l.strip() for l in text.split("\n") if l.strip()]
    current: Optional[Dict] = None

    for line in lines:
        has_date = bool(DATE_PATTERN.search(line))

        if has_date and len(line.split()) <= 15:
            # This looks like a role/company/date header line
            if current:
                entries.append(current)

            date_match = DATE_PATTERN.search(line)
            date_str = date_match.group(0) if date_match else ""
            title_part = line[:date_match.start()].strip() if date_match else line

            current = {
                "company": "",
                "role": title_part,
                "location": "",
                "startDate": "",
                "endDate": "",
                "isCurrent": bool(re.search(r"present|current|now", date_str, re.IGNORECASE)),
                "responsibilities": [],
            }

            # Try to split "Role at Company"
            if " at " in title_part.lower():
                parts = re.split(r"\s+at\s+", title_part, maxsplit=1, flags=re.IGNORECASE)
                current["role"] = parts[0].strip()
                current["company"] = parts[1].strip() if len(parts) > 1 else ""
            elif "|" in title_part:
                parts = title_part.split("|")
                current["role"] = parts[0].strip()
                current["company"] = parts[1].strip() if len(parts) > 1 else ""

            # Extract dates
            months_re = r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December)[\s,]*(\d{4})"
            year_range_re = r"(\d{4})\s*[-–—]\s*(\d{4}|Present|Current|Now)"
            date_range = re.search(year_range_re, date_str, re.IGNORECASE)
            if date_range:
                current["startDate"] = date_range.group(1)
                end = date_range.group(2)
                current["endDate"] = "" if re.match(r"present|current|now", end, re.IGNORECASE) else end
            else:
                months = re.findall(months_re, date_str, re.IGNORECASE)
                if len(months) >= 2:
                    current["startDate"] = f"{months[0][0]} {months[0][1]}"
                    current["endDate"] = f"{months[1][0]} {months[1][1]}"
                elif len(months) == 1:
                    current["startDate"] = f"{months[0][0]} {months[0][1]}"

        elif current is not None:
            # This is a responsibility/bullet line
            clean = re.sub(r"^[-•*➤▶→>]\s*", "", line).strip()
            if clean and len(clean) > 5:
                current["responsibilities"].append(clean)
        else:
            # No current entry yet — may be a company name or stray line
            if len(line.split()) <= 6 and not line.endswith("."):
                current = {
                    "company": line,
                    "role": "",
                    "location": "",
                    "startDate": "",
                    "endDate": "",
                    "isCurrent": False,
                    "responsibilities": [],
                }

    if current:
        entries.append(current)

    return entries

def parse_projects(text: str) -> List[Dict]:
    """Parse project entries from section text."""
    entries = []
    if not text.strip():
        return entries

    lines = [l.strip() for l in text.split("\n") if l.strip()]
    current: Optional[Dict] = None

    for line in lines:
        # Detect a project header: short line, often title-cased or followed by tech
        is_header = (
            len(line.split()) <= 8
            and not line.startswith(("-", "•", "*", "➤"))
            and len(line) < 80
            and (line[0].isupper() if line else False)
            and not DATE_PATTERN.search(line)
        )

        # Lines with "tech:" or "technologies:" are tech stacks
        tech_match = re.match(r"(?:tech(?:nologies)?|stack|tools?)[:\-]\s*(.+)", line, re.IGNORECASE)
        github_match = re.search(r"github\.com/[\w\-/]+", line, re.IGNORECASE)
        link_match = re.search(r"https?://[\S]+", line, re.IGNORECASE)

        if is_header and not tech_match:
            if current:
                entries.append(current)
            current = {
                "name": line,
                "description": "",
                "technologies": [],
                "github": "",
                "liveLink": "",
            }
        elif current is not None:
            if tech_match:
                techs = [t.strip() for t in re.split(r"[,|]", tech_match.group(1)) if t.strip()]
                current["technologies"].extend(techs)
            elif github_match:
                current["github"] = github_match.group(0)
            elif link_match and "github" not in link_match.group(0).lower():
                current["liveLink"] = link_match.group(0)
            else:
                clean = re.sub(r"^[-•*]\s*", "", line).strip()
                if clean:
                    current["description"] += clean + " "

    if current:
        if current.get("description"):
            current["description"] = current["description"].strip()
        entries.append(current)

    return entries

def parse_education(text: str) -> List[Dict]:
    """Parse education entries from section text."""
    entries = []
    if not text.strip():
        return entries

    lines = [l.strip() for l in text.split("\n") if l.strip()]
    current: Optional[Dict] = None

    DEGREE_KEYWORDS = ["bachelor", "master", "phd", "doctorate", "b.s.", "m.s.", "b.e.",
                       "b.tech", "m.tech", "mba", "b.sc", "m.sc", "associate", "diploma"]
    INSTITUTION_KEYWORDS = ["university", "college", "institute", "school", "academy"]

    for line in lines:
        line_lower = line.lower()
        is_degree = any(k in line_lower for k in DEGREE_KEYWORDS)
        is_institution = any(k in line_lower for k in INSTITUTION_KEYWORDS)
        has_date = bool(DATE_PATTERN.search(line))

        if is_institution or is_degree or has_date:
            if not current:
                current = {
                    "institution": "",
                    "degree": "",
                    "field": "",
                    "startDate": "",
                    "endDate": "",
                    "gpa": "",
                }

            if is_institution:
                current["institution"] = line
            elif is_degree:
                # Try to split "B.S. Computer Science"
                for kw in DEGREE_KEYWORDS:
                    if kw in line_lower:
                        idx = line_lower.index(kw)
                        current["degree"] = line[:idx + len(kw)].strip().rstrip(",")
                        remainder = line[idx + len(kw):].strip().lstrip(",").strip()
                        if remainder and not DATE_PATTERN.search(remainder):
                            current["field"] = remainder
                        break

            if has_date:
                date_match = re.search(r"(\d{4})\s*[-–—]\s*(\d{4}|Present|Current)", line, re.IGNORECASE)
                if date_match:
                    current["startDate"] = date_match.group(1)
                    end = date_match.group(2)
                    current["endDate"] = "" if re.match(r"present|current", end, re.IGNORECASE) else end
                else:
                    year_match = re.search(r"\d{4}", line)
                    if year_match:
                        current["endDate"] = year_match.group(0)

            # GPA
            gpa_match = re.search(r"(?:gpa|cgpa|grade)[\s:]*([0-9.]+)", line, re.IGNORECASE)
            if gpa_match:
                current["gpa"] = gpa_match.group(1)

        elif current and line:
            # Could be a continuation — append to field if it looks like a subject
            if not current["field"] and len(line.split()) <= 5:
                current["field"] = line

    if current and (current["institution"] or current["degree"]):
        entries.append(current)

    return entries

def parse_skills(text: str) -> Dict[str, List[str]]:
    """Parse skills into categories."""
    if not text.strip():
        return {}

    # Split on common delimiters
    raw_skills = re.split(r"[,|•\n]+", text)
    skills = []
    for s in raw_skills:
        clean = re.sub(r"^[-•*➤▶→>]\s*", "", s.strip())
        # Filter out section sub-headers (e.g., "Programming Languages:")
        colon_split = clean.split(":")
        if len(colon_split) == 2:
            # "Programming Languages: Python, Java" — extract after colon
            sub_skills = re.split(r"[,|]+", colon_split[1])
            skills.extend([ss.strip() for ss in sub_skills if ss.strip() and len(ss.strip()) < 30])
        elif clean and len(clean) < 40:
            skills.append(clean)

    # Remove duplicates, preserve order
    seen = set()
    unique_skills = []
    for s in skills:
        lower = s.lower()
        if lower not in seen and len(lower) > 1:
            seen.add(lower)
            unique_skills.append(s)

    return unique_skills  # Return flat list; categorization happens in Node.js

def parse_certifications(text: str) -> List[str]:
    items = []
    for line in text.split("\n"):
        clean = re.sub(r"^[-•*➤▶→>]\s*", "", line.strip())
        if clean and len(clean) > 3 and len(clean) < 200:
            items.append(clean)
    return items

def parse_languages(text: str) -> List[Dict]:
    items = []
    for line in text.split("\n"):
        clean = re.sub(r"^[-•*]\s*", "", line.strip())
        if not clean or len(clean) > 100:
            continue
        # Try to split "English - Native" or "English (Fluent)"
        match = re.match(r"([A-Za-z\s]+)[\-–:()]+\s*(.+)", clean)
        if match:
            items.append({"language": match.group(1).strip(), "proficiency": match.group(2).strip()})
        elif clean:
            items.append({"language": clean, "proficiency": ""})
    return items

# ── STAGE 4: Confidence Scoring ───────────────────────────────────────────────

def calculate_confidence(data: Dict) -> Dict[str, float]:
    pi = data.get("personalInfo", {})
    personal_score = 0
    if pi.get("name"): personal_score += 40
    if pi.get("email"): personal_score += 30
    if pi.get("phone"): personal_score += 30

    skills = data.get("skills", [])
    skill_score = 100 if len(skills) >= 5 else (50 if len(skills) > 0 else 0)

    exp = data.get("experience", [])
    exp_score = 0
    if exp:
        complete = sum(1 for e in exp if e.get("role") and (e.get("startDate") or e.get("endDate")))
        exp_score = 100 if complete == len(exp) else (50 if complete > 0 else 20)

    edu = data.get("education", [])
    edu_score = 100 if (edu and (edu[0].get("institution") or edu[0].get("degree"))) else 0

    proj = data.get("projects", [])
    proj_score = 100 if proj else 0

    overall = round(
        0.30 * personal_score +
        0.20 * skill_score    +
        0.30 * exp_score      +
        0.20 * edu_score,
        1
    )

    return {
        "personalInfo":   personal_score,
        "skills":         skill_score,
        "experience":     exp_score,
        "education":      edu_score,
        "projects":       proj_score,
        "overall":        overall,
    }

# ── STAGE 4: Gemini AI Normalization ─────────────────────────────────────────

GEMINI_NORMALIZE_PROMPT = """You are a resume data extraction expert. Extract structured information from this resume text and return ONLY valid JSON with no explanation.

Return exactly this JSON structure (use empty string "" for missing fields, empty [] for missing arrays):
{{
  "personalInfo": {{
    "name": "",
    "email": "",
    "phone": "",
    "location": "",
    "linkedin": "",
    "github": "",
    "portfolio": ""
  }},
  "summary": "",
  "skills": ["skill1", "skill2"],
  "experience": [
    {{
      "company": "",
      "role": "",
      "location": "",
      "startDate": "",
      "endDate": "",
      "isCurrent": false,
      "responsibilities": ["bullet 1", "bullet 2"]
    }}
  ],
  "projects": [
    {{
      "name": "",
      "description": "",
      "technologies": ["tech1"],
      "github": "",
      "liveLink": ""
    }}
  ],
  "education": [
    {{
      "institution": "",
      "degree": "",
      "field": "",
      "startDate": "",
      "endDate": "",
      "gpa": ""
    }}
  ],
  "certifications": ["cert1"],
  "achievements": ["achievement1"],
  "languages": [
    {{"language": "", "proficiency": ""}}
  ]
}}

CRITICAL RULES:
1. NEVER invent information not present in the resume.
2. Leave fields blank ("" or []) if the information is not found.
3. For skills, extract ALL mentioned technologies, tools, and frameworks.
4. For experience responsibilities, keep each bullet to 1 sentence max.
5. Return ONLY the JSON — no markdown fences, no explanation.

Resume text:
{raw_text}"""


def normalize_with_gemini(raw_text: str) -> Optional[Dict]:
    """Use Gemini to normalize resume when regex parsing is insufficient."""
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        return None

    try:
        import urllib.request
        import urllib.error

        prompt = GEMINI_NORMALIZE_PROMPT.format(raw_text=raw_text[:8000])
        payload = json.dumps({
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.1,
                "maxOutputTokens": 4096,
            }
        }).encode("utf-8")

        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
        req = urllib.request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST"
        )

        with urllib.request.urlopen(req, timeout=25) as resp:
            result = json.loads(resp.read().decode("utf-8"))

        text = result["candidates"][0]["content"]["parts"][0]["text"].strip()

        # Strip markdown fences if present
        text = re.sub(r"^```(?:json)?\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
        text = text.strip()

        return json.loads(text)

    except Exception as e:
        import sys
        print(f"[Gemini] Normalization failed: {e}", file=sys.stderr)
        return None


def merge_with_gemini(structured: Dict, gemini: Dict) -> Dict:
    """Fill gaps in structured data using Gemini output — never overwrite good data."""
    merged = dict(structured)

    pi = merged.get("personalInfo", {})
    gpi = gemini.get("personalInfo", {})
    for key in ["name", "email", "phone", "location", "linkedin", "github", "portfolio"]:
        if not pi.get(key) and gpi.get(key):
            pi[key] = gpi[key]
    merged["personalInfo"] = pi

    if not merged.get("summary") and gemini.get("summary"):
        merged["summary"] = gemini["summary"]

    if not merged.get("skills") and gemini.get("skills"):
        merged["skills"] = gemini["skills"]

    if not merged.get("experience") and gemini.get("experience"):
        merged["experience"] = gemini["experience"]

    if not merged.get("projects") and gemini.get("projects"):
        merged["projects"] = gemini["projects"]

    if not merged.get("education") and gemini.get("education"):
        merged["education"] = gemini["education"]

    if not merged.get("certifications") and gemini.get("certifications"):
        merged["certifications"] = gemini["certifications"]

    if not merged.get("achievements") and gemini.get("achievements"):
        merged["achievements"] = gemini["achievements"]

    if not merged.get("languages") and gemini.get("languages"):
        merged["languages"] = gemini["languages"]

    return merged


# ── Field-Level Confidence (per-field scores) ────────────────────────────────

def calculate_field_confidence(data: Dict) -> Dict:
    """Calculate per-field confidence scores (0–100) for UI display."""
    pi = data.get("personalInfo", {})
    skills = data.get("skills", [])
    experience = data.get("experience", [])
    education = data.get("education", [])
    projects = data.get("projects", [])

    return {
        "name":        {"value": pi.get("name", ""),        "confidence": 0.95 if pi.get("name") else 0.0},
        "email":       {"value": pi.get("email", ""),       "confidence": 0.99 if pi.get("email") else 0.0},
        "phone":       {"value": pi.get("phone", ""),       "confidence": 0.90 if pi.get("phone") else 0.0},
        "location":    {"value": pi.get("location", ""),    "confidence": 0.75 if pi.get("location") else 0.0},
        "linkedin":    {"value": pi.get("linkedin", ""),    "confidence": 0.98 if pi.get("linkedin") else 0.0},
        "github":      {"value": pi.get("github", ""),      "confidence": 0.98 if pi.get("github") else 0.0},
        "portfolio":   {"value": pi.get("portfolio", ""),   "confidence": 0.85 if pi.get("portfolio") else 0.0},
        "summary":     {"value": data.get("summary", "")[:80], "confidence": 0.80 if data.get("summary") else 0.0},
        "skills":      {"count": len(skills),               "confidence": min(1.0, len(skills) / 10)},
        "experience":  {"count": len(experience),           "confidence": 0.85 if experience else 0.0},
        "education":   {"count": len(education),            "confidence": 0.88 if education else 0.0},
        "projects":    {"count": len(projects),             "confidence": 0.80 if projects else 0.0},
    }


# ── Main Pipeline ─────────────────────────────────────────────────────────────

def parse_resume(file_path: str) -> Dict:
    # Stage 1: Extract text
    raw_text = extract_text(file_path)
    if not raw_text.strip():
        return {"success": False, "error": "Could not extract text from file."}

    # Stage 2: Identify sections
    sections = identify_sections(raw_text)

    # Stage 3: NER + structured extraction
    personal_info = extract_personal_info(sections["personalInfo"], raw_text)
    skills_list   = parse_skills(sections["skills"])
    experience    = parse_experience(sections["experience"])
    projects      = parse_projects(sections["projects"])
    education     = parse_education(sections["education"])
    certs         = parse_certifications(sections["certifications"])
    achievements  = parse_certifications(sections["achievements"])
    languages     = parse_languages(sections["languages"])
    summary       = sections["summary"].strip()

    structured = {
        "personalInfo":   personal_info,
        "summary":        summary,
        "skills":         skills_list,
        "experience":     experience,
        "projects":       projects,
        "education":      education,
        "certifications": certs,
        "achievements":   achievements,
        "languages":      languages,
        "rawText":        raw_text[:5000],
    }

    confidence_scores = calculate_confidence(structured)

    # Stage 4: Gemini normalization — kick in when confidence is low or key fields missing
    used_gemini = False
    if (confidence_scores.get("overall", 0) < 60
            or not personal_info.get("name")
            or not personal_info.get("email")
            or not experience):
        gemini_data = normalize_with_gemini(raw_text)
        if gemini_data:
            structured = merge_with_gemini(structured, gemini_data)
            # Recalculate confidence after merge
            confidence_scores = calculate_confidence(structured)
            used_gemini = True

    # Stage 5: Field-level confidence for UI display
    field_confidence = calculate_field_confidence(structured)

    return {
        "success":         True,
        "data":            structured,
        "confidence":      confidence_scores,
        "fieldConfidence": field_confidence,
        "usedGemini":      used_gemini,
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No file path provided."}))
        sys.exit(1)

    file_path = sys.argv[1]
    if not os.path.exists(file_path):
        print(json.dumps({"success": False, "error": f"File not found: {file_path}"}))
        sys.exit(1)

    try:
        result = parse_resume(file_path)
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(0 if result.get("success") else 1)
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)

