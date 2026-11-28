import { useEffect, useRef } from 'react';
import { mountInk } from '../ink.js';

/* Lumen 012 · Ink. A single drop, slowly finding its way.
   Mount in a box that has a height. The host registers JetBrains Mono 400 (jetbrains-mono.woff2);
   grain.png resolves from the module URL. Needs WebGL2 with float render targets; without it the
   paper card is shown still.
   Card 3:2, W = min(760px, 76vw, 120vh); portrait centre at 46% height. Paper #ECE8E1, ink #141416.
   Stable fluids on a 256 grid (Jacobi 24, vorticity 18), velocity half-life 1200ms, ink 9000ms (3500ms in auto mode),
   curl noise 0.06 W/s (k 6 / 13). Display 1 - exp(-3.0 d), max density 0.92, edge pooling 0.18.
   Drop: d = 0.85 (1 - r^2)^2, r = 0.075W, poured over 180ms (ease-out), outward impulse 0.2.
   Velocity and ink transport fade to 0 within 0.06W of every card edge (smoothstep).
   Press drops ink at the pointer (350ms apart); moving stirs (pointer velocity x1.4).
   No pointer (auto mode): a drop every 9s, a slow figure-eight stirrer that runs 3.5s after each drop then
   eases to 0 over 1.2s (smoothstep), ink half-life 3.5s so the card returns to near-bare paper. Any pointer
   input switches to the normal parameters (ink 9000ms); auto resumes 6s after the last input.
   prefers-reduced-motion: one still frame of the fresh drop, no simulation (the module listens for changes).
   Each copy keeps its own canvas, GL context, listeners and frame; unmount releases all of them. */

export default function Ink({ seed, style, className }) {
  const ref = useRef(null);
  useEffect(() => {
    const handle = mountInk(ref.current, { seed });
    return () => handle.destroy();
  }, [seed]);
  return (
    <div
      ref={ref}
      className={className}
      style={{ position: 'relative', width: '100%', height: '100%', ...style }}
    />
  );
}
