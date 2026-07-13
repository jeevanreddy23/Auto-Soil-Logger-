# First Slice Design Brief

## Outcome

Make the existing field-to-PDF path dependable without replacing the current project, borehole or Worker storage model.

## Primary Workflow

Existing project -> existing borehole -> two soil intervals -> one SPT -> save -> reload -> validation -> professional A4 soil/rock PDF.

## Users and Context

- Field logger on a phone or tablet, often moving quickly and working with intermittent connectivity.
- Engineering reviewer on desktop, scanning intervals, warnings and the issued-log preview.
- Project manager receiving a stable report artifact through Cloudflare storage.

## Interaction Shape

- Desktop keeps the dense register because comparison across rows is the main task.
- Phone and portrait tablet use one focused interval or test editor with previous/next navigation.
- Structured descriptions remain automatic until manually edited.
- Manual text is preserved and visibly marked; later structured-field changes create an out-of-sync warning.
- SPT start depth, three blow increments, three penetration increments, refusal and hammer bounce derive end depth, status and N notation.

## Visual Direction

- STS green is reserved for current location and primary actions.
- Graphite navigation, white working surfaces and restrained amber/red validation states support repeated operational use.
- One system UI family is intentional for the application register; PDF typography uses a portable PDF-native face.
- The issued STS/OpenGround files are used only for hierarchy, geometry and notation, never copied project data.

## Compatibility

- Existing records are not migrated in bulk.
- Missing penetration values on a legacy SPT are interpreted as full 150 mm increments when that increment has a blow count.
- New fields are optional and ignored by old readers.
- PDF generation projects a deep copy, so any compatibility repair cannot alter the saved source record.
