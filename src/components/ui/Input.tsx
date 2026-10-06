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
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.base,
    ...Typography.body,
    color: Colors.textPrimary,
  },
  inputFocused: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySoft + "30",
  },
  inputError: {
    borderColor: Colors.error,
  },
  inputDisabled: {
    backgroundColor: Colors.disabledBackground,
    color: Colors.disabledText,
  },
  errorText: {
    ...Typography.caption,
    color: Colors.error,
  },
});
