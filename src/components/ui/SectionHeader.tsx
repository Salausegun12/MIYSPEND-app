import React from "react";
import { View, Text, Pressable, StyleSheet, ViewStyle } from "react-native";
import { Colors } from "../../constants/colors";
import { Typography } from "../../constants/typography";
import { Spacing } from "../../constants/spacing";
import { Radius } from "../../constants/radius";
import { Pressed } from "../../constants/motion";

interface SectionHeaderProps {
  title: string;
  action?: string;
  onAction?: () => void;
  style?: ViewStyle;
}

export function SectionHeader({
  title,
  action,
  onAction,
  style,
}: SectionHeaderProps) {
  return (
    <View style={[styles.container, style]}>
      <Text style={styles.title}>{title}</Text>
      {action && (
        <Pressable
          onPress={onAction}
          disabled={!onAction}
          accessibilityRole="button"
          accessibilityLabel={action}
          hitSlop={8}
          style={({ pressed }) => [
            styles.actionContainer,
            pressed && styles.actionPressed,
          ]}
        >
          <Text style={styles.action}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  title: {
    ...Typography.h3,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
  },
  actionContainer: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.xl,
    backgroundColor: Colors.primarySoft,
  },
  action: {
    ...Typography.bodySmall,
    color: Colors.primary,
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
  },
  actionPressed: Pressed.default,
});
