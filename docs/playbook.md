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

## Framework delivery
Every piece ships five code surfaces: Web, SwiftUI, Compose, React, and Vue. The gallery keeps the first three and adds React and Vue beside them.

- React is a React 18 function component (`react/<Name>.jsx`). Vue is a Vue 3 single-file component (`vue/<Name>.vue`). Both are the implementation, not a frame around the web page.
- Motion numbers and the drawn result match the web piece, including springs and, where the web piece uses a shader, that shader.
- Each copy uses its own nodes. Do not use document-wide ids. Cancel animation frames and remove listeners when the component unmounts.
- Honor `prefers-reduced-motion`.
- The code area keeps its height when the tab changes. At 390px the tab row scrolls sideways. Long lines scroll sideways inside the code area.
- The live preview stays the web page. Copy and the repository link follow the selected tab.
