<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { mountLightGrille } from '../light-grille.js';

/* Vue 3 single-file component. The host registers geist.woff2 as "Geist".
   Motion matches the web piece: 12×12 slits, springs 240/22 and 380/26,
   guide then drift on one clock, 160ms card fade. Leaving the pointer
   returns to the drift path. Reduced motion rests at the origin, fades
   in 200ms, and does not drift. destroy() runs before unmount. */

const root = ref(null);
let handle = null;

onMounted(() => {
  handle = mountLightGrille(root.value);
});

onBeforeUnmount(() => {
  if (handle) handle.destroy();
  handle = null;
});
</script>

<template>
  <div ref="root" style="position:relative;width:100%;height:100%"></div>
</template>
