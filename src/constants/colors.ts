export const Colors = {
  primary: "#006B5B",
  primaryLight: "#16B364",
  primarySoft: "#E8F7F1",
  primaryMid: "#00856F",

  white: "#FFFFFF",

  gradient: {
    primary: ["#1CA888", "#006B5B"] as const,
    soft: ["#EAF8F2", "#D8F0E7"] as const,
    hero: ["#00856F", "#312E81"] as const,
    card: ["#F0FAF6", "#E4F5EE"] as const,

    // Money semantics
    mint: ["#34D399", "#059669"] as const, // income / savings in
    sunset: ["#FF8A5B", "#F45B69"] as const, // spending out
    danger: ["#FB7185", "#DC2626"] as const, // destructive / over budget

    // Playful accents
    ocean: ["#38BDF8", "#3B82F6"] as const,
    violet: ["#A78BFA", "#7C3AED"] as const,
    candy: ["#F472B6", "#7C3AED"] as const,
    gold: ["#FCD34D", "#F59E0B"] as const,
    growth: ["#34D399", "#38BDF8"] as const, // progress fills
  },

  accent: {
    violet: "#7C3AED",
    violetSoft: "#F4EFFF",
    sky: "#0EA5E9",
    skySoft: "#E7F6FE",
    coral: "#F97316",
    coralSoft: "#FFF1E7",
    rose: "#F43F5E",
    roseSoft: "#FFE9EE",
    gold: "#D97706",
    goldSoft: "#FFF6DE",
  },

  background: "#F5F7F6",
  surface: "#FFFFFF",
  surfaceElevated: "#FAFCFB",

  textPrimary: "#17201D",
  textSecondary: "#66736E",
  textTertiary: "#9EADA8",

  border: "#E2E8E5",
  borderLight: "#EEF2F0",

  success: "#16B364",
  successSoft: "#EDFBF1",
  warning: "#F59E0B",
  warningSoft: "#FEF9EC",
  error: "#DC2626",
  errorSoft: "#FEF2F2",

  disabled: "#C1C9C4",
  disabledText: "#8E9993",
  disabledBackground: "#E8ECE9",

  pressed: {
    primary: "#005A4C",
    secondary: "#D1F5E4",
    destructive: "#B91C1C",
  },
} as const;
