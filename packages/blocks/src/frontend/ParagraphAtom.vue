<script setup lang="ts">
import { computed } from 'vue'
import { paragraphAtom } from '@motor-cms/ui-design-recipes'

// Stored attribute names are the props. `html` is rich text, used when it is not empty, else `<p>` + `text` + `</p>`;
// the words `nofollow` and an empty `rel=""` are removed from it before it is rendered as it is. `bullet_type` is
// `dot` or `check` (anything else: the browser's markers), `orderedlist_type` a CSS list-style for ordered lists.
// `context` names how a parent restyles the atom, see the recipe.
const props = defineProps<{
  html?: string
  text?: string
  bullet_type?: string
  orderedlist_type?: string
  classes?: string
  context?: string
}>()

const bullets = Object.keys(paragraphAtom.variants.bullets)
const contexts = Object.keys(paragraphAtom.variants.context)

const content = computed(() => {
  const html = props.html && props.html.length > 0 ? props.html : `<p>${props.text}</p>`
  return html.replace(/\bnofollow\s*/gi, '').replace(/\s*rel=""/gi, '')
})
const cls = computed(() =>
  paragraphAtom({
    bullets: (bullets.includes(props.bullet_type ?? '') ? props.bullet_type : 'none') as 'none',
    context: (contexts.includes(props.context ?? '') ? props.context : 'none') as 'none',
    class: props.classes,
  }),
)
const style = computed(() => (props.orderedlist_type ? { '--ordered-list-style': props.orderedlist_type } : undefined))
</script>

<template>
  <div :class="cls" :style="style" :data-bullets="bullet_type === 'check' ? 'check' : undefined" v-html="content" />
</template>
