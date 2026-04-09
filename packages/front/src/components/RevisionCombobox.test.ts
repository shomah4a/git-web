import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchRefs } from '../api/refs.js'
import RevisionCombobox from './RevisionCombobox.vue'

vi.mock('../api/refs.js', () => ({
  fetchRefs: vi.fn(),
}))
const mockedFetchRefs = vi.mocked(fetchRefs)

const SAMPLE_REFS = {
  head: 'main',
  branches: ['main', 'feature/foo', 'feature/bar'],
  tags: ['v1.0.0'],
  truncated: false,
}

beforeEach(() => {
  vi.useFakeTimers()
  mockedFetchRefs.mockReset()
  mockedFetchRefs.mockResolvedValue(SAMPLE_REFS)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('RevisionCombobox', () => {
  it('初期描画では候補リストは非表示', () => {
    const wrapper = mount(RevisionCombobox, {
      props: {
        modelValue: 'HEAD',
        initialRefs: SAMPLE_REFS,
        allowWorktree: false,
      },
    })
    const listbox = wrapper.find('[role="listbox"]')
    // v-show で非表示
    expect(listbox.isVisible()).toBe(false)
  })

  it('フォーカスで候補リストが開く', async () => {
    const wrapper = mount(RevisionCombobox, {
      attachTo: document.body,
      props: {
        modelValue: 'HEAD',
        initialRefs: SAMPLE_REFS,
        allowWorktree: false,
      },
    })
    await wrapper.find('input').trigger('focus')
    expect(wrapper.find('[role="listbox"]').isVisible()).toBe(true)
    wrapper.unmount()
  })

  it('allowWorktree_true_のとき_(worktree)_が先頭に出る', async () => {
    const wrapper = mount(RevisionCombobox, {
      attachTo: document.body,
      props: {
        modelValue: '(worktree)',
        initialRefs: SAMPLE_REFS,
        allowWorktree: true,
      },
    })
    await wrapper.find('input').trigger('focus')
    const options = wrapper.findAll('[role="option"]')
    expect(options[0]?.text()).toBe('(worktree)')
    wrapper.unmount()
  })

  it('allowWorktree_false_のとき_(worktree)_は出ない', async () => {
    const wrapper = mount(RevisionCombobox, {
      attachTo: document.body,
      props: {
        modelValue: 'HEAD',
        initialRefs: SAMPLE_REFS,
        allowWorktree: false,
      },
    })
    await wrapper.find('input').trigger('focus')
    const texts = wrapper.findAll('[role="option"]').map((o) => o.text())
    expect(texts).not.toContain('(worktree)')
    expect(texts).toContain('main')
  })

  it('head_branches_tags_の順で並ぶ_重複排除あり', async () => {
    const wrapper = mount(RevisionCombobox, {
      attachTo: document.body,
      props: {
        modelValue: '',
        initialRefs: SAMPLE_REFS,
        allowWorktree: false,
      },
    })
    await wrapper.find('input').trigger('focus')
    const texts = wrapper.findAll('[role="option"]').map((o) => o.text())
    // head=main が branches にも含まれるので重複排除後の先頭は main 1 回
    expect(texts).toEqual(['main', 'feature/foo', 'feature/bar', 'v1.0.0'])
    wrapper.unmount()
  })

  it('入力で_debounce_後に_fetchRefs_が呼ばれる', async () => {
    const wrapper = mount(RevisionCombobox, {
      attachTo: document.body,
      props: {
        modelValue: '',
        initialRefs: SAMPLE_REFS,
        allowWorktree: false,
      },
    })
    const input = wrapper.find('input')
    await input.setValue('feat')
    expect(mockedFetchRefs).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(200)
    expect(mockedFetchRefs).toHaveBeenCalledWith('feat', 50)
    wrapper.unmount()
  })

  it('入力連打で先行_fetch_は破棄される', async () => {
    const wrapper = mount(RevisionCombobox, {
      attachTo: document.body,
      props: {
        modelValue: '',
        initialRefs: SAMPLE_REFS,
        allowWorktree: false,
      },
    })
    const input = wrapper.find('input')
    await input.setValue('f')
    await vi.advanceTimersByTimeAsync(100)
    await input.setValue('fe')
    // 1 度目はまだ debounce 中なのでキャンセルされる
    await vi.advanceTimersByTimeAsync(200)
    expect(mockedFetchRefs).toHaveBeenCalledTimes(1)
    expect(mockedFetchRefs).toHaveBeenCalledWith('fe', 50)
    wrapper.unmount()
  })

  it('クリックで_update_modelValue_が発火する', async () => {
    const wrapper = mount(RevisionCombobox, {
      attachTo: document.body,
      props: {
        modelValue: '',
        initialRefs: SAMPLE_REFS,
        allowWorktree: false,
      },
    })
    await wrapper.find('input').trigger('focus')
    const options = wrapper.findAll('[role="option"]')
    await options[1]?.trigger('mousedown')
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeDefined()
    expect(emitted?.[0]).toEqual(['feature/foo'])
    wrapper.unmount()
  })

  it('Enter_で自由入力を確定できる', async () => {
    const wrapper = mount(RevisionCombobox, {
      attachTo: document.body,
      props: {
        modelValue: '',
        initialRefs: SAMPLE_REFS,
        allowWorktree: false,
      },
    })
    const input = wrapper.find('input')
    await input.setValue('HEAD^^')
    await input.trigger('keydown', { key: 'Enter' })
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeDefined()
    // 最後の emit が Enter 確定時のもの
    expect(emitted?.at(-1)).toEqual(['HEAD^^'])
    wrapper.unmount()
  })

  it('ArrowDown_で_highlight_が動き_Enter_で選択される', async () => {
    const wrapper = mount(RevisionCombobox, {
      attachTo: document.body,
      props: {
        modelValue: '',
        initialRefs: SAMPLE_REFS,
        allowWorktree: false,
      },
    })
    const input = wrapper.find('input')
    await input.trigger('focus')
    await input.trigger('keydown', { key: 'ArrowDown' })
    await input.trigger('keydown', { key: 'ArrowDown' })
    await input.trigger('keydown', { key: 'Enter' })
    const emitted = wrapper.emitted('update:modelValue')
    // head=main, 1番目=feature/foo
    expect(emitted?.at(-1)).toEqual(['feature/foo'])
    wrapper.unmount()
  })

  it('Escape_で候補が閉じる', async () => {
    const wrapper = mount(RevisionCombobox, {
      attachTo: document.body,
      props: {
        modelValue: '',
        initialRefs: SAMPLE_REFS,
        allowWorktree: false,
      },
    })
    const input = wrapper.find('input')
    await input.trigger('focus')
    expect(wrapper.find('[role="listbox"]').isVisible()).toBe(true)
    await input.trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[role="listbox"]').isVisible()).toBe(false)
    wrapper.unmount()
  })

  it('role_combobox_と_aria_expanded_が_open_状態を反映する', async () => {
    const wrapper = mount(RevisionCombobox, {
      attachTo: document.body,
      props: {
        modelValue: '',
        initialRefs: SAMPLE_REFS,
        allowWorktree: false,
      },
    })
    const input = wrapper.find('[role="combobox"]')
    expect(input.exists()).toBe(true)
    expect(input.attributes('aria-expanded')).toBe('false')
    await wrapper.find('input').trigger('focus')
    expect(wrapper.find('[role="combobox"]').attributes('aria-expanded')).toBe('true')
    wrapper.unmount()
  })

  it('hasError_prop_で_has-error_クラスが付与される', () => {
    const wrapper = mount(RevisionCombobox, {
      props: {
        modelValue: 'HEAD',
        initialRefs: SAMPLE_REFS,
        allowWorktree: false,
        hasError: true,
      },
    })
    expect(wrapper.classes()).toContain('has-error')
  })

  it('initialRefs_null_でも自由入力は動作する', async () => {
    const wrapper = mount(RevisionCombobox, {
      attachTo: document.body,
      props: {
        modelValue: '',
        initialRefs: null,
        allowWorktree: false,
      },
    })
    const input = wrapper.find('input')
    await input.setValue('abc1234')
    await input.trigger('keydown', { key: 'Enter' })
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted?.at(-1)).toEqual(['abc1234'])
    wrapper.unmount()
  })

  it('入力中は_update_modelValue_を_emit_しない_テキストフィールドは検索専用', async () => {
    const wrapper = mount(RevisionCombobox, {
      attachTo: document.body,
      props: {
        modelValue: 'HEAD',
        initialRefs: SAMPLE_REFS,
        allowWorktree: false,
      },
    })
    const input = wrapper.find('input')
    await input.setValue('fe')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.emitted('submit')).toBeUndefined()
    wrapper.unmount()
  })

  it('候補クリックで_submit_も_emit_される', async () => {
    const wrapper = mount(RevisionCombobox, {
      attachTo: document.body,
      props: {
        modelValue: '',
        initialRefs: SAMPLE_REFS,
        allowWorktree: false,
      },
    })
    await wrapper.find('input').trigger('focus')
    const options = wrapper.findAll('[role="option"]')
    await options[1]?.trigger('mousedown')
    expect(wrapper.emitted('submit')?.[0]).toEqual(['feature/foo'])
    wrapper.unmount()
  })

  it('Enter_確定で_submit_も_emit_される', async () => {
    const wrapper = mount(RevisionCombobox, {
      attachTo: document.body,
      props: {
        modelValue: '',
        initialRefs: SAMPLE_REFS,
        allowWorktree: false,
      },
    })
    const input = wrapper.find('input')
    await input.setValue('HEAD^^')
    await input.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('submit')?.[0]).toEqual(['HEAD^^'])
    wrapper.unmount()
  })

  it('blur_で_modelValue_は_emit_されるが_submit_は_emit_されない', async () => {
    const wrapper = mount(RevisionCombobox, {
      attachTo: document.body,
      props: {
        modelValue: 'HEAD',
        initialRefs: SAMPLE_REFS,
        allowWorktree: false,
      },
    })
    const input = wrapper.find('input')
    await input.setValue('main')
    await input.trigger('blur')
    // blur の遅延 close (150ms) を進める
    await vi.advanceTimersByTimeAsync(200)
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['main'])
    expect(wrapper.emitted('submit')).toBeUndefined()
    wrapper.unmount()
  })

  it('blur_で値が変わっていない場合は_emit_しない', async () => {
    const wrapper = mount(RevisionCombobox, {
      attachTo: document.body,
      props: {
        modelValue: 'HEAD',
        initialRefs: SAMPLE_REFS,
        allowWorktree: false,
      },
    })
    const input = wrapper.find('input')
    await input.trigger('focus')
    await input.trigger('blur')
    await vi.advanceTimersByTimeAsync(200)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })

  it('候補クリック時は_blur_経由の重複_commit_が走らない', async () => {
    const wrapper = mount(RevisionCombobox, {
      attachTo: document.body,
      props: {
        modelValue: '',
        initialRefs: SAMPLE_REFS,
        allowWorktree: false,
      },
    })
    await wrapper.find('input').trigger('focus')
    const options = wrapper.findAll('[role="option"]')
    // mousedown.prevent で blur は抑止されている想定。クリック後に時間を進めても
    // submit は 1 回だけ、update:modelValue も 1 回だけ。
    await options[1]?.trigger('mousedown')
    await vi.advanceTimersByTimeAsync(200)
    expect(wrapper.emitted('submit')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
    wrapper.unmount()
  })

  it('unmount_時の_debounce_保留はキャンセルされる', async () => {
    const wrapper = mount(RevisionCombobox, {
      attachTo: document.body,
      props: {
        modelValue: '',
        initialRefs: SAMPLE_REFS,
        allowWorktree: false,
      },
    })
    await wrapper.find('input').setValue('abc')
    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(300)
    expect(mockedFetchRefs).not.toHaveBeenCalled()
  })
})
