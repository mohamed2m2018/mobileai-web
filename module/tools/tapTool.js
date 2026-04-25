"use strict";

export function createTapTool(context) {
  return {
    name: 'tap',
    description: 'Tap an interactive element by its index. Works universally on buttons, radios, switches, and custom components.',
    parameters: {
      index: {
        type: 'number',
        description: 'The index of the element to tap',
        required: true
      }
    },
    execute: async args => context.platformAdapter.executeAction({
      type: 'tap',
      index: Number(args.index)
    })
  };
}
//# sourceMappingURL=tapTool.js.map