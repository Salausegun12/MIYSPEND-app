import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import { Colors } from "../../constants/colors";
import { Shadows } from "../../constants/shadows";

interface IconContainerProps {
  children: React.ReactNode;
  size?: number;
  backgroundColor?: string;
  style?: ViewStyle;
  /** If true, uses a rounded square (squircle) instead of a circle */
  squircle?: boolean;
}

export function IconContainer({
  children,
  size = 40,
  backgroundColor = Colors.primarySoft,
  style,
  squircle = false,
}: IconContainerProps) {
  const borderRadius = squircle ? Math.round(size * 0.28) : size / 2;

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius,
          backgroundColor,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
});
