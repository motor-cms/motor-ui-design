<script setup lang="ts">
defineProps<{ title: string; text: string }>()
</script>

<template>
  <div class="blk-demo">
    <h2 class="blk-demo__title">{{ title }}</h2>
    <p class="blk-demo__text">{{ text }}</p>
  </div>
</template>

<style>
.blk-demo { padding: 8px 12px; background: var(--demo-bg); }
.blk-demo:hover { background: var(--demo-bg-hover); }
.blk-demo__title { margin: 0 0 4px; font-size: 20px; font-weight: 700; }
.blk-demo__text { margin: 0; }
/* container query on the page root, as the real blocks do (the legacy side uses a viewport media query) */
@container page (min-width: 768px) {
  .blk-demo { padding: 16px 24px; }
}
</style>
