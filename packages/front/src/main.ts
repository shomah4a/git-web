import { createApp } from 'vue'
import App from './App.vue'
import { createShikiHighlighter } from './diff/highlighter/shiki.js'
import { highlighterKey } from './diff/highlighter/types.js'
import './styles/theme.css'

// Shiki の Highlighter インスタンスは同期 factory で作り、wasm の
// 実ロードは初回利用時まで lazy (ADR 0017)。main.ts で top-level await は
// 使わない。
const highlighter = createShikiHighlighter()

createApp(App).provide(highlighterKey, highlighter).mount('#app')
