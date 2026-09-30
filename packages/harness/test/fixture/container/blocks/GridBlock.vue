<template>
  <div class="blk-grid">
    <div class="blk-grid__col blk-grid__col--a"><slot name="a" /></div>
    <div class="blk-grid__col blk-grid__col--b"><slot name="b" /></div>
  </div>
</template>

<style>
.blk-grid { display: flex; gap: 24px; padding: 8px; background: #eef3ee; }
.blk-grid__col { flex: 1 1 0; min-width: 0; }
/* container query on the page root (the legacy side uses a viewport media query) */
@container page (min-width: 768px) {
  .blk-grid__col--a { flex-grow: 2; }
}
.blk-pilot { padding: 6px 10px; background: #f0e8e8; }
</style>
