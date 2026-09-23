export const Colors = {
  primary: "#006B5B",
  primaryLight: "#16B364",
  primarySoft: "#E8F7F1",

  white: "#FFFFFF",

  gradient: {
    primary: ["#1CA888", "#006B5B"] as const,
    soft: ["#EAF8F2", "#D8F0E7"] as const,
  },

  background: "#F8FAF9",
  surface: "#FFFFFF",

  textPrimary: "#17201D",
  textSecondary: "#66736E",

  border: "#E2E8E5",

  success: "#16B364",
  warning: "#F59E0B",
  error: "#DC2626",

  disabled: "#C1C9C4",
  disabledText: "#8E9993",
  disabledBackground: "#E8ECE9",

  pressed: {
    primary: "#005A4C",
    secondary: "#D1F5E4",
    destructive: "#B91C1C",
  },
} as const;
