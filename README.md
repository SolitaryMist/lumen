# Lumen

A daily collection of interaction, motion and 3D studies — GSAP, WebGL, shaders, physics, generative work.

Live: https://lumen-motion.vercel.app

## Structure

```
public/index.html      # gallery home page (auto-lists pieces)
pieces/
  001-some-slug/
    index.html         # the piece — self-contained (inline JS/CSS or local files, CDN imports OK)
    meta.json          # optional: { "title": "...", "date": "2026-11-04", "tags": ["gsap"] }
    ...assets
scripts/build.mjs      # copies public/ + pieces/ into dist/ and writes dist/pieces.json
vercel.json            # Vercel build config (no dependencies, no framework)
```

Each piece is served at `/<folder>/`, e.g. `/001-some-slug/`.

## Add a new piece

1. Create `pieces/NNN-slug/` (three-digit, incrementing number + kebab-case slug).
2. Add `index.html` (required) and `meta.json` (recommended).
3. `npm run dev` to preview locally.
4. Commit and push to `main` — Vercel deploys automatically and the piece appears on the home page.

Pieces that need their own bundler can build into their folder before committing, or live in a separate repo and be linked.

## License

Code is MIT unless a piece states otherwise.
