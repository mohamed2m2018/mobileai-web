"use strict";

/**
 * Icons — Zero-dependency, View-based icons for the AI Agent chat bar.
 *
 * Why not emoji? iOS Simulator 26+ has a bug where emoji renders as "?".
 * Why not Unicode symbols? They look obscure and unprofessional.
 * Why not icon libraries? This is a library — zero runtime dependencies.
 *
 * These icons are built purely from React Native View components,
 * rendering identically on every platform and screen size.
 */

import { View } from 'react-native';

// ─── Mic Icon (pill + stem + base) ────────────────────────────
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function MicIcon({
  size = 20,
  color = '#fff'
}) {
  const pillW = size * 0.4;
  const pillH = size * 0.5;
  const stemW = size * 0.08;
  const stemH = size * 0.18;
  const baseW = size * 0.35;
  const arcW = size * 0.55;
  const arcH = size * 0.35;
  const arcBorder = size * 0.07;
  return /*#__PURE__*/_jsxs(View, {
    style: {
      width: size,
      height: size,
      alignItems: 'center',
      justifyContent: 'center'
    },
    children: [/*#__PURE__*/_jsx(View, {
      style: {
        width: pillW,
        height: pillH,
        borderRadius: pillW / 2,
        backgroundColor: color
      }
    }), /*#__PURE__*/_jsx(View, {
      style: {
        width: arcW,
        height: arcH,
        borderBottomLeftRadius: arcW / 2,
        borderBottomRightRadius: arcW / 2,
        borderWidth: arcBorder,
        borderTopWidth: 0,
        borderColor: color,
        marginTop: -(pillH * 0.3)
      }
    }), /*#__PURE__*/_jsx(View, {
      style: {
        width: stemW,
        height: stemH,
        backgroundColor: color,
        marginTop: -1
      }
    }), /*#__PURE__*/_jsx(View, {
      style: {
        width: baseW,
        height: stemW,
        backgroundColor: color,
        borderRadius: stemW / 2
      }
    })]
  });
}

// ─── Speaker Icon (cone + sound waves) ────────────────────────

export function SpeakerIcon({
  size = 20,
  color = '#fff',
  muted = false
}) {
  const bodyW = size * 0.25;
  const bodyH = size * 0.3;
  const coneW = size * 0.2;
  return /*#__PURE__*/_jsxs(View, {
    style: {
      width: size,
      height: size,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row'
    },
    children: [/*#__PURE__*/_jsx(View, {
      style: {
        width: bodyW,
        height: bodyH,
        backgroundColor: color,
        borderRadius: size * 0.03
      }
    }), /*#__PURE__*/_jsx(View, {
      style: {
        width: 0,
        height: 0,
        borderTopWidth: size * 0.25,
        borderTopColor: 'transparent',
        borderBottomWidth: size * 0.25,
        borderBottomColor: 'transparent',
        borderLeftWidth: coneW,
        borderLeftColor: color,
        marginLeft: -1
      }
    }), muted ?
    /*#__PURE__*/
    /* Mute slash */
    _jsx(View, {
      style: {
        position: 'absolute',
        width: size * 0.08,
        height: size * 0.8,
        backgroundColor: color,
        borderRadius: size * 0.04,
        transform: [{
          rotate: '45deg'
        }]
      }
    }) :
    /*#__PURE__*/
    /* Sound waves */
    _jsx(View, {
      style: {
        marginLeft: size * 0.05
      },
      children: /*#__PURE__*/_jsx(View, {
        style: {
          width: size * 0.15,
          height: size * 0.3,
          borderWidth: size * 0.05,
          borderColor: color,
          borderLeftWidth: 0,
          borderTopLeftRadius: 0,
          borderBottomLeftRadius: 0,
          borderTopRightRadius: size * 0.15,
          borderBottomRightRadius: size * 0.15
        }
      })
    })]
  });
}

// ─── Send Arrow (upward arrow) ────────────────────────────────

export function SendArrowIcon({
  size = 18,
  color = '#fff'
}) {
  // Filled right-pointing triangle (like iOS Messages send button)
  const triH = size * 0.55;
  return /*#__PURE__*/_jsx(View, {
    style: {
      width: size,
      height: size,
      alignItems: 'center',
      justifyContent: 'center'
    },
    children: /*#__PURE__*/_jsx(View, {
      style: {
        width: 0,
        height: 0,
        borderTopWidth: triH / 2,
        borderTopColor: 'transparent',
        borderBottomWidth: triH / 2,
        borderBottomColor: 'transparent',
        borderLeftWidth: triH * 0.85,
        borderLeftColor: color,
        marginLeft: size * 0.1
      }
    })
  });
}

// ─── Stop Icon (filled square) ────────────────────────────────

export function StopIcon({
  size = 18,
  color = '#fff'
}) {
  const sq = size * 0.45;
  return /*#__PURE__*/_jsx(View, {
    style: {
      width: size,
      height: size,
      alignItems: 'center',
      justifyContent: 'center'
    },
    children: /*#__PURE__*/_jsx(View, {
      style: {
        width: sq,
        height: sq,
        backgroundColor: color,
        borderRadius: size * 0.05
      }
    })
  });
}

// ─── Recording Dot (pulsing filled circle) ────────────────────

export function RecordingDot({
  size = 18,
  color = '#FF3B30'
}) {
  const dotSize = size * 0.45;
  return /*#__PURE__*/_jsx(View, {
    style: {
      width: size,
      height: size,
      alignItems: 'center',
      justifyContent: 'center'
    },
    children: /*#__PURE__*/_jsx(View, {
      style: {
        width: dotSize,
        height: dotSize,
        borderRadius: dotSize / 2,
        backgroundColor: color
      }
    })
  });
}

