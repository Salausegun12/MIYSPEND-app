import { TextStyle } from "react-native";

const fontFamily = "System";

export const Typography: Record<string, TextStyle> = {
  display: {
    fontFamily,
    fontSize: 36,
    fontWeight: "700",
    lineHeight: 44,
    letterSpacing: -0.5,
  },
  h1: {
    fontFamily,
    fontSize: 28,
    fontWeight: "700",
    lineHeight: 36,
    letterSpacing: -0.3,
  },
  h2: {
    fontFamily,
    fontSize: 22,
    fontWeight: "600",
    lineHeight: 28,
  },
  h3: {
    fontFamily,
    fontSize: 18,
    fontWeight: "600",
    lineHeight: 24,
  },
  body: {
    fontFamily,
    fontSize: 16,
    fontWeight: "400",
    lineHeight: 24,
  },
  bodyMedium: {
    fontFamily,
    fontSize: 16,
    fontWeight: "500",
    lineHeight: 24,
  },
  bodySmall: {
    fontFamily,
    fontSize: 14,
    fontWeight: "400",
    lineHeight: 20,
  },
  caption: {
    fontFamily,
    fontSize: 12,
    fontWeight: "400",
    lineHeight: 16,
  },
  label: {
    fontFamily,
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
  },
  button: {
    fontFamily,
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 24,
  },
  amount: {
    fontFamily,
    fontSize: 32,
    fontWeight: "700",
    lineHeight: 40,
    letterSpacing: -0.5,
  },
  amountSmall: {
    fontFamily,
    fontSize: 20,
    fontWeight: "600",
    lineHeight: 28,
  },
};
