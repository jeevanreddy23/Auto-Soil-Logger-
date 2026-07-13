# Current Workflows

| Workflow | Current behavior | Working | Friction / missing | Source and destination | Regression risk |
| --- | --- | --- | --- | --- | --- |
| Project Setup | Form edits `S.project` and autosaves | Required metadata validation and project snapshots | Required values are blank in the linked project; no auth boundary | localStorage and KV log row | High: PDF headers and routing |
| Boreholes | Create/select boreholes and edit setup grid | Existing five linked boreholes load | Duplicate ID handling is prompt-only | `S.boreholes`, `S.logs` | High: log ownership |
| Soil Log | Wide spreadsheet with keyboard movement, generated description and manual edit | Two live intervals persist; overlap/gap validation exists | Manual state is invisible; no deliberate regenerate action; phone grid clips | `S.logs[id].soil` | High: descriptions and depths |
| Rock Log | Wide grid with material, defect and recovery fields | Existing rock row and PDF track render | Material, run and defect concepts share rows | `S.logs[id].rock` | High: PDF and calculations |
| Corebox | Calibrate, pan/zoom, mark defects, derive TCR/RQD, sync | Existing structured viewer and file storage | Suggestion confirmation and durable observation IDs are incomplete | `corebox`, files KV, rock rows | High: images and RQD |
| SPT | Grid derives N from second and third blows | Valid complete records calculate | Penetration/end depth/HB/status not structured; partial tests rely on remarks | `S.logs[id].spt` | High: engineering validity |
| Samples | Shared borehole sample grid with laboratory flags | IDs and duplicate checks exist | Collection/custody detail and cross-entry canonical guarantees incomplete | `S.logs[id].samples` | Medium |
| Preview | Builds active borehole PDF and embeds it | Live BH3 produces soil and rock sheets | Preview depends on CDN libraries and project metadata | Canonical state to in-memory PDF | High |
| Export | Downloads PDF/XLSX and validates project | Actual records are exported | Validation is grouped as strings, not navigable records | Browser download or files KV | High |
| Validation | Checks metadata, depths, gaps/overlaps, RQD/TCR, termination and IDs | Current blockers appear in the side panel | Severity/action/depth links are incomplete; PDF performs silent repairs | Canonical state to derived messages | High |
| Suggestions | Requirement-based messages | Basic sample/SPT/core prompts | Not a reviewed state model | Derived only | Low |
| Borehole Summary | Counts intervals/tests/samples and depth | Updates after edits | Hidden below 1200px with validation | Derived only | Low |
| Field PWA | Offline local capture and pending sync | Explicit offline/pending/conflict states | Desktop and field models diverge in places | `geoflow*` localStorage and KV | High |

## First Slice Flow

Existing project -> select BH3 -> edit two soil intervals -> inspect description state -> add complete or partial SPT -> validate -> save/sync -> reload -> review active borehole PDF.
