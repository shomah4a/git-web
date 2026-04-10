import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import {
  THEME_STORAGE_KEY,
  createLocalStorageThemeStorage,
  createMatchMediaSystemWatcher,
  resolveTheme,
  useTheme,
  type PrefersColorSchemeQuery,
  type ResolvedTheme,
  type SystemThemeWatcher,
  type Theme,
  type ThemeStorage,
} from './theme-store.js'

describe('resolveTheme', () => {
  it('light を選択したとき system に関係なく light を返す', () => {
    expect(resolveTheme('light', 'dark')).toBe('light')
    expect(resolveTheme('light', 'light')).toBe('light')
  })

  it('dark を選択したとき system に関係なく dark を返す', () => {
    expect(resolveTheme('dark', 'dark')).toBe('dark')
    expect(resolveTheme('dark', 'light')).toBe('dark')
  })

  it('auto を選択したとき system の値をそのまま返す', () => {
    expect(resolveTheme('auto', 'dark')).toBe('dark')
    expect(resolveTheme('auto', 'light')).toBe('light')
  })
})

type FakeStorage = ThemeStorage & {
  readonly saved: Theme[]
  readonly initial: Theme
}

function createFakeStorage(initial: Theme): FakeStorage {
  const saved: Theme[] = []
  return {
    initial,
    saved,
    load: () => initial,
    save: (theme: Theme) => {
      saved.push(theme)
    },
  }
}

type FakeWatcher = SystemThemeWatcher & {
  emit(theme: ResolvedTheme): void
  readonly unsubscribed: { count: number }
}

function createFakeWatcher(initial: ResolvedTheme): FakeWatcher {
  let currentValue: ResolvedTheme = initial
  const listeners = new Set<(t: ResolvedTheme) => void>()
  const unsubscribed = { count: 0 }
  return {
    current: () => currentValue,
    subscribe: (cb) => {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
        unsubscribed.count += 1
      }
    },
    emit(theme: ResolvedTheme) {
      currentValue = theme
      for (const cb of listeners) cb(theme)
    },
    unsubscribed,
  }
}

/**
 * useTheme は Vue setup 内でしか呼べないので、テスト用の薄い
 * ラッパコンポーネントにマウントして検証する。
 */
function mountUseTheme(storage: ThemeStorage, watcher: SystemThemeWatcher) {
  const exposed: { store?: ReturnType<typeof useTheme> } = {}
  const Comp = defineComponent({
    setup() {
      exposed.store = useTheme(storage, watcher)
      return () => h('div')
    },
  })
  const wrapper = mount(Comp)
  if (exposed.store === undefined) {
    throw new Error('useTheme did not initialize')
  }
  return { wrapper, store: exposed.store }
}

describe('useTheme', () => {
  it('初期値は storage.load() の値', () => {
    const { store } = mountUseTheme(createFakeStorage('dark'), createFakeWatcher('light'))
    expect(store.theme.value).toBe('dark')
    expect(store.resolved.value).toBe('dark')
  })

  it('auto + system=dark のとき resolved は dark', () => {
    const { store } = mountUseTheme(createFakeStorage('auto'), createFakeWatcher('dark'))
    expect(store.resolved.value).toBe('dark')
  })

  it('auto のまま system が変わると resolved が追従する', () => {
    const watcher = createFakeWatcher('light')
    const { store } = mountUseTheme(createFakeStorage('auto'), watcher)
    expect(store.resolved.value).toBe('light')
    watcher.emit('dark')
    expect(store.resolved.value).toBe('dark')
  })

  it('theme=light のとき system 変更は resolved に影響しない', () => {
    const watcher = createFakeWatcher('light')
    const { store } = mountUseTheme(createFakeStorage('light'), watcher)
    watcher.emit('dark')
    expect(store.resolved.value).toBe('light')
  })

  it('setTheme で theme が更新され storage.save が呼ばれる', async () => {
    const storage = createFakeStorage('auto')
    const { store } = mountUseTheme(storage, createFakeWatcher('light'))
    store.setTheme('dark')
    // watch の flush は microtask で回るため nextTick で待つ
    await Promise.resolve()
    expect(store.theme.value).toBe('dark')
    expect(storage.saved).toEqual(['dark'])
  })

  it('コンポーネントが unmount されたとき watcher が購読解除される', () => {
    const watcher = createFakeWatcher('light')
    const { wrapper } = mountUseTheme(createFakeStorage('auto'), watcher)
    expect(watcher.unsubscribed.count).toBe(0)
    wrapper.unmount()
    expect(watcher.unsubscribed.count).toBe(1)
  })
})

describe('createLocalStorageThemeStorage', () => {
  function makeMemoryStorage(initial: Record<string, string> = {}): Storage {
    const data = new Map(Object.entries(initial))
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => {
        data.set(k, v)
      },
      removeItem: (k: string) => {
        data.delete(k)
      },
      clear: () => data.clear(),
      key: (i: number) => Array.from(data.keys())[i] ?? null,
      get length() {
        return data.size
      },
    }
  }

  it('保存値が無いとき auto を返す', () => {
    const s = createLocalStorageThemeStorage(makeMemoryStorage())
    expect(s.load()).toBe('auto')
  })

  it('保存値が未知文字列のとき auto に倒す', () => {
    const s = createLocalStorageThemeStorage(makeMemoryStorage({ [THEME_STORAGE_KEY]: 'purple' }))
    expect(s.load()).toBe('auto')
  })

  it('light を正しく読み書きする', () => {
    const backing = makeMemoryStorage()
    const s = createLocalStorageThemeStorage(backing)
    s.save('light')
    expect(backing.getItem(THEME_STORAGE_KEY)).toBe('light')
    expect(s.load()).toBe('light')
  })

  it('getItem が throw しても auto にフォールバック', () => {
    const throwing: Storage = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    }
    const s = createLocalStorageThemeStorage(throwing)
    expect(s.load()).toBe('auto')
    // save も例外を漏らさない
    expect(() => s.save('dark')).not.toThrow()
  })
})

describe('createMatchMediaSystemWatcher', () => {
  type FakeMql = {
    mql: PrefersColorSchemeQuery
    emit(next: boolean): void
    removeCalls: { count: number }
  }

  function makeFakeMql(initial: boolean): FakeMql {
    const listeners = new Set<(e: { matches: boolean }) => void>()
    const removeCalls = { count: 0 }
    let matches = initial
    const mql: PrefersColorSchemeQuery = {
      get matches() {
        return matches
      },
      addEventListener(_type: 'change', cb: (e: { matches: boolean }) => void): void {
        listeners.add(cb)
      },
      removeEventListener(_type: 'change', cb: (e: { matches: boolean }) => void): void {
        listeners.delete(cb)
        removeCalls.count += 1
      },
    }
    return {
      mql,
      emit(next: boolean) {
        matches = next
        for (const cb of listeners) cb({ matches: next })
      },
      removeCalls,
    }
  }

  it('current() が matches を反映する', () => {
    const fake = makeFakeMql(true)
    const w = createMatchMediaSystemWatcher(fake.mql)
    expect(w.current()).toBe('dark')
  })

  it('subscribe で change イベントを受け取り、解除関数で removeEventListener が呼ばれる', () => {
    const fake = makeFakeMql(false)
    const w = createMatchMediaSystemWatcher(fake.mql)
    const received: ResolvedTheme[] = []
    const unsubscribe = w.subscribe((t) => received.push(t))
    fake.emit(true)
    fake.emit(false)
    expect(received).toEqual(['dark', 'light'])
    unsubscribe()
    expect(fake.removeCalls.count).toBe(1)
  })
})
