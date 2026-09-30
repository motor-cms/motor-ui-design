import { defineConfig } from '@motor-cms/ui-design-harness'

export default defineConfig({
  reference: 'reference',
  blockMap: 'block-map.ts',
  css: ['theme.css'],
  theme: 'neutral',
  exemptions: 'exemptions.json',
  viewports: [375, 767, 768, 1024],
  reportDir: '../../../../.tmp/fixture-report',
})
