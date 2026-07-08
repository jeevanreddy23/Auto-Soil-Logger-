"""STS GeoFlow - additive migration for structured AS 1726 soil intervals.
Safe & idempotent: only ADDS columns (no drops/renames), preserves every existing
row, and backfills structured fields from legacy columns. Run once at startup."""
import json, sqlite3, os
from as1726_engine import generate_soil_description, graphic_symbol_for, is_granular

NEW_COLUMNS = [
    ("origin", "TEXT"), ("fill_origin", "TEXT"), ("primary_material", "TEXT"),
    ("secondary_components", "TEXT"),          # JSON array
    ("plasticity", "TEXT"), ("grading", "TEXT"), ("grain_size", "TEXT"), ("particle_shape", "TEXT"),
    ("colour_primary", "TEXT"), ("colour_secondary", "TEXT"), ("density", "TEXT"),
    ("additional_components", "TEXT"),         # JSON array
    ("inclusions_json", "TEXT"),               # JSON array (legacy 'inclusions' TEXT kept intact)
    ("description_generated", "TEXT"), ("description_override", "TEXT"),
    ("graphic_symbol", "TEXT"), ("comments", "TEXT"),
    ("created_by", "TEXT"), ("reviewed_by", "TEXT"),
    ("status", "TEXT DEFAULT 'DRAFT'"), ("updated_at", "TIMESTAMP"),
    ("legacy_description", "TEXT"),            # untouched audit copy of the pre-migration text
]

def _cols(cur, table):
    return {r[1] for r in cur.execute(f"PRAGMA table_info({table})").fetchall()}

def migrate(conn):
    cur = conn.cursor()
    existing = _cols(cur, "soil_layers")
    for name, decl in NEW_COLUMNS:
        if name not in existing:
            cur.execute(f"ALTER TABLE soil_layers ADD COLUMN {name} {decl}")
    conn.commit()

    # backfill only rows not yet migrated (legacy_description NULL)
    rows = cur.execute("SELECT * FROM soil_layers WHERE legacy_description IS NULL").fetchall()
    colnames = [c[0] for c in cur.description]
    for row in rows:
        r = dict(zip(colnames, row))
        primary, adj = _parse_material(r.get("uscs_code"), r.get("description"))
        iv = {
            "primary_material": primary, "secondary_components": adj,
            "colour_primary": r.get("colour") or "", "moisture": r.get("moisture") or "",
            "structure": r.get("structure") or "",
        }
        if is_granular(primary):
            iv["density"] = r.get("consistency") or ""
        else:
            iv["consistency"] = r.get("consistency") or ""
        if r.get("inclusions"):
            iv["inclusions"] = [r["inclusions"]]
        legacy = r.get("description") or ""
        cur.execute(
            """UPDATE soil_layers SET primary_material=?, secondary_components=?, colour_primary=?,
               density=?, consistency=?, inclusions_json=?, description_generated=?,
               description_override=?, graphic_symbol=?, legacy_description=?, status=COALESCE(status,'DRAFT'),
               updated_at=CURRENT_TIMESTAMP WHERE id=?""",
            (primary, json.dumps(adj), iv.get("colour_primary"), iv.get("density",""),
             iv.get("consistency",""), json.dumps(iv.get("inclusions", [])),
             legacy or generate_soil_description(iv), "",     # show legacy text; override empty
             graphic_symbol_for(primary or r.get("uscs_code") or ""), legacy, r["id"]))
    conn.commit()
    return len(rows)

def _parse_material(uscs, desc):
    """Best-effort: recover primary fraction + adjectives from legacy USCS / description."""
    text = (desc or "").strip()
    adj, primary = [], ""
    for a in ("clayey", "silty", "sandy", "gravelly"):
        if text.lower().startswith(a + " "):
            adj.append(a); text = text[len(a)+1:]
    for frac in ("CLAY", "SILT", "SAND", "GRAVEL", "COBBLES", "BOULDERS", "PEAT", "TOPSOIL", "FILL"):
        if frac in (desc or "").upper():
            primary = frac; break
    if not primary:
        primary = {"CL":"CLAY","CI":"CLAY","CH":"CLAY","ML":"SILT","MH":"SILT",
                   "SP":"SAND","SW":"SAND","SM":"SAND","SC":"SAND",
                   "GP":"GRAVEL","GW":"GRAVEL","GM":"GRAVEL","GC":"GRAVEL","Pt":"PEAT"}.get((uscs or "").upper().strip(), "")
    return primary, adj

if __name__ == "__main__":
    path = os.getenv("AUTOSOIL_SQLITE_PATH", "data.db")
    c = sqlite3.connect(path); c.row_factory = sqlite3.Row
    n = migrate(c)
    print(f"Migration complete. Backfilled {n} soil_layer rows in {path}.")
