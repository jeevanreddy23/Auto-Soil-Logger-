# GeoFlow Hybrid Execution Pipeline

## 1. Incoming User Request

User asks:

"Check if this project is report ready and prepare the final pile inspection wording."

The request enters GeoFlow as:

```json
{
  "request_id": "REQ-2026-0001",
  "user_intent": "report_ready_check_and_report_text",
  "query": "pile inspection report ready socket depth shale toe RL lab schedule",
  "project_id": "STS-PROJECT-ACTIVE"
}
```

## 2. Local Retrieval First

GeoFlow does not send the full project folder to the model.

It first calls:

```bash
node brain.js "pile inspection report ready socket depth shale toe RL lab schedule" ./projects ./logs ./scopes ./reports
```

brain.js returns only the highest-scoring markdown section:

```markdown
<!-- GeoFlow Retrieval Router -->
<!-- file: /projects/Claymore/pile_inspection.md -->
<!-- lines: 42-89 -->

## Pile Inspection Summary
P39 to P56 inspected.
Class III shale encountered at approximately 2.0 m below excavation level.
Each inspected pile socketed minimum 1.0 m into competent Class III shale.
Toe RLs checked against structural schedule.
Bases observed clean and free of loose or softened material.
```

If heading keywords don't match (vocabulary mismatch), brain.js automatically
falls back to a deterministic body keyword-frequency scan before giving up,
so "compaction requirement" still routes to a section titled "Earthworks
Acceptance". A no-match exits with code 2 so the caller can widen the search.

## 3. Smaller Model Receives Controlled Context

The smaller model receives three inputs only:

1. system_prompt.md
2. Retrieved snippet from brain.js
3. User request

The model does not receive the entire folder.

```json
{
  "system_prompt": "system_prompt.md",
  "retrieved_context": "brain.js stdout snippet",
  "user_request": "Check if this project is report ready and prepare final pile inspection wording."
}
```

## 4. Deterministic QA Engine Runs

The system loads `qa_rules.json`, then checks the project database:

```json
{
  "project_number": "present",
  "site_address": "present",
  "scope.source_document_id": "present",
  "field_logs_complete": true,
  "pile_ids_match_structural_schedule": true,
  "socket_depths_meet_design": true,
  "toe_rls_match_design": true,
  "base_clean": true,
  "lab_schedule_reconciled": false,
  "checked_by": null
}
```

QA output:

```json
{
  "report_ready": false,
  "blocking_failures": [
    { "rule_id": "LAB_004", "status": "fail", "message": "Required lab results are not reconciled." },
    { "rule_id": "RPT_004", "status": "fail", "message": "Checked-by field is missing." }
  ],
  "warnings": [
    { "rule_id": "MAT_002", "status": "warning", "message": "Some rock intervals are missing defect spacing." }
  ]
}
```

## 5. Model Produces Verified Output

The model must not say the project is report ready. It outputs:

```markdown
# Answer

## Decision
Not Report Ready.

## Evidence Used
- Piles were inspected.
- Class III shale was encountered.
- Minimum socket depth was recorded.
- Bases were observed clean.
- QA engine identified unresolved lab reconciliation and missing checked-by field.

## Checks
| Check | Required | Actual | Status |
|---|---:|---:|---|
| Socket depth | Minimum design socket | Minimum 1.0 m recorded | Pass |
| Toe RL | Match structural schedule | Checked | Pass |
| Base condition | Clean and free of loose material | Recorded clean | Pass |
| Lab reconciliation | Complete | Not complete | Fail |
| Checked by | Required | Missing | Fail |

## Warnings
> **Warning:** Project is not Report Ready.
> **Warning:** Lab schedule reconciliation and checker review must be completed before report issue.

## Final Output
STS attended the site to undertake geotechnical inspection of the selected pile
excavations. During the inspection, dark grey weathered shale was encountered,
generally increasing in strength and competence with depth. Class III shale was
encountered at approximately 2.0 m below the excavation level.

Following confirmation of competent Class III shale, the inspected piles were
advanced to achieve the required rock socket, with a minimum socket depth of
1.0 m into competent Class III shale bedrock. The pile bases were observed to
be clean and free of loose or softened material at the time of inspection.

The inspected pile excavations are considered suitable from a geotechnical
perspective, subject to confirmation of final design requirements, completion
of QA reconciliation, and review by the responsible engineer.
```

## 6. Production Architecture

```
User Request
    |
    v
Intent Parser
    |
    v
Local Retrieval Router  (brain.js)
    |
    v
Targeted Markdown Snippet
    |
    v
Small LLM  (system_prompt.md enforced)
    |
    v
Draft Engineering Output
    |
    v
QA Logic Engine  (qa_rules.json)
    |
    v
Pass / Fail / Warning Decision
    |
    v
Final Verified Output
    |
    v
GeoFlow UI / Report Builder / PDF Export
```

## 7. Key Design Principle

The LLM does not act as the database, calculator, or compliance authority.

| Layer | Responsibility |
|---|---|
| brain.js | Local retrieval and context minimisation |
| system_prompt.md | Reasoning discipline and output control |
| qa_rules.json | Deterministic compliance gate |
| Small LLM | Wording, synthesis, engineering explanation |
| GeoFlow UI | Human review, report export, project control |

Final rule:

> **Warning:** No project should be marked Report Ready based only on LLM
> wording. Report Ready must come from deterministic QA rules plus responsible
> engineer review.

## Measured performance (2026-07-09 sandbox benchmark)

Target retrieval buried in a 50-page (~66,800 token) specification:

| Metric | Broad context loop | brain.js router | Delta |
|---|---:|---:|---|
| Input tokens to LLM | 42,265 | 258 | −99.4% |
| Search latency (modelled prefill) | ~5.7 s | ~0.33 s | −94% |
| Retrieval accuracy | 100% | 100% | parity |
