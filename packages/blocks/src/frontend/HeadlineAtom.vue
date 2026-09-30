<script setup lang="ts">
import { computed } from 'vue'
import { headlineAtom } from '@motor-cms/ui-design-recipes'

// Stored attribute names are the props. `type` is the tag (h1 to h6, anything else renders h2), `displayedLevel` the look
// (h1 to h6 and h6-grey; unset means `type`), `weight` one of light, regular, medium, bold (anything else is regular).
// `context` names how a parent restyles the atom, see the recipe.
const props = defineProps<{
  text?: string
  type?: string
  displayedLevel?: string
  weight?: string | null
  classes?: string
  context?: string
}>()

const levels = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']
const weights = ['light', 'regular', 'medium', 'bold']
const contexts = ['flush', 'flush-pointer', 'centered', 'centered-vp', 'left', 'hyphenated']

const tag = computed(() => (levels.includes(props.type ?? '') ? props.type : 'h2'))
const level = computed(() => (props.displayedLevel && [...levels, 'h6-grey'].includes(props.displayedLevel) ? props.displayedLevel : tag.value))
const cls = computed(() =>
  headlineAtom({
    level: level.value as 'h2',
    weight: (weights.includes(props.weight ?? '') ? props.weight : 'regular') as 'regular',
    context: (contexts.includes(props.context ?? '') ? props.context : 'none') as 'none',
    class: props.classes,
  }),
)
</script>

<template>
  <component :is="tag" :class="cls">{{ text }}</component>
</template>
