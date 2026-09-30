<template>
  <div class="blk-panel">
    <div class="blk-panel__media"><slot name="media" /></div>
    <div class="blk-panel__body"><slot name="body" /></div>
  </div>
</template>

<style>
.blk-panel { padding: 12px 16px; background: #e8f0e8; }
.blk-panel__media { margin-bottom: 10px; }
.blk-pilot { padding: 6px 10px; background: #f0e8e8; }
.blk-pilot--after { margin-top: 10px; }
</style>
