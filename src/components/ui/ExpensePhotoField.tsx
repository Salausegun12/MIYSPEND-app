import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../constants/colors";
import { Radius } from "../../constants/radius";
import { Typography } from "../../constants/typography";
import { Spacing } from "../../constants/spacing";
import { Pressed } from "../../constants/motion";
import { usePopup } from "../popup/PopupProvider";
import { useExpensePhoto } from "../../services/attachments/useExpensePhoto";
import type { AttachmentSource } from "../../services/attachments";
import { Button } from "./Button";

export interface ExpensePhotoFieldProps {
  /** Current photo URI, or null when none is attached. */
  photoUri: string | null;
  /**
   * Called with a temporary URI after the user picks a photo, or null when the
   * photo is removed. The screen owns the file lifecycle (persist on save,
   * delete on replace/remove).
   */
  onChange: (uri: string | null) => void;
  disabled?: boolean;
}

/**
 * Optional receipt photo picker shared by Add Expense and Edit Expense. The
 * photo is entirely optional and device-local; it is never uploaded.
 */
export function ExpensePhotoField({
  photoUri,
  onChange,
  disabled = false,
}: ExpensePhotoFieldProps) {
  const popup = usePopup();
  const { busy, pick } = useExpensePhoto();

  async function choose(source: AttachmentSource) {
    const result = await pick(source);
    if (result.status === "picked") {
      onChange(result.photo.uri);
    } else if (result.status === "error") {
      popup.error(result.error.message);
    }
  }

  const blocked = disabled || busy;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Photo (optional)</Text>

      {photoUri ? (
        <View style={styles.previewBlock}>
          <Image
            source={{ uri: photoUri }}
            style={styles.preview}
            resizeMode="cover"
            accessibilityLabel="Attached receipt photo"
          />
          <View style={styles.previewActions}>
            <Button
              title="Replace"
              variant="secondary"
              onPress={() => choose("library")}
              disabled={blocked}
              style={styles.previewButton}
            />
            <Button
              title="Remove"
              variant="secondary"
              onPress={() => onChange(null)}
              disabled={blocked}
              style={styles.previewButton}
            />
          </View>
        </View>
      ) : (
        <View style={styles.pickerBlock}>
          <View style={styles.pickerRow}>
            <Pressable
              onPress={() => choose("camera")}
              disabled={blocked}
              accessibilityRole="button"
              accessibilityLabel="Take a photo"
              style={({ pressed }) => [
                styles.tile,
                pressed && Pressed.subtle,
                blocked && styles.tileDisabled,
              ]}
            >
              <Ionicons name="camera-outline" size={22} color={Colors.primary} />
              <Text style={styles.tileLabel}>Take photo</Text>
            </Pressable>

            <Pressable
              onPress={() => choose("library")}
              disabled={blocked}
              accessibilityRole="button"
              accessibilityLabel="Choose a photo from your library"
              style={({ pressed }) => [
                styles.tile,
                pressed && Pressed.subtle,
                blocked && styles.tileDisabled,
              ]}
            >
              <Ionicons name="images-outline" size={22} color={Colors.primary} />
              <Text style={styles.tileLabel}>Choose photo</Text>
            </Pressable>
          </View>
          <Text style={styles.hint}>
            Stays on your device. Nothing is ever uploaded.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.xs,
  },
  label: {
    ...Typography.label,
    color: Colors.textPrimary,
  },
  pickerBlock: {
    gap: Spacing.sm,
  },
  pickerRow: {
    flexDirection: "row",
    gap: Spacing.base,
  },
  tile: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  tileDisabled: {
    opacity: 0.5,
  },
  tileLabel: {
    ...Typography.bodySmall,
    color: Colors.textPrimary,
  },
  hint: {
    ...Typography.caption,
    color: Colors.textTertiary,
  },
  previewBlock: {
    gap: Spacing.sm,
  },
  preview: {
    width: "100%",
    height: 180,
    borderRadius: Radius.xl,
    backgroundColor: Colors.surfaceElevated,
  },
  previewActions: {
    flexDirection: "row",
    gap: Spacing.base,
  },
  previewButton: {
    flex: 1,
  },
});
