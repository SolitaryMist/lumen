# Lumen Playbook

Shared rules for every piece. Add a rule whenever the same issue shows up twice.

## Goals
- More GitHub stars and follows, more traffic to lumen-motion.vercel.app, more X followers. Every piece must be polished; don't submit anything that isn't ready.

## Process
- Design spec, then build, then a review in the group, then owner approval, then push to main (Vercel auto-deploys), then X copy and an intent link. Never post for the owner.

## Visual rules
- Amber `#FFB547` is used only for the glow and lit states.
- A glow is a solid radial gradient (no hollow center) on a layer beneath the text, so white text stays pure white.
- Mobile: make the text bigger and the light tighter so only part of the text is lit.
- On mobile, light drift cycles last at least 6s.
- Respect `prefers-reduced-motion`.

## Engineering
- Mobile input font size must be at least 16px (prevents iOS zoom).
- Every piece needs an OG share image (1200×630), a README GIF, and a GitHub link on the page.
- Hold 60fps on mobile.
- When changing a CSS variable, check whether JS hardcodes that value or uses it in logic.

## Recording
- Vertical recordings scroll at about 6s to reveal the cards; keep each one at most 10s.
