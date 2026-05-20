"use strict";

export function createTypeTool(context) {
  return {
    name: 'type',
    description: 'Type text into a text-input element by its index.',
    parameters: {
      index: {
        type: 'number',
        description: 'The index of the text-input element',
        required: true
      },
      text: {
        type: 'string',
        description: 'The text to type',
        required: true
      }
    },
    execute: async args => context.platformAdapter.executeAction({
      type: 'type',
      index: Number(args.index),
      text: String(args.text ?? '')
    })
  };
}
//# sourceMappingURL=typeTool.js.map