import React from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import { Colors } from "../../constants/colors";
import { Typography } from "../../constants/typography";
import { Spacing } from "../../constants/spacing";
import { Radius } from "../../constants/radius";
import { Shadows } from "../../constants/shadows";

interface EmptyStateProps {
  title: string;
  message?: string;
  icon?: React.ReactNode;
  style?: ViewStyle;
}

export function EmptyState({ title, message, icon, style }: EmptyStateProps) {
  return (
    <View style={[styles.container, style]}>
      {icon && <View style={styles.icon}>{icon}</View>}
      <Text style={styles.title}>{title}</Text>
      {message && <Text style={styles.message}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xxxl,
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
  },
  icon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: "#CDEFE1",
    ...Shadows.sm,
  },
  title: {
    ...Typography.h3,
    color: Colors.textPrimary,
    textAlign: "center",
    letterSpacing: -0.2,
  },
  message: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    textAlign: "center",
    maxWidth: 260,
  },
});
