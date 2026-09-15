import React from "react";
import { Text, StyleSheet, TextStyle } from "react-native";
import { Colors } from "../../constants/colors";
import { Typography } from "../../constants/typography";

interface AmountTextProps {
  amount: number;
  currency?: string;
  small?: boolean;
  style?: TextStyle;
  textStyles?: TextStyle;
}

export function AmountText({
  amount,
  currency = "₦",
  small = false,
  style,
  textStyles,
}: AmountTextProps) {
  const formatted = amount.toLocaleString("en-NG");

  return (
    <Text
      style={[
        small ? styles.amountSmall : styles.amount,
        { color: Colors.textPrimary },
        textStyles,
      ]}
    >
      {currency}
      {formatted}
    </Text>
  );
}

const styles = StyleSheet.create({
  amount: {
    ...Typography.amount,
  },
  amountSmall: {
    ...Typography.amountSmall,
  },
});
