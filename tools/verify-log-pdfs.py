"""Validate GeoFlow's own layout contract and render every output page."""
from pathlib import Path
import json
import pdfplumber
import pypdfium2

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'tmp/pdfs'
OUT.mkdir(parents=True,exist_ok=True)
MM=72/25.4
report={}
for kind,sheets in [('soil',2),('rock',4)]:
    path=ROOT/f'output/pdf/geoflow-{kind}-log.pdf'
    with pdfplumber.open(path) as pdf:
        for i,page in enumerate(pdf.pages):
            assert abs(page.width/MM-210)<.02 and abs(page.height/MM-297)<.02
            assert all(c['x0']>=0 and c['x1']<=page.width and c['top']>=0 and c['bottom']<=page.height for c in page.chars)
            if i>=sheets:continue
            rails=[l for l in page.lines if abs(l['x0']/MM-29)<.01 and abs(l['x1']/MM-29)<.01 and abs(l['top']/MM-101)<.01 and abs(l['bottom']/MM-251)<.01]
            assert len(rails)==1
            ticks=sorted(l['top']/MM for l in page.lines if abs(l['x0']/MM-26)<.01 and abs(l['x1']/MM-29)<.01)
            assert len(ticks)==11
            assert all(abs(b-a-15)<.01 for a,b in zip(ticks,ticks[1:]))
            assert not any(abs((l['bottom']-l['top'])/MM-212)<.01 for l in page.lines)
        assert 'GEOFLOW TIMELINE' in pdf.pages[0].extract_text()
        report[kind]={'pages':len(pdf.pages),'profile_pages':sheets,'depth_window_m':5,'mm_per_metre':30,'rail_x_mm':29,'body_y_mm':[101,251],'page_bounds':'pass'}
    for i,page in enumerate(pypdfium2.PdfDocument(path)):
        page.render(scale=1.5).to_pil().save(OUT/f'geoflow-{kind}-log-{i+1}.png')
(OUT/'geometry-check.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
