<script setup>
defineProps({
  size: { type: Number, default: 40 },
})
</script>

<template>
  <div class="brand-mark" :style="{ width: `${size}px`, height: `${size}px` }" aria-hidden="true">
    <span class="brand-mark__tile brand-mark__tile--a"></span>
    <span class="brand-mark__tile brand-mark__tile--b"></span>
    <span class="brand-mark__tile brand-mark__tile--c"></span>
    <span class="brand-mark__tile brand-mark__tile--d"></span>
  </div>
</template>
