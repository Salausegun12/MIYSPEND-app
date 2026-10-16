import React, { useState } from "react";
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  TextInputProps,
  ViewStyle,
} from "react-native";
import { Colors } from "../../constants/colors";
import { Radius } from "../../constants/radius";
import { Typography } from "../../constants/typography";
import { Spacing } from "../../constants/spacing";

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
}

export function Input({
  label,
  error,
  style,
  onFocus,
  onBlur,
  ...props
}: InputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrapper}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        style={[
          styles.input,
          focused && styles.inputFocused,
          error ? styles.inputError : null,
          props.editable === false && styles.inputDisabled,
          style,
        ]}
        placeholderTextColor={Colors.textSecondary}
        selectionColor={Colors.primary}
        accessibilityLabel={props.accessibilityLabel ?? label}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        {...props}
      />
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: Spacing.xs,
  },
  label: {
    ...Typography.label,
    color: Colors.textPrimary,
    fontFamily: "Poppins_600SemiBold",
    letterSpacing: 0.2,
  },
  input: {
    height: 54,
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    borderRadius: Radius.lg + 2,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.base,
    ...Typography.body,
    color: Colors.textPrimary,
  },
  inputFocused: {
    borderColor: Colors.primary,
    borderWidth: 2,
    backgroundColor: Colors.primarySoft + "40",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 2,
  },
  inputError: {
    borderColor: Colors.error,
    borderWidth: 2,
    backgroundColor: Colors.errorSoft + "40",
  },
  inputDisabled: {
    backgroundColor: Colors.disabledBackground,
    color: Colors.disabledText,
    borderColor: Colors.border,
  },
  errorText: {
    ...Typography.caption,
    color: Colors.error,
    fontFamily: "Poppins_600SemiBold",
  },
});
