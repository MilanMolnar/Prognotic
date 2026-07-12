import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { AssistantMessageContent } from './AssistantMessageContent'

describe('AssistantMessageContent', () => {
  it('renders block citations as readable inline labels without breaking lightweight Markdown', () => {
    const resolveCitationLabel = vi.fn(() => 'Quick Notes/Daily standup notes')
    const html = renderToStaticMarkup(createElement(AssistantMessageContent, {
      text: '- [block:abc]\n**Summary** with [source](https://example.com)',
      resolveCitationLabel
    }))

    expect(html).toContain('Quick Notes/Daily standup notes')
    expect(html).not.toContain('[block:abc]')
    expect(html).toContain('<strong')
    expect(html).toContain('href="https://example.com"')
    expect(resolveCitationLabel).toHaveBeenCalledWith('abc')
  })
})
