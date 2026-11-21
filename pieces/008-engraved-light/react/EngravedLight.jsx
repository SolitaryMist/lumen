import { useEffect, useRef } from 'react';
import { mountEngravedLight } from '../guilloche.js';

/* Mount: React 18, default export. Render <EngravedLight /> in a box with a height.
   The host registers this piece's inter-var.woff2 as family "Inter Var", weight 100–900.
   36 rings, 720 segments, 24 brightness buckets. Light spring 170 / 22 / 1.
   Press spring 280 / 28 / 1, k from 8 to 24, release keeps velocity.
   Guide −60° → +50° in 760ms, then +50° → −30° in 640ms, then
   θ = 10° − 40°·cos(2πt/8000ms) on that same clock. Light y stays 0.45.
   Card fades 160ms. Rings draw 900ms, stagger 40ms. Type follows the outer ring.
   Reduced motion: rest pose, 200ms fade, no stroke draw, no drift.
   Each copy keeps its own canvas, listeners, and frame. */

export default function EngravedLight() {
  const ref = useRef(null);
  useEffect(() => {
    const handle = mountEngravedLight(ref.current);
    return () => handle.destroy();
  }, []);
  return <div ref={ref} style={{ position: 'relative', width: '100%', height: '100%' }} />;
}
