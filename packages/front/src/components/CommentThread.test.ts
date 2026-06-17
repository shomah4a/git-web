import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import CommentThread from './CommentThread.vue'

const SHA = 'a'.repeat(40)

function comment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    sha: SHA,
    path: 'foo.ts',
    newLineStart: 2,
    newLineEnd: 2,
    body: 'comment body',
    createdAt: '2026-06-17T00:00:00.000Z',
    resolved: false,
    ...overrides,
  }
}

describe('CommentThread', () => {
  it('displayStart があればラベルは翻訳後の行を表示する', () => {
    const wrapper = mount(CommentThread, {
      props: {
        comments: [comment({ newLineStart: 2, newLineEnd: 2, displayStart: 5, displayEnd: 5 })],
      },
    })
    expect(wrapper.find('.comment-range').text()).toBe('L5')
  })

  it('displayStart が無ければ newLineStart を表示する', () => {
    const wrapper = mount(CommentThread, {
      props: { comments: [comment({ newLineStart: 3, newLineEnd: 7 })] },
    })
    expect(wrapper.find('.comment-range').text()).toBe('L3-7')
  })

  it('resolved コメントはバッジを表示し、トグルで反転値を emit する', async () => {
    const wrapper = mount(CommentThread, {
      props: { comments: [comment({ resolved: true })] },
    })
    expect(wrapper.find('.comment-resolved-badge').exists()).toBe(true)
    await wrapper.find('.comment-resolve-btn').trigger('click')
    const emitted = wrapper.emitted('toggle-resolve')
    expect(emitted?.[0]?.[0]).toEqual({ id: 'c1', resolved: false })
  })
})
