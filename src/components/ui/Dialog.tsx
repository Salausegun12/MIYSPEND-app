import React, { useEffect, useRef } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../constants/colors";
import { Radius } from "../../constants/radius";
import { Shadows } from "../../constants/shadows";
import { Spacing } from "../../constants/spacing";
import { Typography } from "../../constants/typography";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { Button } from "./Button";

export type PopupType = "success" | "error" | "warning" | "info";

export interface DialogButton {
  label: string;
  variant?: "primary" | "secondary" | "destructive";
  onPress?: () => void;
}

export interface DialogConfig {
  title: string;
  message?: string;
  type?: PopupType;
  buttons: DialogButton[];
}

const TYPE_VISUALS: Record<
  PopupType,
  { icon: "checkmark-circle" | "close-circle" | "warning" | "information-circle"; color: string; soft: string }
> = {
  success: { icon: "checkmark-circle", color: Colors.success, soft: Colors.successSoft },
  error: { icon: "close-circle", color: Colors.error, soft: Colors.errorSoft },
  warning: { icon: "warning", color: Colors.warning, soft: Colors.warningSoft },
  info: { icon: "information-circle", color: Colors.primary, soft: Colors.primarySoft },
};

interface DialogProps {
  config: DialogConfig | null;
  visible: boolean;
}

export function Dialog({ config, visible }: DialogProps) {
  const reducedMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.9)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  const lastConfig = useRef<DialogConfig | null>(config);

  if (config) {
    lastConfig.current = config;
  }

  useEffect(() => {
    if (visible) {
      if (reducedMotion) {
        opacity.setValue(1);
        scale.setValue(1);
        translateY.setValue(0);
        return;
      }

      const animation = Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          friction: 7,
          tension: 80,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 240,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]);
      animation.start();
      return () => animation.stop();
    }

    const animation = Animated.parallel([
      Animated.timing(scale, {
        toValue: 0.94,
        duration: 150,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 150,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [visible, reducedMotion, opacity, scale, translateY]);

  const active = config ?? lastConfig.current;

  useEffect(() => {
    if (visible && active) {
      AccessibilityInfo.announceForAccessibility(
        [active.title, active.message].filter(Boolean).join(". ")
      );
    }
  }, [visible, active]);

  if (!active) return null;

  const visuals = TYPE_VISUALS[active.type ?? "info"];
  const hasMessage = !!active.message;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.overlay, { opacity }]}
    >
      <Animated.View
        style={[
          styles.card,
          { transform: [{ scale }, { translateY }] },
        ]}
        accessibilityViewIsModal
        accessibilityRole="alert"
      >
        <View style={[styles.badge, { backgroundColor: visuals.soft }]}>
          <Ionicons name={visuals.icon} size={38} color={visuals.color} />
        </View>

        <Text style={styles.title} accessibilityRole="header">
          {active.title}
        </Text>
        {hasMessage ? <Text style={styles.message}>{active.message}</Text> : null}

        <View style={styles.actions}>
          {active.buttons.map((button, index) => (
            <Button
              key={`${button.label}-${index}`}
              title={button.label}
              variant={button.variant ?? "primary"}
              onPress={button.onPress ?? (() => {})}
              style={styles.actionButton}
            />
          ))}
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxl,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    paddingTop: Spacing.xxl + Spacing.xs,
    paddingBottom: Spacing.xl,
    paddingHorizontal: Spacing.xl,
    alignItems: "center",
    ...Shadows.lg,
  },
  badge: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  title: {
    ...Typography.h3,
    color: Colors.textPrimary,
    textAlign: "center",
  },
  message: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 21,
    marginTop: Spacing.sm,
  },
  actions: {
    flexDirection: "row",
    gap: Spacing.md,
    alignSelf: "stretch",
    marginTop: Spacing.xl,
  },
  actionButton: {
    flex: 1,
  },
});
