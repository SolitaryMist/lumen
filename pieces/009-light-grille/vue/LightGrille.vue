<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { mountLightGrille } from '../light-grille.js';

/* Mount in a box that has a height. Host registers Geist.
   10×10 grille, follow spring 260/24, hold 420/28, release 300/20 with r×18ms stagger.
   Fine pointer waits at center; coarse pointer devices guide 760–1280ms then 8s cosine drift.
   Reduced motion: 200ms fade, static center slat amber, no drift, no hold.
   Each copy keeps its own DOM, listeners, and frame. */

const root = ref(null);
let handle = null;

onMounted(() => {
  handle = mountLightGrille(root.value);
});

onBeforeUnmount(() => {
  if (handle) {
    handle.destroy();
    handle = null;
  }
});
</script>

<template>
  <div ref="root" style="position: relative; width: 100%; height: 100%"></div>
</template>
