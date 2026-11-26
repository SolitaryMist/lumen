<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { mountPaperFold } from '../paper-fold.js';

/* Lumen 011 · Paper Fold. Every crease catches the light.
   Mount in a box that has a height. The host registers Geist 600 (geist-600.woff2)
   and JetBrains Mono 400 (jetbrains-mono.woff2); grain.png resolves from the module URL.
   Card W = min(720px, 72vw, 128vh), H = W/2; portrait W = 86vw, centre at 46% height.
   Four panels, creases valley / peak / valley, panel angle f·72deg, perspective 1400px.
   Hover: f = 0.15 + 0.7x, rotateX = (0.5 - y)·12deg, spring 170/22.
   Press: f to 0.96 on 280/28; release springs back to the hover fold, keeping its speed.
   No fine pointer: guide 0.45 to 0.85 (760ms) to 0.2 (640ms), then the 8s drift
   f = 0.5 - 0.3·cos(2πt/8000); a horizontal drag drives f and springs back to the drift.
   prefers-reduced-motion: fixed f = 0.45, no follow, no drift (the module listens for changes).
   Each copy keeps its own nodes, listeners and frame; unmount removes all of them. */

const root = ref(null);
let handle = null;

onMounted(() => {
  handle = mountPaperFold(root.value);
});

onBeforeUnmount(() => {
  if (handle) {
    handle.destroy();
    handle = null;
  }
});
</script>

<template>
  <div ref="root" style="position:relative;width:100%;height:100%"></div>
</template>
