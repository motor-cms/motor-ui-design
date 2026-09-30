<script setup lang="ts">
defineProps<{ text: string }>()
</script>

<template>
  <div class="blk-plain">{{ text }}</div>
  <div class="blk-plain">Second root</div>
</template>

<style>
.blk-plain { padding: 6px 10px; background: #f0e8e8; }
</style>
