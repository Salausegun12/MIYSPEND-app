import React, { useEffect, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { Colors } from "../../constants/colors";
import { Radius } from "../../constants/radius";
import { Spacing } from "../../constants/spacing";
import { Typography } from "../../constants/typography";

export interface HBarItem {
  id: string;
  label: string;
  valueText: string;
  value: number;
  color?: string;
}

interface HBarChartProps {
  items: HBarItem[];
  formatValue: (value: number) => string;
}

const DEFAULT_COLORS = [Colors.primary, Colors.primaryMid, Colors.primaryLight];

export function HBarChart({ items, formatValue }: HBarChartProps) {
  const [fills, setFills] = useState<Animated.Value[]>([]);

  const itemsKey = items
    .map((item) => `${item.id}:${item.value}`)
    .join("|");
  const maxValue = Math.max(...items.map((item) => item.value), 1);

  useEffect(() => {
    const values = items.map(() => new Animated.Value(0));
    setFills(values);
    Animated.parallel(
      values.map((value, index) =>
        Animated.timing(value, {
          toValue: 1,
          duration: 480,
          delay: index * 90,
          useNativeDriver: false,
        })
      )
    ).start();
    return () => {
      values.forEach((value) => value.stopAnimation());
    };
    // itemsKey captures items identity; restarting on same content would flicker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey]);

  if (items.length === 0) return null;

  const fillWidth = (index: number, value: number) => {
    const pct =
      value <= 0 ? 0 : Math.max((value / maxValue) * 100, 4);
    const anim = fills[index];
    if (!anim || fills.length !== items.length) {
      return { width: `${pct}%` as `${number}%` };
    }
    return {
      width: anim.interpolate({
        inputRange: [0, 1],
        outputRange: ["0%", `${pct}%`],
      }),
    };
  };

  return (
    <View style={styles.root}>
      {items.map((item, index) => {
        const color =
          item.color ?? DEFAULT_COLORS[index] ?? Colors.primary;
        return (
          <View key={item.id} style={styles.row}>
            <View style={styles.rowHeader}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                <Text style={styles.rowLabel}>{item.label}</Text>
                {item.valueText ? ` · ${item.valueText}` : ""}
              </Text>
              <Text style={styles.rowAmount} numberOfLines={1}>
                {formatValue(item.value)}
              </Text>
            </View>
            <View style={styles.track}>
              <Animated.View
                style={[
                  styles.fill,
                  fillWidth(index, item.value),
                  { backgroundColor: color },
                ]}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
    gap: Spacing.md,
  },
  row: {
    gap: 6,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  rowTitle: {
    ...Typography.bodySmall,
    color: Colors.textPrimary,
    fontWeight: "700",
    flexShrink: 1,
  },
  rowLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  rowAmount: {
    ...Typography.bodySmall,
    color: Colors.textPrimary,
    fontWeight: "700",
  },
  track: {
    height: 8,
    backgroundColor: Colors.borderLight,
    borderRadius: 4,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: Radius.sm,
  },
});
