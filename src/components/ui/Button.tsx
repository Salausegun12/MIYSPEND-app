import React from "react";
import {
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from "react-native";
import { Colors } from "../../constants/colors";
import { Radius } from "../../constants/radius";
import { Shadows } from "../../constants/shadows";
import { Typography } from "../../constants/typography";
import { Spacing } from "../../constants/spacing";
import { haptics } from "../../utils/haptics";

type ButtonVariant = "primary" | "secondary" | "destructive";

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  style,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={() => {
        if (variant === "destructive") {
          haptics.press();
        } else {
          haptics.select();
        }
        onPress();
      }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && !isDisabled && styles.pressed,
        pressed && !isDisabled && styles[`${variant}Pressed`],
        isDisabled && styles.disabled,
        style,
      ]}
      android_ripple={{
        color:
          variant === "primary"
            ? Colors.white + "20"
            : variant === "destructive"
              ? Colors.white + "20"
              : Colors.primary + "20",
        borderless: false,
      }}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === "primary" ? Colors.surface : Colors.primary}
          size="small"
        />
      ) : (
        <Text
          style={[
            styles.text,
            variant === "secondary" && styles.textSecondary,
            variant === "destructive" && styles.textDestructive,
            isDisabled && styles.textDisabled,
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 52,
    borderRadius: Radius.lg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
  },
  primary: {
    backgroundColor: Colors.primary,
    ...Shadows.md,
  },
  primaryPressed: {
    backgroundColor: Colors.pressed.primary,
  },
  secondary: {
    backgroundColor: Colors.primarySoft,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  secondaryPressed: {
    backgroundColor: Colors.pressed.secondary,
  },
  destructive: {
    backgroundColor: Colors.error,
  },
  destructivePressed: {
    backgroundColor: Colors.pressed.destructive,
  },
  pressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    backgroundColor: Colors.disabledBackground,
    borderColor: Colors.disabled,
  },
  text: {
    ...Typography.button,
    color: Colors.surface,
  },
  textSecondary: {
    color: Colors.primary,
  },
  textDestructive: {
    color: Colors.surface,
  },
  textDisabled: {
    color: Colors.disabledText,
  },
});
