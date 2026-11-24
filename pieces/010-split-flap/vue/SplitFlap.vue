<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { mountSplitFlap } from '../split-flap.js';

/* Lumen 010 · Split Flap. Every letter falls into place.
   Mount in a box that has a height. The host registers the Geist (600) and
   JetBrains Mono (400) families; geist-sans.woff2 and jetbrains-mono.woff2 sit
   next to split-flap.js, and grain.png is resolved from the module URL.
   Board: 6 letter flaps, w = clamp(52px, 11vw, 132px), height 1.42w, gap 0.08w,
   radius 0.06w, glyph 0.86w; 3 number flaps at 0.5w, 0.3w below. Sizes snap to
   even device px and the 2 device px hinge starts on an even row.
   Loop MESH 002, WEIGHT 003, STACK 004, LENS 009, 2000ms each.
   Step 64ms: top half 0 to -90deg in 32ms, new bottom half 90 to 0deg in 32ms,
   both cubic-bezier(0.55,0,0.9,0.4). Last step rebounds to 4deg over 160ms.
   Hover with a fine pointer flips a column 4 random steps (once per 320ms).
   Press shows the next word. Reduced motion: 160ms crossfade, no hover flips.
   Each copy keeps its own nodes, listeners and frame; unmount cleans all of it. */

const root = ref(null);
let handle = null;

onMounted(() => {
  handle = mountSplitFlap(root.value);
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
