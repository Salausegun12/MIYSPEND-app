import React, { useEffect, useMemo, useState } from "react";
import { Animated, LayoutChangeEvent, StyleSheet, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  Stop,
} from "react-native-svg";
import { Colors } from "../../constants/colors";

interface LineChartProps {
  data: number[];
  height?: number;
  color?: string;
  formatValue?: (value: number) => string;
  accessibilityLabel?: string;
}

export function LineChart({
  data,
  height = 64,
  color = Colors.primary,
  formatValue,
  accessibilityLabel,
}: LineChartProps) {
  const [width, setWidth] = useState(0);
  const [fade] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (width <= 0) return;
    Animated.timing(fade, {
      toValue: 1,
      duration: 450,
      useNativeDriver: true,
    }).start();
  }, [width, fade]);

  const maxValue = useMemo(() => Math.max(...data, 1), [data]);

  const handleLayout = (event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  };

  const padY = 6;
  const points = data.map((value, index) => ({
    x:
      data.length > 1 && width > 0
        ? (index / (data.length - 1)) * width
        : width / 2,
    y:
      height -
      padY -
      (value / maxValue) * (height - padY * 2),
  }));

  const linePath = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(
          1
        )}`
    )
    .join(" ");

  const areaPath =
    points.length > 1 && width > 0
      ? `${linePath} L ${width.toFixed(1)} ${height} L 0 ${height} Z`
      : "";

  const lastPoint = points[points.length - 1];
  const peakLabel =
    accessibilityLabel ??
    (formatValue
      ? `Daily values, peak ${formatValue(maxValue)}`
      : "Line chart");

  return (
    <View
      style={[styles.root, { height }]}
      onLayout={handleLayout}
      accessible
      accessibilityLabel={peakLabel}
    >
      {width > 0 && (
        <Animated.View style={{ opacity: fade }}>
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="lineChartFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.28} />
                <Stop offset="1" stopColor={color} stopOpacity={0.02} />
              </LinearGradient>
            </Defs>
            <Path
              d={`M 0 ${height - 0.5} L ${width} ${height - 0.5}`}
              stroke={Colors.borderLight}
              strokeWidth={1}
              fill="none"
            />
            {areaPath ? (
              <Path d={areaPath} fill="url(#lineChartFill)" />
            ) : null}
            {linePath ? (
              <Path
                d={linePath}
                stroke={color}
                strokeWidth={2}
                fill="none"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null}
            {lastPoint && data.length > 0 ? (
              <Circle
                cx={lastPoint.x}
                cy={lastPoint.y}
                r={3.5}
                fill={Colors.white}
                stroke={color}
                strokeWidth={2}
              />
            ) : null}
          </Svg>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
  },
});
