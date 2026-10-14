import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { AnimatedEntry } from "../components/ui/AnimatedEntry";
import { EmptyState } from "../components/ui/EmptyState";
import { Card } from "../components/ui/Card";
import { PhotoTile } from "../components/gallery/PhotoTile";
import { useExpenseGallery } from "../services/gallery/useExpenseGallery";
import type { GalleryPhoto } from "../services/gallery";
import { Colors } from "../constants/colors";
import { Radius } from "../constants/radius";
import { Typography } from "../constants/typography";
import { Spacing } from "../constants/spacing";
import { Pressed } from "../constants/motion";

const COLS = 3;
const GAP = Spacing.sm;

export default function GalleryScreen() {
  const router = useRouter();
  const { photos, loading, failed, reload } = useExpenseGallery();
  const { width } = useWindowDimensions();
  const pad = Spacing.base * 2;
  const tileSize = Math.floor((width - pad - GAP * (COLS - 1)) / COLS);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  const openPhoto = useCallback(
    (photo: GalleryPhoto) => {
      router.push(
        `/photo-viewer?id=${photo.id}&uri=${encodeURIComponent(photo.uri)}` as Href
      );
    },
    [router]
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <AnimatedEntry delay={20}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backButton}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close receipt gallery"
          >
            <Ionicons name="close" size={24} color={Colors.textPrimary} />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>Receipt gallery</Text>
            <Text style={styles.headerSubtitle}>
              Last 28 days · newest first
            </Text>
          </View>
        </View>
      </AnimatedEntry>

      {loading ? (
        <View style={styles.statusWrap}>
          <Card style={styles.statusCard}>
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.statusText}>Loading receipts...</Text>
            </View>
          </Card>
        </View>
      ) : failed ? (
        <View style={styles.statusWrap}>
          <Card style={styles.statusCard}>
            <Text style={styles.errorText}>
              The receipt gallery could not be loaded.
            </Text>
            <Pressable
              onPress={() => void reload()}
              style={({ pressed }) => [styles.retry, pressed && Pressed.default]}
              accessibilityRole="button"
              accessibilityLabel="Retry loading receipts"
            >
              <Ionicons name="refresh" size={16} color={Colors.primary} />
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </Card>
        </View>
      ) : photos.length === 0 ? (
        <EmptyState
          title="No receipts yet"
          message="Attach a photo to an expense and it will appear here for the next 28 days."
          icon={
            <Ionicons name="images-outline" size={48} color={Colors.primary} />
          }
        />
      ) : (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.grid}>
            {photos.map((photo) => (
              <PhotoTile
                key={photo.id}
                photo={photo}
                size={tileSize}
                onPress={() => openPhoto(photo)}
              />
            ))}
          </View>
          <Text style={styles.offlineNote}>
            Receipts stay on your device and are never uploaded.
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.base,
    paddingBottom: Spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  headerTitle: {
    ...Typography.h2,
    color: Colors.textPrimary,
  },
  headerSubtitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  content: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.xxxl,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GAP,
  },
  statusWrap: {
    paddingHorizontal: Spacing.base,
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
  errorText: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    textAlign: "center",
    paddingVertical: Spacing.sm,
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
  offlineNote: {
    ...Typography.caption,
    color: Colors.textTertiary,
    textAlign: "center",
    paddingTop: Spacing.lg,
  },
});