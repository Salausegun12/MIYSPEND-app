import React from "react";
import { View, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { Colors } from "../../constants/colors";
import { Radius } from "../../constants/radius";
import { Shadows } from "../../constants/shadows";
import { Spacing } from "../../constants/spacing";

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function Card({ children, style }: CardProps) {
  return (
    <View style={[styles.cardOuter, style]}>
      <View style={styles.cardInner}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardOuter: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl + 2,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderTopColor: "rgba(255,255,255,0.9)",
    borderLeftColor: "rgba(255,255,255,0.9)",
    ...Shadows.md,
  },
  cardInner: {
    flex: 1,
  },
});
