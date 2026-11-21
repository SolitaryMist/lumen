import { useEffect, useRef } from 'react';
import { mountGlassLens } from '../glass-lens.js';

/* Mount in a box that has a height. Host registers Geist font family.
   WebGL lens, centre magnification 1.35, hold 1.8, diameter 0.30–0.36 of width.
   Follow spring 170/22, hold and stretch springs 280/28.
   Fine pointer waits at rest (0.62, 0.50); coarse-pointer-only devices start
   an 8s figure-8 drift after the 600ms intro, with an 800ms smoothstep on speed.
   Reduced motion: rest, no stretch, hold fades magnification over 200ms.
   Each copy keeps its own DOM, listeners, and frame. */

export default function GlassLens() {
  const ref = useRef(null);
  useEffect(() => {
    const handle = mountGlassLens(ref.current);
    return () => handle.destroy();
  }, []);
  return <div ref={ref} style={{ position: 'relative', width: '100%', height: '100%' }} />;
}
