<script setup lang="ts">
import { rowGrid } from '@motor-cms/ui-design-recipes'

// A row with columns. `columns` holds the stored `value_as_grid_column` as `span` (1 to 12, anything else is 12) and the
// column's own `classes`; the content of column `i` is the slot `column-<i>`. `classes` is the row's own class list.
defineProps<{
  classes?: string
  columns?: { span?: number; classes?: string }[]
}>()

const s = rowGrid()
const span = (n?: number) => (Number.isInteger(n) && n! >= 1 && n! <= 12 ? (n as 1) : 12)
</script>

<template>
  <div :class="s.base({ class: classes })">
    <div :class="s.row()">
      <div v-for="(col, i) in columns" :key="i" :class="s.column({ span: span(col.span), class: col.classes })">
        <slot :name="`column-${i}`" />
      </div>
    </div>
  </div>
</template>
