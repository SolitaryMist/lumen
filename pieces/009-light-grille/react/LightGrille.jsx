import { useEffect, useRef } from 'react';
import { mountLightGrille } from '../light-grille.js';

/* Mount: React 18, default export. Render <LightGrille /> in a box with a height.
   The host registers this piece's geist.woff2 as family "Geist", weight 600.
   12×12 slits in a 240×240 grid on a 360×480 card. Follow spring 240 / 22 / 1.
   Press spring 380 / 26 / 1, slits flatten to 16×2 and gather on the mid-line.
   Guide from (−60, 40) along a reverse arc into (60, −40) in 480ms, then
   pos = (60 cos(2πt/8000), −40 cos(2πt/8000)) on that same clock.
   Card fades 160ms. Leaving the pointer returns to the drift path.
   Reduced motion: focus at the origin, no drift, no press scale, no offset.
   Each copy keeps its own canvas, listeners, and frame. */

export default function LightGrille() {
  const ref = useRef(null);
  useEffect(() => {
    const handle = mountLightGrille(ref.current);
    return () => handle.destroy();
  }, []);
  return <div ref={ref} style={{ position: 'relative', width: '100%', height: '100%' }} />;
}
