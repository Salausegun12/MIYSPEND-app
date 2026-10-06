import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import { Colors } from "../../constants/colors";
import { Radius } from "../../constants/radius";
import { Shadows } from "../../constants/shadows";
import { Spacing } from "../../constants/spacing";

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export function Card({ children, style }: CardProps) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.md,
  },
});
