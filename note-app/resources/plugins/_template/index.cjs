'use strict'
/* eslint-disable @typescript-eslint/explicit-function-return-type */

const requiredBlockId = (input) => {
  const blockId = typeof input.blockId === 'string' ? input.blockId.trim() : ''
  if (!blockId) throw new Error('Choose an entry first.')
  return blockId
}

const requiredText = (value, message) => {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) throw new Error(message)
  return text
}

exports.activate = (host) => ({
  commands: {
    addEntry: async (input) => {
      const text = requiredText(input.text, 'Write something before adding it.')
      const config = await host.getConfig()
      const title = typeof config.entryTitle === 'string' && config.entryTitle.trim()
        ? config.entryTitle.trim()
        : 'Entry'
      const block = await host.blocks.createBlock(`# ${title}\n\n${text}`, [host.categoryId])
      await host.blocks.setPresence(block.id, false)
      await host.storage.set('lastEntryId', block.id)
      host.notify('Entry added.', { tone: 'success' })
      return { blockId: block.id }
    },

    saveEntry: async (input) => {
      const blockId = requiredBlockId(input)
      const content = requiredText(input.content, 'An entry cannot be empty.')
      await host.blocks.getMeta(blockId)
      await host.blocks.writeBlock(blockId, content)
      await host.blocks.setPresence(blockId, false)
      host.notify('Entry saved and marked for review.', { tone: 'success' })
      return { blockId }
    },

    deleteEntry: async (input) => {
      const blockId = requiredBlockId(input)
      await host.blocks.deleteBlock(blockId)
      host.notify('Entry deleted.', { tone: 'success' })
    },

    summarizeEntry: async (input) => {
      const blockId = requiredBlockId(input)
      const result = await host.ai.complete({
        blockId,
        prompt: 'Summarize the referenced entry without repeating its heading.',
        maxTokens: 300
      })
      if (result.error) throw new Error(result.error)
      await host.blocks.appendToBlock(blockId, `## Summary\n\n${result.text}`)
      await host.blocks.setPresence(blockId, false)
      host.notify('Summary added. Review it when ready.', { tone: 'info' })
      return { blockId }
    },

    markReviewed: async (input) => {
      const blockId = requiredBlockId(input)
      await host.blocks.acknowledgePresence(blockId)
      host.notify('Entry marked as reviewed.', { tone: 'success' })
      return { blockId }
    }
  }
})
