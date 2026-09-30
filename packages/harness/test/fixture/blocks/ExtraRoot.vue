<script setup lang="ts">
import DemoBlock from './DemoBlock.vue'
defineProps<{ title: string; text: string }>()
</script>

<!-- Two roots: the demo block plus a sibling the legacy markup does not have. -->
<template>
  <DemoBlock :title="title" :text="text" />
  <div class="extra-sibling" style="height: 300px; background: #c00"></div>
</template>
