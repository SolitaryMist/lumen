<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { mountGuilloche } from '../guilloche.js';

/* Vue 3 single-file component. The host registers inter-var.woff2 as "Inter Var".
   Motion matches the web piece: 36 rings, 720 segments, springs 170/22 and 280/28,
   guide then drift on one clock, 160ms card fade, 900ms ring draw, 40ms stagger.
   Reduced motion rests, fades in 200ms, and does not draw or drift.
   destroy() runs before unmount and drops the frame and the listeners. */

const root = ref(null);
let handle = null;

onMounted(() => {
  handle = mountGuilloche(root.value);
});

onBeforeUnmount(() => {
  if (handle) handle.destroy();
  handle = null;
});
</script>

<template>
  <div ref="root" style="position:relative;width:100%;height:100%"></div>
</template>
