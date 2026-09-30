<script setup lang="ts">
import { computed } from 'vue'
import { buttonAtom } from '@motor-cms/ui-design-recipes'

// Builder file: same interface and same pixels as the frontend file; a click does not follow the link. Stored attribute
// names are the props, except `href` and `target`, which the adapter computes from `link_type`, `url`
// and `anchor`: a link to a scheme or a host outside the page gets `rel="noopener noreferrer"`. `variant` is one of the
// recipe's looks (anything else: dark), `has_arrow` shows the arrow after the label, `context` names how a parent
// restyles the atom, see the recipe.
const props = defineProps<{
  title?: string
  variant?: string
  has_arrow?: boolean
  href?: string
  target?: string | null
  classes?: string
  context?: string
}>()

const variants = Object.keys(buttonAtom.variants.variant)
const contexts = Object.keys(buttonAtom.variants.context)

const slots = computed(() =>
  buttonAtom({
    variant: (variants.includes(props.variant ?? '') ? props.variant : 'dark') as 'dark',
    context: (contexts.includes(props.context ?? '') ? props.context : 'none') as 'none',
  }),
)
// the `disabled` look is a disabled control: no `href` (not focusable, does not navigate), out of the tab order
const disabled = computed(() => props.variant === 'disabled')
const rel = computed(() => (props.href && !disabled.value && /^[a-z][a-z\d+.-]*:/i.test(props.href) ? 'noopener noreferrer' : undefined))
</script>

<template>
  <a :href="disabled ? undefined : href" :class="slots.base({ class: classes })" :target="target ?? undefined" :rel="rel" :tabindex="disabled ? -1 : 0" :aria-label="title" :aria-disabled="disabled ? 'true' : undefined" data-block="ButtonAtom" @click.prevent>
    <div :class="slots.inner()">
      <span :class="slots.label()">{{ title }}</span>
      <div v-if="has_arrow" :class="slots.icon()">
        <svg width="21" height="16" viewBox="0 0 21 16" fill="none" role="presentation" xmlns="http://www.w3.org/2000/svg">
          <path
            fill-rule="evenodd"
            clip-rule="evenodd"
            d="M12.6367 15.6818L20.1237 8.76818C20.5831 8.34393 20.5831 7.65607 20.1237 7.23182L12.6367 0.318192C12.1772 -0.106062 11.4323 -0.106062 10.9729 0.318192C10.5134 0.742447 10.5134 1.4303 10.9729 1.85455L16.4515 6.91363L0.468262 6.91363L0.468262 9.08637L16.4515 9.08637L10.9729 14.1454C10.5134 14.5697 10.5134 15.2576 10.9729 15.6818C11.4323 16.1061 12.1772 16.1061 12.6367 15.6818Z"
            fill="currentColor"
          />
        </svg>
      </div>
    </div>
  </a>
</template>
