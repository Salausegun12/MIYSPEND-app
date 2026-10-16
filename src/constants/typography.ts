import { TextStyle } from "react-native";

const Poppins = {
  regular: "Poppins_400Regular",
  medium: "Poppins_500Medium",
  semiBold: "Poppins_600SemiBold",
  bold: "Poppins_700Bold",
};

export const Typography: Record<string, TextStyle> = {
  display: {
    fontFamily: Poppins.bold,
    fontSize: 36,
    lineHeight: 44,
    letterSpacing: -0.5,
  },
  h1: {
    fontFamily: Poppins.bold,
    fontSize: 28,
    lineHeight: 36,
    letterSpacing: -0.3,
  },
  h2: {
    fontFamily: Poppins.semiBold,
    fontSize: 22,
    lineHeight: 28,
  },
  h3: {
    fontFamily: Poppins.semiBold,
    fontSize: 18,
    lineHeight: 24,
  },
  body: {
    fontFamily: Poppins.regular,
    fontSize: 16,
    lineHeight: 24,
  },
  bodyMedium: {
    fontFamily: Poppins.medium,
    fontSize: 16,
    lineHeight: 24,
  },
  bodySmall: {
    fontFamily: Poppins.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  caption: {
    fontFamily: Poppins.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  label: {
    fontFamily: Poppins.medium,
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    fontFamily: Poppins.semiBold,
    fontSize: 16,
    lineHeight: 24,
  },
  amount: {
    fontFamily: Poppins.bold,
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -0.5,
  },
  amountSmall: {
    fontFamily: Poppins.semiBold,
    fontSize: 20,
    lineHeight: 28,
  },
};
