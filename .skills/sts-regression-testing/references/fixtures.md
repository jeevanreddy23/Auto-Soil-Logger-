# Fixtures

- Copy and anonymize representative project/borehole records.
- Preserve unknown fields and nested optional data.
- Include soil-only, soil-to-rock, cored, empty and invalid records.
- Include legacy manual descriptions and legacy SPT rows without penetration fields.
- Record input checksums; tests compare the canonical source after save/reload.
- Never include reference-log project data merely to imitate its styling.
