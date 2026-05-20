"use strict";

function getPlatformDetails() {
  const platform = typeof globalThis.Platform === 'object' ? globalThis.Platform : null;
  if (platform && typeof platform.OS === 'string') {
    return {
      os: platform.OS,
      version: platform.Version
    };
  }
  if (typeof navigator !== 'undefined') {
    return {
      os: 'web',
      version: navigator.userAgent || 'unknown'
    };
  }
  return {
    os: 'unknown',
    version: 'unknown'
  };
}
export function getDeviceMetadata() {
  const platform = getPlatformDetails();
  return {
    platform: platform.os === 'ios' ? 'iOS' : platform.os === 'android' ? 'Android' : platform.os,
    osVersion: String(platform.version)
  };
}
//# sourceMappingURL=deviceMetadata.js.map
