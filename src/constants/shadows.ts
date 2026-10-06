import { Platform } from "react-native";

const isAndroid = Platform.OS === "android";

const ambient = {
  shadowColor: "#0B1512",
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0.05,
  shadowRadius: 3,
};

const key = {
  shadowColor: "#0B1512",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.07,
  shadowRadius: 6,
};

export const Shadows = {
  none: isAndroid ? {} : { ...ambient, shadowOpacity: 0 },
  sm: isAndroid
    ? { elevation: 1 }
    : { ...ambient, shadowOpacity: 0.04, shadowRadius: 2 },
  md: isAndroid
    ? { elevation: 3 }
    : { ...key },
  lg: isAndroid
    ? { elevation: 6 }
    : {
        ...key,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.1,
        shadowRadius: 16,
      },
} as const;
