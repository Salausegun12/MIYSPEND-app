import React from "react";
import { Text, StyleSheet, TextStyle } from "react-native";
import { Colors } from "../../constants/colors";
import { Typography } from "../../constants/typography";
import { koboToNaira } from "../../utils/money";

interface AmountTextProps {
  amount: number; // amount in kobo
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
  const naira = koboToNaira(amount);
  const formatted = naira.toLocaleString("en-NG", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

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
