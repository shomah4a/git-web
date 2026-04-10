import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ThemeSwitcher from './ThemeSwitcher.vue'

describe('ThemeSwitcher', () => {
  it('3 値すべてのボタンが表示される', () => {
    const wrapper = mount(ThemeSwitcher, { props: { modelValue: 'auto' } })
    const labels = wrapper.findAll('button').map((b) => b.text())
    expect(labels).toEqual(['ライト', 'ダーク', '自動'])
  })

  it('modelValue に対応するボタンだけが aria-pressed=true になる', () => {
    const wrapper = mount(ThemeSwitcher, { props: { modelValue: 'dark' } })
    const buttons = wrapper.findAll('button')
    expect(buttons[0]?.attributes('aria-pressed')).toBe('false')
    expect(buttons[1]?.attributes('aria-pressed')).toBe('true')
    expect(buttons[2]?.attributes('aria-pressed')).toBe('false')
  })

  it('クリックで update:modelValue が発火する', async () => {
    const wrapper = mount(ThemeSwitcher, { props: { modelValue: 'light' } })
    await wrapper.findAll('button')[1]?.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['dark']])
  })

  it('既に選択中のボタンをクリックしても update:modelValue は発火しない', async () => {
    const wrapper = mount(ThemeSwitcher, { props: { modelValue: 'light' } })
    await wrapper.findAll('button')[0]?.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})
