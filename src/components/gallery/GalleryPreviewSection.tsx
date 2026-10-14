import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "../ui/Card";
import { IconContainer } from "../ui/IconContainer";
import { Colors } from "../../constants/colors";
import { Radius } from "../../constants/radius";
import { Typography } from "../../constants/typography";
import { Spacing } from "../../constants/spacing";
import { Pressed } from "../../constants/motion";
import {
  galleryPreview,
  type GalleryPhoto,
} from "../../services/gallery";
import { PhotoTile } from "./PhotoTile";

const COLS = 4;
const GAP = Spacing.sm;

interface GalleryPreviewSectionProps {
  photos: GalleryPhoto[];
  loading: boolean;
  failed: boolean;
  onOpenPhoto: (photo: GalleryPhoto) => void;
  onViewMore?: () => void;
  onRetry?: () => void;
  previewLimit?: number;
}

/**
 * The receipt gallery section shown at the bottom of the Reports screen: a
 * small thumbnail preview plus a clear "View more" entry point to the full
 * gallery. Reads only locally stored photos of the last 28 days, newest first.
 */
export function GalleryPreviewSection({
  photos,
  loading,
  failed,
  onOpenPhoto,
  onViewMore,
  onRetry,
  previewLimit = 8,
}: GalleryPreviewSectionProps) {
  const { width } = useWindowDimensions();
  const pad = Spacing.base * 2;
  const tileSize = Math.floor((width - pad - GAP * (COLS - 1)) / COLS);
  const { preview, hasMore } = galleryPreview(photos, previewLimit);

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <IconContainer size={44} backgroundColor={Colors.primarySoft}>
          <Ionicons name="images-outline" size={22} color={Colors.primary} />
        </IconContainer>
        <View style={styles.headerText}>
          <Text style={styles.title}>Receipt gallery</Text>
          <Text style={styles.subtitle}>
            Photos from your expenses · last 28 days · newest first
          </Text>
        </View>
      </View>

      {loading ? (
        <Card style={styles.statusCard}>
          <View style={styles.statusRow}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.statusText}>Loading receipts...</Text>
          </View>
        </Card>
      ) : failed ? (
        <Card style={styles.statusCard}>
          <Text style={styles.errorText}>
            The receipt gallery could not be loaded.
          </Text>
          {onRetry ? (
            <Pressable
              onPress={onRetry}
              style={({ pressed }) => [styles.retry, pressed && Pressed.default]}
              accessibilityRole="button"
              accessibilityLabel="Retry loading receipts"
            >
              <Ionicons name="refresh" size={16} color={Colors.primary} />
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          ) : null}
        </Card>
      ) : preview.length === 0 ? (
        <Card style={styles.statusCard}>
          <Text style={styles.emptyText}>
            Attach a photo to an expense and it will appear here for the next 28
            days.
          </Text>
        </Card>
      ) : (
        <>
          <View style={styles.grid}>
            {preview.map((photo) => (
              <PhotoTile
                key={photo.id}
                photo={photo}
                size={tileSize}
                onPress={() => onOpenPhoto(photo)}
              />
            ))}
          </View>

          {hasMore && onViewMore ? (
            <Pressable
              onPress={onViewMore}
              style={({ pressed }) => [styles.viewMore, pressed && Pressed.default]}
              accessibilityRole="button"
              accessibilityLabel={`View all ${photos.length} receipts`}
            >
              <Text style={styles.viewMoreText}>
                View more ({photos.length})
              </Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
            </Pressable>
          ) : null}
        </>
      )}

      <Text style={styles.offlineNote}>
        Receipts stay on your device and are never included in report downloads.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  headerText: {
    flex: 1,
    gap: Spacing.xs,
  },
  title: {
    ...Typography.h3,
    color: Colors.textPrimary,
  },
  subtitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  statusCard: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  statusText: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
  emptyText: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    textAlign: "center",
    paddingVertical: Spacing.sm,
  },
  errorText: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  retry: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.primarySoft,
    borderRadius: Radius.xl,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  retryText: {
    ...Typography.caption,
    color: Colors.primary,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GAP,
  },
  viewMore: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.primarySoft,
    borderRadius: Radius.xl,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  viewMoreText: {
    ...Typography.label,
    color: Colors.primary,
  },
  offlineNote: {
    ...Typography.caption,
    color: Colors.textTertiary,
    paddingHorizontal: Spacing.xs,
  },
});