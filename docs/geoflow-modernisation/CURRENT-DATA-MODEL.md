# Current Data Model

## Storage Envelope

Each KV log key stores a JSON array. The canonical desktop project is `log:__autosoil_project__` with the application state at `rows[0]`. Unknown object fields survive normal JSON snapshot and merge operations.

## Project

`S.project` includes project/report number, client/contact, project/site/address, suburb/state/postcode/LGA, investigation/log dates, logged/checked/approved by, drilling contractor/method/rig, coordinate system/easting/northing, ground RL/datum, groundwater text, weather, and notes.

`PJ.projects[]` adds workspace metadata: `pid`, number, name, client, address, PM, status, types, scope, team, dates, documents, archive state, sync key, timestamps, and activity.

## Borehole

`S.boreholes[]` includes `id`, planned/final depth, termination reason, start/end dates, RL, coordinates, surface, location description, and requirement flags for samples, SPT, DCP, core, standpipe, and photos.

## Borehole Logs

`S.logs[bhId]` contains `soil`, `rock`, `spt`, `samples`, optional `photos`, optional `gw`, and `corebox`.

### Soil Interval

Fields include from/to depth, material, secondary material, colour, moisture, consistency/density, plasticity, structure, origin, inclusions, fill/natural/bedrock, USCS, description, `descTouched`, samples, SPT N, DCP, environmental notes, and remarks.

### Rock Row

Fields include from/to depth, rock type, colour, weathering, strength, defect type/angle/spacing/roughness/infill/aperture/persistence, bedding, TCR, SCR, RQD, Is50, rock class, description, `descTouched`, and remarks. Material intervals and point defects currently share this array and are distinguished by depths and `defectType`.

### Core Run And Corebox

The corebox object holds the image, natural dimensions, calibration depths/pixels, row/run segmentation, defects, snapping and layer-display settings. Calculated recovery values can be synchronized into rock rows. There is no independent canonical `coreRuns[]` entity yet.

### Defect And Defect Zone

Corebox defects have type, depth, angle and optional length plus newer inspector attributes. Point defects become rock rows with equal or absent end depth. Zones use intervals. Unique durable IDs and a fully separate zone collection are not guaranteed in legacy records.

### SPT

Existing fields are start depth (`depth`), seating blows, three blow increments, derived N, refusal, hammer type, energy ratio, recovery, soil description, and remarks. End depth, penetration per increment, hammer bounce, and derived status are not structured in legacy records.

### Sample

Fields include sample ID, from/to depth, type, container, requested tests, flags for common laboratory tests, and remarks. Photos, collection time/by, recovery, purpose and chain of custody are incomplete or absent.

### Groundwater And Drilling

Desktop project groundwater is free text; field records may also contain `logs[bhId].gw` with an explicit state. Drilling method is primarily project-level, not a depth interval track.

### PDF, Export, Review And Issue

PDF configuration is renderer code plus source project fields; there is no canonical per-project template object. Export is generated on demand. Review uses `checkedBy`/`approvedBy`, validation output and project activity. Saved PDFs can be stored as `report-pdf` files, but immutable issue numbers, checksums and a formal issued-version entity are not yet implemented.

## Compatibility Rule

This slice adds only optional fields to records the user edits. Reads must tolerate absent fields, and saves must preserve unknown fields. No bulk KV migration is permitted.
