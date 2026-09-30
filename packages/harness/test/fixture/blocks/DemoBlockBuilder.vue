<script setup lang="ts">
import DemoBlock from './DemoBlock.vue'
defineProps<{ title: string; text: string }>()
</script>

<template>
  <DemoBlock class="blk-demo--builder" :title="title" :text="text" />
</template>

<style>
/* the builder differs from the frontend by one pixel of top padding */
.blk-demo--builder { padding-top: 9px; }
@container page (min-width: 768px) {
  .blk-demo--builder { padding-top: 17px; }
}
</style>
