import React, { useEffect, useMemo, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../constants/colors";
import { Radius } from "../../constants/radius";
import { Spacing } from "../../constants/spacing";
import { Typography } from "../../constants/typography";
import { IconContainer } from "../ui/IconContainer";

export interface PieChartItem {
  id: string;
  label: string;
  value: number;
  color: string;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
}

interface PieChartProps {
  data: PieChartItem[];
  total: number;
  centerLabel?: string;
  formatValue: (value: number) => string;
  size?: number;
  stroke?: number;
  showLegend?: boolean;
}

const GAP = 3;

export function PieChart({
  data,
  total,
  centerLabel = "Total",
  formatValue,
  size = 176,
  stroke = 26,
  showLegend = true,
}: PieChartProps) {
  const [scale] = useState(() => new Animated.Value(0.85));

  useEffect(() => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 7,
      tension: 70,
      useNativeDriver: true,
    }).start();
  }, []);

  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const gap = size >= 150 ? GAP : 2;

  const segments = useMemo(() => {
    let start = 0;
    return data.map((item) => {
      const raw = total > 0 ? (item.value / total) * circumference : 0;
      const segmentGap = data.length > 1 && raw > gap * 3 ? gap : 0;
      const segment = {
        item,
        start,
        length: raw > 0 ? Math.max(raw - segmentGap, 1) : 0,
      };
      start += raw;
      return segment;
    });
  }, [data, total, circumference, gap]);

  const centerFontSize = Math.max(11, Math.round(size / 8));

  return (
    <View style={[styles.root, showLegend && styles.rootWithLegend]}>
      <Animated.View
        style={[styles.donutWrap, { transform: [{ scale }] }]}
      >
        <Svg width={size} height={size}>
          <G rotation={-90} originX={size / 2} originY={size / 2}>
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={Colors.borderLight}
              strokeWidth={stroke}
              fill="none"
            />
            {segments.map(({ item, start, length }) => (
              <Circle
                key={item.id}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke={item.color}
                strokeWidth={stroke}
                fill="none"
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={circumference - start}
              />
            ))}
          </G>
        </Svg>
        <View style={styles.center} pointerEvents="none">
          <Text
            style={[styles.centerValue, { fontSize: centerFontSize }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {formatValue(total)}
          </Text>
          <Text
            style={[
              styles.centerLabel,
              size < 130 && styles.centerLabelSmall,
            ]}
            numberOfLines={1}
          >
            {centerLabel}
          </Text>
        </View>
      </Animated.View>

      {showLegend && (
        <View style={styles.legend}>
          {data.map((item) => {
            const pct =
              total > 0 ? Math.round((item.value / total) * 100) : 0;
            return (
              <View key={item.id} style={styles.legendRow}>
                <IconContainer
                  size={32}
                  backgroundColor={item.color + "20"}
                >
                  {item.icon ? (
                    <Ionicons
                      name={item.icon}
                      size={16}
                      color={item.color}
                    />
                  ) : (
                    <View
                      style={[
                        styles.legendSwatch,
                        { backgroundColor: item.color },
                      ]}
                    />
                  )}
                </IconContainer>
                <View style={styles.legendInfo}>
                  <Text style={styles.legendName} numberOfLines={1}>
                    {item.label}
                  </Text>
                  <Text style={styles.legendPct}>{pct}%</Text>
                </View>
                <Text style={styles.legendAmount} numberOfLines={1}>
                  {formatValue(item.value)}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
    alignItems: "center",
  },
  rootWithLegend: {
    gap: Spacing.base,
  },
  donutWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  center: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
    paddingHorizontal: Spacing.sm,
  },
  centerValue: {
    color: Colors.textPrimary,
    fontFamily: "Poppins_700Bold",
    letterSpacing: -0.3,
  },
  centerLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  centerLabelSmall: {
    fontSize: 9,
    lineHeight: 12,
  },
  legend: {
    width: "100%",
    gap: Spacing.md,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  legendInfo: {
    flex: 1,
    gap: 2,
  },
  legendName: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
    fontFamily: "Poppins_600SemiBold",
  },
  legendPct: {
    ...Typography.caption,
    color: Colors.textSecondary,
    fontFamily: "Poppins_600SemiBold",
  },
  legendAmount: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
    fontFamily: "Poppins_700Bold",
    textAlign: "right",
  },
  legendSwatch: {
    width: 14,
    height: 14,
    borderRadius: Radius.sm,
  },
});
