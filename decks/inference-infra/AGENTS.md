# Slidev authoring conventions

- Keep all presentation text in `slides.md`, including diagram labels, table cells, captions, accessible descriptions, footers, and presenter notes.
- Use the shared `lecture` layout and its named slots. Layouts arrange content and must not contain case-specific copy.
- Prefer Markdown tables and ordinary HTML for diagrams. Keep reusable geometry and appearance in `style.css`. Do not create a Vue component for each case, figure, or slide.
- Add a reusable component only when independent interactive logic requires it; provide its content through slots or explicit data in `slides.md`.
- Keep LXGW WenKai, one case per slide, and the drawing conventions documented in `reference/design-notes.md`. Use ordinary text sizes for numbers.
- For conceptual slides, prefer one explanatory diagram with brief, meaningful labels. Put supporting explanations in presenter notes; avoid definition paragraphs and conclusions that repeat the title.
- Cover and chapter-divider slides contain exactly one visible heading, without subtitles, lead-ins, steps, footers, or page numbers. Use a declarative topic summary, not a question. The cover reads only `Introduction to Inference Infra`. Keep the outline free of presenter narration such as “先看实际任务”.
- Use `$page` and `$nav.total` for pagination. Preserve existing user edits when restructuring content.
- Keep each arrow-bearing SVG path to one subpath (`M`). Draw container backgrounds before connectors; leave a straight approach and a gap before target borders. Use the shared fixed-size, context-colored arrowhead style, and keep labels and queue markers away from arrow tips. See `reference/authoring.md` for geometry conventions.
- After changing layout or diagrams, build the deck and inspect the rendered affected slides for text loss, overlap, and clipping. See `reference/authoring.md` for the authoring pattern.
