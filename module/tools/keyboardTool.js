"use strict";

export function createKeyboardTool(context) {
  return {
    name: 'dismiss_keyboard',
    description: 'Dismiss the on-screen keyboard. Use after typing into a text input when the keyboard is blocking other elements.',
    parameters: {},
    execute: async () => context.platformAdapter.executeAction({
      type: 'dismiss_keyboard'
    })
  };
}
//# sourceMappingURL=keyboardTool.js.map