"""STS GeoFlow - AS 1726:2017 soil description engine (backend mirror of sts_soillog_engine.js).
Produces byte-identical descriptions to the frontend so PDF/XLSX/report output matches the UI."""
import re

COHESIVE = {"CLAY", "SILT", "ORGANIC SOIL", "PEAT"}
GRANULAR = {"SAND", "GRAVEL", "COBBLES", "BOULDERS"}
ADJ_ORDER = ["clayey", "silty", "sandy", "gravelly"]
GRAPHIC_SYMBOL = {
    "FILL": "fill", "TOPSOIL": "topsoil", "CLAY": "clay", "SILT": "silt", "SAND": "sand",
    "GRAVEL": "gravel", "COBBLES": "cobbles", "BOULDERS": "boulders",
    "ORGANIC SOIL": "organic", "PEAT": "peat", "WEATHERED ROCK": "weathered_rock",
}
_ROCK_RE = re.compile(r"STONE|SHALE|BASALT|TUFF|LAMINITE|CONGLOMERATE|BRECCIA|BEDROCK|COAL|QUARTZITE|GRANITE|DOLERITE|WEATHERED ROCK|Formation|Group", re.I)


def _clean(s):
    return re.sub(r"\s+", " ", "" if s is None else str(s)).strip()


def is_cohesive(m): return (m or "").upper() in COHESIVE
def is_granular(m): return (m or "").upper() in GRANULAR
def is_rock_material(m): return bool(_ROCK_RE.search(m or ""))


def graphic_symbol_for(material):
    m = _clean(material)
    if not m:
        return "none"
    up = m.upper()
    if up in GRAPHIC_SYMBOL:
        return GRAPHIC_SYMBOL[up]
    if is_rock_material(m):
        return "weathered_rock"
    for frac, sym in (("CLAY", "clay"), ("SILT", "silt"), ("SAND", "sand"), ("GRAVEL", "gravel"), ("FILL", "fill")):
        if re.search(frac, m, re.I):
            return sym
    return "soil"


def _dedupe(items):
    seen, out = set(), []
    for x in items:
        k = x.lower()
        if k not in seen:
            seen.add(k)
            out.append(x)
    return out


def _ordered_secondary(lst):
    seen, out = set(), []
    for x in (lst or []):
        x = _clean(x).lower()
        if x and x not in seen:
            seen.add(x)
            out.append(x)
    out.sort(key=lambda a: ADJ_ORDER.index(a) if a in ADJ_ORDER else 99)
    return out


def _colour_phrase(iv):
    c = _clean(iv.get("colour_primary") or iv.get("colour") or "")
    c2 = _clean(iv.get("colour_secondary") or "")
    return (c + " " + c2) if (c and c2) else (c or c2)


def _split_components(iv):
    majors, minors = [], []
    for src in ("additional_components", "inclusions"):
        for x in (iv.get(src) or []):
            x = _clean(x)
            if not x:
                continue
            (minors if re.match(r"^trace\b", x, re.I) else majors).append(x)
    return _dedupe(majors), _dedupe(minors)


def generate_soil_description(iv):
    m = _clean(iv.get("primary_material") or "")
    if not m:
        return ""
    up = m.upper()
    head = ""
    org = _clean(iv.get("origin") or "").upper()
    if org in ("FILL", "TOPSOIL") and org != up:
        head = org + ": "
    sec = _ordered_secondary(iv.get("secondary_components"))
    primary_phrase = (" ".join(sec) + " " if sec else "") + up

    mid = []
    for v in (iv.get("plasticity"), iv.get("grain_size"), iv.get("grading"), iv.get("particle_shape"),
              _colour_phrase(iv), iv.get("moisture"),
              (iv.get("density") or iv.get("consistency")) if is_granular(up) else (iv.get("consistency") or iv.get("density")),
              iv.get("structure")):
        v = _clean(v)
        if v:
            mid.append(v)
    mid = _dedupe(mid)

    core = head + primary_phrase + (", " + ", ".join(mid) if mid else "")
    majors, minors = _split_components(iv)
    if majors:
        clause = "with " + " and ".join(majors)
        if minors:
            clause += (", " if len(majors) >= 2 else " and ") + ", ".join(minors)
        core += ", " + clause
    elif minors:
        core += ", " + ", ".join(minors)
    return core + "."


def effective_description(iv):
    return _clean(iv.get("description_override") or "") or generate_soil_description(iv)
