import React, { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../../constants/colors";
import { Radius } from "../../constants/radius";
import { Shadows } from "../../constants/shadows";
import { Spacing } from "../../constants/spacing";
import { Typography } from "../../constants/typography";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import type { PopupType } from "./Dialog";

export interface ToastConfig {
  id: number;
  message: string;
  type: PopupType;
}

const TYPE_VISUALS: Record<
  PopupType,
  { icon: "checkmark" | "close" | "warning" | "information"; color: string }
> = {
  success: { icon: "checkmark", color: Colors.success },
  error: { icon: "close", color: Colors.error },
  warning: { icon: "warning", color: Colors.warning },
  info: { icon: "information", color: Colors.primary },
};

interface ToastProps {
  config: ToastConfig | null;
  visible: boolean;
  onPress?: () => void;
}

export function Toast({ config, visible, onPress }: ToastProps) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-90)).current;
  const lastConfig = useRef<ToastConfig | null>(config);

  if (config) {
    lastConfig.current = config;
  }

  useEffect(() => {
    if (visible) {
      opacity.setValue(1);
      if (reducedMotion) {
        translateY.setValue(0);
        return;
      }
      translateY.setValue(-90);
      const animation = Animated.spring(translateY, {
        toValue: 0,
        friction: 7,
        tension: 90,
        useNativeDriver: true,
      });
      animation.start();
      return () => animation.stop();
    }

    if (reducedMotion) {
      opacity.setValue(0);
      return;
    }

    const animation = Animated.timing(translateY, {
      toValue: -90,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) opacity.setValue(0);
    });
    return () => animation.stop();
  }, [visible, reducedMotion, config?.id, opacity, translateY]);

  const active = config ?? lastConfig.current;
  if (!active) return null;

  const visuals = TYPE_VISUALS[active.type];

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrapper,
        { top: insets.top + Spacing.sm, opacity, transform: [{ translateY }] },
      ]}
    >
      <Pressable
        onPress={onPress}
        style={styles.card}
        accessibilityRole="alert"
        accessibilityLabel={active.message}
        accessibilityHint="Dismiss"
        hitSlop={4}
      >
        <View style={[styles.badge, { backgroundColor: visuals.color }]}>
          <Ionicons name={visuals.icon} size={15} color={Colors.white} />
        </View>
        <Text style={styles.message}>{active.message}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: Spacing.base,
    right: Spacing.base,
    alignItems: "center",
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    maxWidth: "100%",
    backgroundColor: Colors.textPrimary,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.white + "1A",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
    ...Shadows.lg,
  },
  badge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  message: {
    ...Typography.bodySmall,
    color: Colors.white,
    fontWeight: "600",
    flexShrink: 1,
  },
});
