'use strict'
/* eslint-disable @typescript-eslint/explicit-function-return-type */

const requiredBlockId = (input) => {
  const blockId = typeof input.blockId === 'string' ? input.blockId.trim() : ''
  if (!blockId) throw new Error('Choose a meal entry first.')
  return blockId
}

const requiredText = (value, message) => {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) throw new Error(message)
  return text
}

exports.activate = (host) => ({
  commands: {
    addMeal: async (input) => {
      const meal = requiredText(input.text, 'Describe the meal before adding it.')
      const config = await host.getConfig()
      const mealType = typeof config.defaultMealType === 'string' ? config.defaultMealType : 'Meal'
      const content = `# ${mealType}\n\n${meal}\n\n_Logged ${new Date().toLocaleString()}_`
      const block = await host.blocks.createBlock(content, [host.categoryId])
      await host.blocks.setPresence(block.id, false)
      await host.storage.set('lastMealId', block.id)
      host.notify('Meal added and marked for review.', { tone: 'success' })
      return { blockId: block.id, message: 'Meal added and marked for review.' }
    },

    updateMeal: async (input) => {
      const blockId = requiredBlockId(input)
      const content = requiredText(input.content, 'A meal entry cannot be empty.')
      await host.blocks.getMeta(blockId)
      await host.blocks.writeBlock(blockId, content)
      await host.blocks.setPresence(blockId, false)
      host.notify('Meal updated and marked for review.', { tone: 'success' })
      return { blockId, message: 'Meal updated and marked for review.' }
    },

    deleteMeal: async (input) => {
      const blockId = requiredBlockId(input)
      await host.blocks.getMeta(blockId)
      const deleted = await host.blocks.deleteBlock(blockId)
      if (!deleted) throw new Error('The meal entry could not be deleted.')
      if (await host.storage.get('lastMealId') === blockId) await host.storage.set('lastMealId', null)
      host.notify('Meal deleted.', { tone: 'success' })
      return { message: 'Meal deleted.' }
    },

    analyzeMeal: async (input) => {
      const blockId = requiredBlockId(input)
      const entry = await host.blocks.readBlock(blockId)
      if (!entry.content.trim()) throw new Error('Add meal details before analyzing this entry.')
      const config = await host.getConfig()
      const includeMacros = config.includeMacros === true
      const target = typeof config.dailyCalorieTarget === 'number'
        ? config.dailyCalorieTarget
        : 2000
      const result = await host.ai.complete({
        blockId,
        maxTokens: 900,
        system: includeMacros
          ? 'Include estimated protein, carbohydrates, and fat.'
          : 'Do not add a macro breakdown.',
        prompt: `Analyze the referenced meal log. Extract the foods and portions, estimate total calories${includeMacros ? ' plus protein, carbohydrates, and fat' : ''}, and add a short practical summary. The configured daily calorie target is ${target}. Do not repeat the original note verbatim.`
      })
      if (result.error) throw new Error(result.error)
      await host.blocks.appendToBlock(blockId, `## Dietary analysis\n\n${result.text}`)
      await host.blocks.setPresence(blockId, false)
      await host.storage.set('lastAnalyzedAt', Date.now())
      host.notify('Analysis added. Review the estimates when ready.', { tone: 'info' })
      return { blockId, message: 'Analysis added. Review the estimates when ready.' }
    },

    markReviewed: async (input) => {
      const blockId = requiredBlockId(input)
      await host.blocks.acknowledgePresence(blockId)
      host.notify('Meal marked as reviewed.', { tone: 'success' })
      return { blockId, message: 'Meal marked as reviewed.' }
    }
  }
})
