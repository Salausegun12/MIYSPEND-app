import { ViewStyle } from "react-native";

export const Pressed: Record<"default" | "subtle", ViewStyle> = {
  default: {
    opacity: 0.78,
    transform: [{ scale: 0.98 }],
  },
  subtle: {
    opacity: 0.72,
    transform: [{ scale: 0.99 }],
  },
};
