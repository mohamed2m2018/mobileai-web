"use strict";

import React, { createContext, useContext, useMemo } from 'react';
import { jsx as _jsx } from "react/jsx-runtime";
const noop = async () => {};
export const ActionBridgeContext = /*#__PURE__*/createContext({
  invoke: noop
});
export function ActionBridgeProvider({
  children,
  handlers
}) {
  const value = useMemo(() => ({
    invoke: async payload => {
      const handler = handlers?.[payload.actionId];
      if (handler) {
        await handler(payload);
      }
    }
  }), [handlers]);
  return /*#__PURE__*/_jsx(ActionBridgeContext.Provider, {
    value: value,
    children: children
  });
}
export function useActionBridge() {
  return useContext(ActionBridgeContext);
}
//# sourceMappingURL=ActionBridge.js.map