"""Measure and render the generated samples; requires pdfplumber and pypdfium2."""
from pathlib import Path
import json
import pdfplumber
import pypdfium2

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'tmp/pdfs'
OUT.mkdir(parents=True, exist_ok=True)
MM = 72 / 25.4
report = {}
for kind, xs, sheets in [
    ('soil', [17,24,50,62,71,157,164,184,196], 1),
    ('rock', [17,23,29,35,41,47,54,60,118,124,139,181,196], 2),
]:
    path = ROOT / f'output/pdf/geoflow-{kind}-log.pdf'
    with pdfplumber.open(path) as pdf:
        for index, page in enumerate(pdf.pages):
            assert abs(page.width/MM-210)<0.02 and abs(page.height/MM-297)<0.02
            assert all(c['x0']>=0 and c['x1']<=page.width and c['top']>=0 and c['bottom']<=page.height for c in page.chars)
            if index >= sheets:
                continue
            vertical = [line['x0']/MM for line in page.lines if abs(line['x0']-line['x1'])<0.01 and abs(line['top']/MM-59)<0.02 and abs(line['bottom']/MM-271)<0.02]
            assert all(any(abs(x-found)<0.02 for found in vertical) for x in xs), (kind, vertical)
            ruler_right = 62 if kind=='soil' else 47
            ticks = sorted({round(line['top']/MM, 3) for line in page.lines if abs(line['x1']/MM-ruler_right)<0.01 and 76.99<=line['top']/MM<=271.01 and 1.99<=abs(line['x1']-line['x0'])/MM<=4.01})
            assert len(ticks)==101, (kind,len(ticks))
            assert abs(ticks[-1]-ticks[0]-194)<0.01
            assert all(abs((b-a)-1.94)<0.003 for a,b in zip(ticks,ticks[1:]))
        text='\n'.join(page.extract_text() or '' for page in pdf.pages)
        assert 'DRAFT - REVIEW REQUIRED' in text
        report[kind]={'pages':len(pdf.pages),'log_sheets':sheets,'body_top_mm':77,'body_bottom_mm':271,'mm_per_metre':19.4,'ticks_per_sheet':101,'columns_mm':xs,'page_bounds':'pass'}
    document=pypdfium2.PdfDocument(path)
    for index,page in enumerate(document):
        page.render(scale=1.5).to_pil().save(OUT/f'geoflow-{kind}-log-{index+1}.png')

reference=Path(r'C:\Users\pored\Downloads\Logs\log-BH8-Cored.pdf')
if reference.exists():
    with pdfplumber.open(reference) as pdf:
        matches={}
        for kind,page_index in [('soil',0),('rock',1)]:
            page=pdf.pages[page_index]
            vertical=[line['x0']/MM for line in page.lines if abs(line['x0']-line['x1'])<0.01 and (line['bottom']-line['top'])/MM>100]
            matches[kind]=[x for x in report[kind]['columns_mm'] if any(abs(x-ref)<0.5 for ref in vertical)]
            assert len(matches[kind])==len(report[kind]['columns_mm']), (kind,matches[kind])
        report['reference']={'file':reference.name,'pages':len(pdf.pages),'a4_width_mm':round(pdf.pages[0].width/MM,2),'matched_columns_mm':matches,'note':'Issued reference column positions match within 0.5 mm. Titles, shading, typography and detail pages are intentional changes.'}
(OUT/'geometry-check.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
