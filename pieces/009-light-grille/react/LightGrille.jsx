import { useEffect, useRef } from 'react';
import { mountLightGrille } from '../light-grille.js';

/* Mount in a box that has a height. Host registers Geist.
   10×10 grille, follow spring 260/24, hold 420/28, release 300/20 with r×18ms stagger.
   Fine pointer waits at center; coarse pointer devices guide 760–1280ms then 8s cosine drift.
   Reduced motion: 200ms fade, static center slat amber, no drift, no hold.
   Each copy keeps its own DOM, listeners, and frame. */

export default function LightGrille() {
  const ref = useRef(null);

  useEffect(() => {
    const handle = mountLightGrille(ref.current);
    return () => handle.destroy();
  }, []);

  return <div ref={ref} style={{ position: 'relative', width: '100%', height: '100%' }} />;
}
