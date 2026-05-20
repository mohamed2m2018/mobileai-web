"use strict";

import { useAction } from "./hooks/useAction.js";
export function CheckoutScreen() {
  useAction('checkout_cart', 'Process checkout', {
    amount: {
      type: 'number',
      description: 'Total amount'
    },
    currency: {
      type: 'string',
      description: 'Currency code',
      enum: ['USD', 'EUR']
    },
    isExpress: {
      type: 'boolean',
      description: 'Express checkout'
    }
  }, async () => {});
}
//# sourceMappingURL=__cli_tmp__.js.map