// ─── Loading Spinner (three dots) ─────────────────────────────

export function LoadingDots({
  size = 18,
  color = '#fff'
}) {
  const dotSize = size * 0.15;
  return /*#__PURE__*/_jsx(View, {
    style: {
      width: size,
      height: size,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: dotSize * 0.8
    },
    children: [0.4, 0.7, 1].map((opacity, i) => /*#__PURE__*/_jsx(View, {
      style: {
        width: dotSize,
        height: dotSize,
        borderRadius: dotSize / 2,
        backgroundColor: color,
        opacity
      }
    }, i))
  });
}

// ─── Close / Dismiss (X mark) ─────────────────────────────────

export function CloseIcon({
  size = 14,
  color = 'rgba(255,255,255,0.6)'
}) {
  const barW = size * 0.7;
  const barH = size * 0.12;
  return /*#__PURE__*/_jsxs(View, {
    style: {
      width: size,
      height: size,
      alignItems: 'center',
      justifyContent: 'center'
    },
    children: [/*#__PURE__*/_jsx(View, {
      style: {
        position: 'absolute',
        width: barW,
        height: barH,
        backgroundColor: color,
        borderRadius: barH,
        transform: [{
          rotate: '45deg'
        }]
      }
    }), /*#__PURE__*/_jsx(View, {
      style: {
        position: 'absolute',
        width: barW,
        height: barH,
        backgroundColor: color,
        borderRadius: barH,
        transform: [{
          rotate: '-45deg'
        }]
      }
    })]
  });
}

// ─── AI Badge (for FAB) ───────────────────────────────────────

export function AIBadge({
  size = 28
}) {
  // Chat bubble — clean, universally represents AI assistant
  const bubbleW = size * 0.6;
  const bubbleH = size * 0.45;
  const tailSize = size * 0.12;
  return /*#__PURE__*/_jsxs(View, {
    style: {
      width: size,
      height: size,
      alignItems: 'center',
      justifyContent: 'center'
    },
    children: [/*#__PURE__*/_jsx(View, {
      style: {
        width: bubbleW,
        height: bubbleH,
        backgroundColor: '#fff',
        borderRadius: size * 0.12,
        marginBottom: tailSize * 0.5
      }
    }), /*#__PURE__*/_jsx(View, {
      style: {
        position: 'absolute',
        bottom: size * 0.18,
        left: size * 0.22,
        width: 0,
        height: 0,
        borderTopWidth: tailSize,
        borderTopColor: '#fff',
        borderRightWidth: tailSize,
        borderRightColor: 'transparent'
      }
    })]
  });
}
// ─── History Icon (clock face: circle + hour + minute hands) ──

export function HistoryIcon({
  size = 18,
  color = '#fff'
}) {
  const half = size / 2;
  const stroke = Math.max(1.5, size * 0.09);
  const ringSize = size * 0.9;
  const minuteLen = half * 0.72; // from center to 12 o'clock
  const hourLen = half * 0.52; // from center to 3 o'clock

  return /*#__PURE__*/_jsxs(View, {
    style: {
      width: size,
      height: size
    },
    children: [/*#__PURE__*/_jsx(View, {
      style: {
        position: 'absolute',
        width: ringSize,
        height: ringSize,
        borderRadius: ringSize / 2,
        borderWidth: stroke,
        borderColor: color,
        top: (size - ringSize) / 2,
        left: (size - ringSize) / 2
      }
    }), /*#__PURE__*/_jsx(View, {
      style: {
        position: 'absolute',
        width: stroke,
        height: minuteLen,
        backgroundColor: color,
        borderRadius: stroke,
        top: half - minuteLen,
        left: half - stroke / 2
      }
    }), /*#__PURE__*/_jsx(View, {
      style: {
        position: 'absolute',
        width: hourLen,
        height: stroke,
        backgroundColor: color,
        borderRadius: stroke,
        top: half - stroke / 2,
        left: half
      }
    }), /*#__PURE__*/_jsx(View, {
      style: {
        position: 'absolute',
        width: stroke * 2,
        height: stroke * 2,
        borderRadius: stroke,
        backgroundColor: color,
        top: half - stroke,
        left: half - stroke
      }
    })]
  });
}

// ─── New Chat Icon (chat bubble + plus) ───────────────────────

export function NewChatIcon({
  size = 18,
  color = '#fff'
}) {
  const stroke = size * 0.1;
  const armLen = size * 0.35;
  return /*#__PURE__*/_jsxs(View, {
    style: {
      width: size,
      height: size,
      alignItems: 'center',
      justifyContent: 'center'
    },
    children: [/*#__PURE__*/_jsx(View, {
      style: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: size * 0.72,
        height: size * 0.62,
        borderRadius: size * 0.15,
        borderWidth: stroke,
        borderColor: color
      }
    }), /*#__PURE__*/_jsx(View, {
      style: {
        position: 'absolute',
        bottom: size * 0.22,
        left: size * 0.1,
        width: 0,
        height: 0,
        borderTopWidth: size * 0.14,
        borderTopColor: color,
        borderRightWidth: size * 0.1,
        borderRightColor: 'transparent'
      }
    }), /*#__PURE__*/_jsx(View, {
      style: {
        position: 'absolute',
        top: size * 0.09,
        right: 0,
        width: armLen,
        height: stroke,
        backgroundColor: color,
        borderRadius: stroke
      }
    }), /*#__PURE__*/_jsx(View, {
      style: {
        position: 'absolute',
        top: size * 0.09 - armLen / 2 + stroke / 2,
        right: armLen / 2 - stroke / 2,
        width: stroke,
        height: armLen,
        backgroundColor: color,
        borderRadius: stroke
      }
    })]
  });
}
//# sourceMappingURL=Icons.js.map