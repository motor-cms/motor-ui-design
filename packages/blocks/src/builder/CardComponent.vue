<script setup lang="ts">
import { computed, useSlots } from 'vue'
import { cardComponent } from '@motor-cms/ui-design-recipes'

// Builder file: same interface and same pixels as the frontend file. Slots as stored: `image` (an image atom) and `body` (overline, headline, paragraph and button atoms, in stored order).
// `classes` is the node's own class list. Without an `image` slot the image area keeps a strip of its own.
defineProps<{ classes?: string }>()

const slotNames = useSlots()
const s = computed(() => cardComponent({ empty: !slotNames.image }))
</script>

<template>
  <div :class="s.base({ class: classes })" data-block="CardComponent">
    <div :class="s.image()"><slot name="image" /></div>
    <div :class="s.body()"><slot name="body" /></div>
  </div>
</template>
