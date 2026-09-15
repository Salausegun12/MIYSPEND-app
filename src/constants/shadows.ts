import { Platform } from "react-native";

const isAndroid = Platform.OS === "android";

export const Shadows = {
  sm: isAndroid
    ? { elevation: 1 }
    : {
        shadowColor: "#17201D",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
  md: isAndroid
    ? { elevation: 3 }
    : {
        shadowColor: "#17201D",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
      },
  lg: isAndroid
    ? { elevation: 6 }
    : {
        shadowColor: "#17201D",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
} as const;
