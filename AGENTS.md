# Repository conventions

- Commit or push only when the user explicitly requests it. Ordinary edits and local validation stay uncommitted; pushing `main` automatically publishes the website.
- This repository hosts multiple independent Slidev presentations. Put each presentation in `decks/<slug>/`; use lowercase ASCII words separated by hyphens. Keep published slugs stable.
- Register public-facing title and description in `site.json`. Its deck order is the homepage order. The default base path is `/ptiris-slides/`.
- Each deck owns its `slides.md`, `style.css`, `public/`, and optional `layouts/`, `components/`, `reference/`, and `AGENTS.md`.
- Keep all presentation text and diagram labels editable in the deck's `slides.md`. Do not create one Vue component per slide or figure. Follow the more specific conventions within each deck.
- Use npm workspaces, one root `package-lock.json`, and Node 24. Install at the repository root. Declare deck-specific dependencies in its own `package.json`; do not add nested lockfiles.
- The root build creates a homepage plus one independent static application per slug. Use a per-deck base path and hash routing. Do not merge unrelated decks into one Slidev entry.
- Keep generated output, dependencies, QA screenshots, local source references, and credentials out of Git. `Ref/`, `evidence/`, `.local/`, `dist/`, and `node_modules/` are ignored.
- Before publishing, run `npm run build` and check the site at its actual base path, including images, fonts, click states, and a directly opened hash URL.
