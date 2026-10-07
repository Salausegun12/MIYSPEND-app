import React, { useEffect, useMemo, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Colors } from "../../constants/colors";
import { Radius } from "../../constants/radius";
import { Spacing } from "../../constants/spacing";
import { Typography } from "../../constants/typography";

export interface BarChartItem {
  id: string;
  label: string;
  subLabel?: string;
  value: number;
}

interface BarChartProps {
  data: BarChartItem[];
  activeId?: string;
  formatValue: (value: number) => string;
  plotHeight?: number;
  compact?: boolean;
  /** Active bar color. Defaults to the brand primary. */
  color?: string;
  /** Inactive bar color. Defaults to a lighter primary. */
  colorSoft?: string;
}

const MIN_BAR_HEIGHT = 4;

export function BarChart({
  data,
  activeId,
  formatValue,
  plotHeight,
  compact = false,
  color,
  colorSoft,
}: BarChartProps) {
  const plot = plotHeight ?? (compact ? 58 : 164);
  const maxValue = useMemo(
    () => Math.max(...data.map((d) => d.value), 1),
    [data]
  );

  const defaultIndex = useMemo(() => {
    if (data.length === 0) return -1;
    const activeIndex = activeId
      ? data.findIndex((d) => d.id === activeId)
      : -1;
    if (activeIndex >= 0) return activeIndex;
    let maxIndex = 0;
    data.forEach((item, index) => {
      if (item.value > data[maxIndex].value) maxIndex = index;
    });
    return maxIndex;
  }, [data, activeId]);

  const [selectedIndex, setSelectedIndex] = useState(defaultIndex);
  const [bars, setBars] = useState<Animated.Value[]>([]);

  const dataKey = data.map((item) => `${item.id}:${item.value}`).join("|");

  useEffect(() => {
    setSelectedIndex(defaultIndex);
  }, [defaultIndex]);

  useEffect(() => {
    const values = data.map(() => new Animated.Value(0));
    setBars(values);
    Animated.parallel(
      values.map((value, index) =>
        Animated.timing(value, {
          toValue: 1,
          duration: 420,
          delay: index * 50,
          useNativeDriver: false,
        })
      )
    ).start();
    return () => {
      values.forEach((value) => value.stopAnimation());
    };
    // dataKey captures data identity; restarting on same content would flicker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey]);

  const targetHeight = (value: number) =>
    value <= 0
      ? MIN_BAR_HEIGHT
      : Math.max((value / maxValue) * plot, MIN_BAR_HEIGHT);

  const barHeight = (index: number, value: number) => {
    const target = targetHeight(value);
    const anim = bars[index];
    if (!anim || bars.length !== data.length) return { height: target };
    return {
      height: anim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, target],
      }),
    };
  };

  const selected = selectedIndex >= 0 ? data[selectedIndex] : undefined;

  return (
    <View style={styles.root}>
      {!compact && (
        <View style={styles.readout}>
          <Text style={styles.readoutLabel} numberOfLines={1}>
            {selected
              ? `${selected.label}${
                  selected.subLabel ? `, ${selected.subLabel}` : ""
                }`
              : ""}
          </Text>
          <Text
            style={[
              styles.readoutValue,
              selected && selected.value === 0 && styles.readoutValueZero,
            ]}
            numberOfLines={1}
          >
            {formatValue(selected ? selected.value : 0)}
          </Text>
        </View>
      )}

      <View style={styles.plot}>
        {data.map((item, index) => {
          const isActive = index === selectedIndex;
          return (
            <Pressable
              key={item.id}
              style={styles.column}
              onPress={() => setSelectedIndex(index)}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${item.label}${
                item.subLabel ? `, ${item.subLabel}` : ""
              }, ${formatValue(item.value)}`}
            >
              <View style={[styles.track, { height: plot }]}>
                <Animated.View
                  style={[
                    styles.bar,
                    barHeight(index, item.value),
                    {
                      backgroundColor:
                        item.value === 0
                          ? Colors.disabled
                          : isActive
                          ? color ?? Colors.primary
                          : colorSoft ?? Colors.primaryLight,
                    },
                  ]}
                />
              </View>
              <Text
                style={[
                  styles.dayLabel,
                  compact && styles.dayLabelCompact,
                  isActive && styles.dayLabelActive,
                  isActive && color ? { color } : null,
                ]}
                numberOfLines={1}
              >
                {item.label}
              </Text>
              {!compact && item.subLabel ? (
                <Text style={styles.dateLabel} numberOfLines={1}>
                  {item.subLabel}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
  },
  readout: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  readoutLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    flexShrink: 1,
  },
  readoutValue: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
    fontWeight: "700",
  },
  readoutValueZero: {
    color: Colors.textTertiary,
    fontWeight: "600",
  },
  plot: {
    flexDirection: "row",
    gap: Spacing.xs,
    alignItems: "flex-end",
  },
  column: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  track: {
    width: "74%",
    alignSelf: "center",
    backgroundColor: Colors.borderLight,
    borderRadius: Radius.md,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  bar: {
    width: "100%",
    borderRadius: Radius.sm,
  },
  dayLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
    fontWeight: "600",
  },
  dayLabelCompact: {
    fontSize: 10,
    lineHeight: 12,
  },
  dayLabelActive: {
    color: Colors.primary,
    fontWeight: "700",
  },
  dateLabel: {
    fontSize: 10,
    lineHeight: 12,
    color: Colors.textTertiary,
    fontWeight: "500",
  },
});
