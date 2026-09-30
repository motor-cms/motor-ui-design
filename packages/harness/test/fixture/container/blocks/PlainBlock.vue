<script setup lang="ts">
defineProps<{ text: string }>()
</script>

<template>
  <div class="blk-pilot">{{ text }}</div>
</template>

<style>
.blk-pilot { padding: 6px 10px; background: #f0e8e8; }
</style>
