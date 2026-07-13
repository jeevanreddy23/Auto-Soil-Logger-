# Visual QA

1. Run `pdfinfo` for page size/count.
2. Extract text and assert borehole ID, intervals, SPT/sample labels and termination.
3. Render every page with `pdftoppm -png` at 144 dpi or higher.
4. Inspect rules, text clipping, overlaps, glyphs, hatching, white space, headers and footer.
5. Compare with the closest issued soil/cored reference by line positions and font zones when geometry changed.
6. Fail on missing observations, black squares, broken triangles, split numbers or unexplained page-count change.

Final printed overlay remains a human issue gate for template geometry changes.
