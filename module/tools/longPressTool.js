"use strict";

export function createLongPressTool(context) {
  return {
    name: 'long_press',
    description: 'Long-press an interactive element by its index. Use for actions that require a longer touch, such as showing context menus, reordering items, or triggering secondary actions.',
    parameters: {
      index: {
        type: 'number',
        description: 'The index of the element to long-press',
        required: true
      }
    },
    execute: async args => context.platformAdapter.executeAction({
      type: 'long_press',
      index: Number(args.index)
    })
  };
}
//# sourceMappingURL=longPressTool.js.map