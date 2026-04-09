<script setup lang="ts">
/**
 * from/to のリビジョン指定コンボボックス (ADR 0019)。
 *
 * 設計方針:
 * - 親 (DiffView) が onMounted 時に fetchRefs を 1 回だけ発火して結果を
 *   initialRefs 経由で渡す。本コンポーネントは初期 fetch を行わない
 *   (refs 取得の並行発火を避ける)
 * - 入力文字列変化時のみ debounce 200ms で /api/refs?q=... を再取得する
 * - 並行発火時は lastIssuedGen カウンタで後発優先 (ADR 0017 と同じ思想)
 * - 自由入力も Enter / blur でそのまま確定可能 (HEAD^^ 等の相対指定や ref 一覧に
 *   ない SHA を許容するため)
 * - a11y は role=combobox + aria-expanded + role=option の最小対応のみ
 */

import type { RefListDto } from '@git-web/common'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { fetchRefs } from '../api/refs.js'

const props = withDefaults(
  defineProps<{
    modelValue: string
    initialRefs: RefListDto | null
    allowWorktree: boolean
    placeholder?: string
    hasError?: boolean
  }>(),
  {
    placeholder: '',
    hasError: false,
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'submit', value: string): void
}>()

/**
 * UI 上の仮想 ref 文字列。`to === WORKTREE_SENTINEL` で「作業ツリー」を表す。
 * DiffView 側の定数と一致させる必要があるが、props で受け取るより定数同値を
 * 守るほうが実装が単純なため、コンポーネント間で同じリテラルを持つ。
 */
const WORKTREE_SENTINEL = '(worktree)' as const

const inputText = ref<string>(props.modelValue)
const isOpen = ref(false)
const highlightIdx = ref(-1)
const refs = ref<RefListDto | null>(props.initialRefs)

/**
 * fetchRefs の世代カウンタ。レスポンスを受け取るまでに後続の fetch が走った場合、
 * 古い結果を破棄するための判定に使う。
 */
let lastIssuedGen = 0
let debounceHandle: ReturnType<typeof setTimeout> | null = null
let isUnmounted = false

// 親から modelValue が変わったら input に反映する (双方向の整合)
watch(
  () => props.modelValue,
  (next) => {
    if (next !== inputText.value) {
      inputText.value = next
    }
  },
)

// initialRefs が後から到着した場合 (親の fetchRefs 完了後) にも反映する
watch(
  () => props.initialRefs,
  (next) => {
    if (refs.value === null && next !== null) {
      refs.value = next
    }
  },
)

const options = computed<readonly string[]>(() => {
  const result: string[] = []
  if (props.allowWorktree) {
    result.push(WORKTREE_SENTINEL)
  }
  const current = refs.value
  if (current !== null) {
    if (current.head !== null && !result.includes(current.head)) {
      result.push(current.head)
    }
    for (const b of current.branches) {
      if (!result.includes(b)) result.push(b)
    }
    for (const t of current.tags) {
      if (!result.includes(t)) result.push(t)
    }
  }
  return result
})

function open(): void {
  isOpen.value = true
}

function close(): void {
  isOpen.value = false
  highlightIdx.value = -1
}

function commit(value: string): void {
  inputText.value = value
  emit('update:modelValue', value)
  emit('submit', value)
  close()
}

function onInput(ev: Event): void {
  const target = ev.target
  if (!(target instanceof HTMLInputElement)) return
  inputText.value = target.value
  emit('update:modelValue', target.value)
  isOpen.value = true
  highlightIdx.value = -1
  scheduleFetch(target.value)
}

function scheduleFetch(q: string): void {
  if (debounceHandle !== null) {
    clearTimeout(debounceHandle)
  }
  debounceHandle = setTimeout(() => {
    void runFetch(q)
  }, 200)
}

async function runFetch(q: string): Promise<void> {
  const myGen = ++lastIssuedGen
  try {
    const result = await fetchRefs(q, 50)
    if (isUnmounted) return
    if (myGen !== lastIssuedGen) return
    refs.value = result
  } catch (err) {
    if (isUnmounted) return
    if (myGen !== lastIssuedGen) return
    // 取得失敗時は候補を空にし、自由入力のみ可にする
    console.warn('[RevisionCombobox] fetchRefs failed', err)
    refs.value = null
  }
}

function onKeydown(ev: KeyboardEvent): void {
  if (ev.key === 'ArrowDown') {
    ev.preventDefault()
    if (!isOpen.value) {
      isOpen.value = true
      return
    }
    const len = options.value.length
    if (len === 0) return
    highlightIdx.value = (highlightIdx.value + 1) % len
    return
  }
  if (ev.key === 'ArrowUp') {
    ev.preventDefault()
    const len = options.value.length
    if (len === 0) return
    highlightIdx.value = highlightIdx.value <= 0 ? len - 1 : highlightIdx.value - 1
    return
  }
  if (ev.key === 'Enter') {
    ev.preventDefault()
    const idx = highlightIdx.value
    if (isOpen.value && idx >= 0 && idx < options.value.length) {
      const picked = options.value[idx]
      if (picked !== undefined) {
        commit(picked)
        return
      }
    }
    commit(inputText.value)
    return
  }
  if (ev.key === 'Escape') {
    ev.preventDefault()
    close()
  }
}

function onOptionClick(value: string): void {
  commit(value)
}

function onFocus(): void {
  open()
}

function onBlur(): void {
  // blur 時に即閉じると候補クリックが拾えなくなる。mousedown.prevent で
  // フォーカスを保持しているのでここでは何もしない設計もあるが、シンプルに
  // setTimeout で遅延クローズする
  setTimeout(() => {
    if (isUnmounted) return
    close()
  }, 150)
}

onBeforeUnmount(() => {
  isUnmounted = true
  if (debounceHandle !== null) {
    clearTimeout(debounceHandle)
    debounceHandle = null
  }
})

const listboxId = `rev-combobox-listbox-${Math.random().toString(36).slice(2, 10)}`
</script>

<template>
  <div class="revision-combobox" :class="{ 'has-error': hasError }">
    <input
      type="text"
      role="combobox"
      aria-autocomplete="list"
      :aria-expanded="isOpen"
      :aria-controls="listboxId"
      :value="inputText"
      :placeholder="placeholder"
      @input="onInput"
      @keydown="onKeydown"
      @focus="onFocus"
      @blur="onBlur"
    />
    <ul v-show="isOpen && options.length > 0" :id="listboxId" role="listbox" class="options">
      <li
        v-for="(opt, idx) in options"
        :key="opt"
        role="option"
        :aria-selected="idx === highlightIdx"
        :class="{ highlighted: idx === highlightIdx }"
        @mousedown.prevent="onOptionClick(opt)"
      >
        {{ opt }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
.revision-combobox {
  position: relative;
  display: inline-block;
}
.revision-combobox input {
  width: 14em;
  padding: 0.25rem 0.4rem;
  border: 1px solid #bbb;
  border-radius: 3px;
  font-family: ui-monospace, monospace;
  font-size: 0.9em;
}
.revision-combobox.has-error input {
  border-color: #c33;
}
.options {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 10;
  margin: 2px 0 0;
  padding: 0;
  list-style: none;
  background: #fff;
  border: 1px solid #bbb;
  border-radius: 3px;
  max-height: 16em;
  overflow-y: auto;
  min-width: 14em;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
}
.options li {
  padding: 0.2rem 0.5rem;
  cursor: pointer;
  font-family: ui-monospace, monospace;
  font-size: 0.9em;
  white-space: nowrap;
}
.options li:hover,
.options li.highlighted {
  background: #e8f0ff;
}
</style>
