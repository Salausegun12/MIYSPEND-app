import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSQLiteContext } from "expo-sqlite";
import { Card } from "../components/ui/Card";
import { AnimatedEntry } from "../components/ui/AnimatedEntry";
import { Button } from "../components/ui/Button";
import { Colors } from "../constants/colors";
import { Radius } from "../constants/radius";
import { Typography } from "../constants/typography";
import { Spacing } from "../constants/spacing";
import {
  BACKUP_FORMAT_VERSION,
  buildBackupPayload,
  countBackupCollections,
  parseBackupJson,
  restoreBackup,
  BackupError,
} from "../database/backup";
import { getTodayString } from "../utils/date";
import {
  downloadBackupFile,
  BackupFileError,
} from "../utils/backupDownload";
import {
  pickBackupFile,
  BackupPickerError,
} from "../utils/backupPicker";
import type { MiySpendBackup } from "../types/database";

type PickedState =
  | { ok: true; payload: MiySpendBackup; name: string }
  | { ok: false; error: string }
  | null;

const COLLECTION_LABELS: Array<[keyof ReturnType<typeof countBackupCollections>, string]> = [
  ["expenses", "Expenses"],
  ["income", "Income entries"],
  ["categories", "Categories"],
  ["settings", "Settings"],
  ["budgets", "Budgets"],
  ["savingsGoals", "Savings goals"],
  ["contributions", "Contributions"],
  ["recurringTransactions", "Recurring schedules"],
];

export default function BackupScreen() {
  const router = useRouter();
  const db = useSQLiteContext();

  const [creating, setCreating] = useState(false);
  const [createFeedback, setCreateFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  const [picked, setPicked] = useState<PickedState>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreFeedback, setRestoreFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  const handleCreateBackup = async () => {
    setCreating(true);
    setCreateFeedback(null);
    try {
      const payload = await buildBackupPayload(db);
      const counts = countBackupCollections(payload);
      const json = JSON.stringify(payload, null, 2);
      await downloadBackupFile(
        json,
        `miyspend-backup-${getTodayString()}.json`
      );
      setCreateFeedback({
        tone: "success",
        message: `Backup shared: ${counts.expenses} expenses, ${counts.income} income entries, ${counts.categories} categories and more.`,
      });
    } catch (error) {
      console.warn("Backup creation failed:", error);
      setCreateFeedback({
        tone: "error",
        message:
          error instanceof BackupFileError
            ? error.message
            : "Unable to create the backup. Please try again.",
      });
    } finally {
      setCreating(false);
    }
  };

  const handlePickBackup = async () => {
    setPicked(null);
    setRestoreFeedback(null);
    try {
      const file = await pickBackupFile();
      if (file.cancelled) return;
      const result = parseBackupJson(file.text);
      if (!result.ok) {
        setPicked({ ok: false, error: result.error });
        return;
      }
      setPicked({ ok: true, payload: result.payload, name: file.name });
    } catch (error) {
      console.warn("Backup selection failed:", error);
      setPicked({
        ok: false,
        error:
          error instanceof BackupPickerError
            ? error.message
            : "The backup file could not be read.",
      });
    }
  };

  const handleRestore = async () => {
    if (!picked || !picked.ok) return;
    setRestoring(true);
    setRestoreFeedback(null);
    try {
      const counts = await restoreBackup(db, picked.payload);
      setPicked(null);
      setRestoreFeedback({
        tone: "success",
        message: `Backup restored: ${counts.expenses} expenses, ${counts.income} income entries, ${counts.categories} categories and more are now on this device.`,
      });
    } catch (error) {
      console.warn("Backup restore failed:", error);
      setRestoreFeedback({
        tone: "error",
        message:
          error instanceof BackupError
            ? error.message
            : "The backup could not be restored. Your existing data was left untouched.",
      });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <AnimatedEntry delay={40}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backButton}
            accessibilityLabel="Close backup"
            hitSlop={8}
          >
            <Ionicons name="close" size={24} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Backup & Restore</Text>
        </View>
      </AnimatedEntry>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Card style={styles.privacyCard}>
          <Ionicons
            name="cloud-offline-outline"
            size={18}
            color={Colors.primary}
          />
          <Text style={styles.privacyText}>
            Backups are created and restored entirely on this device. Nothing
            is uploaded — you choose where to save the file, and restoring only
            reads the file you select.
          </Text>
        </Card>

        <AnimatedEntry delay={80}>
          <Text style={styles.sectionLabel}>Create a backup</Text>
          <Card style={styles.card}>
            <Text style={styles.cardText}>
              Writes every local record into a single versioned
              ({BACKUP_FORMAT_VERSION}) file, then opens the share sheet so you
              can save it anywhere.
            </Text>
            <Button
              title="Create backup"
              onPress={handleCreateBackup}
              loading={creating}
            />
          </Card>
          {createFeedback && (
            <View
              style={[
                styles.feedback,
                createFeedback.tone === "success"
                  ? styles.feedbackSuccess
                  : styles.feedbackError,
              ]}
            >
              <Ionicons
                name={
                  createFeedback.tone === "success"
                    ? "checkmark-circle-outline"
                    : "alert-circle-outline"
                }
                size={18}
                color={
                  createFeedback.tone === "success"
                    ? Colors.success
                    : Colors.error
                }
              />
              <Text
                style={[
                  styles.feedbackText,
                  createFeedback.tone === "success"
                    ? styles.feedbackTextSuccess
                    : styles.feedbackTextError,
                ]}
              >
                {createFeedback.message}
              </Text>
            </View>
          )}
        </AnimatedEntry>

        <AnimatedEntry delay={120}>
          <Text style={styles.sectionLabel}>Restore from a backup</Text>
          <Card style={styles.card}>
            {!picked ? (
              <>
                <Text style={styles.cardText}>
                  Select the backup file you saved earlier. It is read and
                  checked on-device before anything changes.
                </Text>
                <Button
                  title="Choose backup file"
                  onPress={handlePickBackup}
                  variant="secondary"
                  loading={restoring}
                />
              </>
            ) : picked.ok ? (
              <PickedBackupReview
                payload={picked.payload}
                name={picked.name}
                restoring={restoring}
                onCancel={() => setPicked(null)}
                onRestore={handleRestore}
              />
            ) : (
              <View style={styles.errorBlock}>
                <Ionicons
                  name="alert-circle-outline"
                  size={20}
                  color={Colors.error}
                />
                <Text style={styles.errorText}>{picked.error}</Text>
                <Button
                  title="Choose a different file"
                  onPress={handlePickBackup}
                  variant="secondary"
                />
              </View>
            )}
          </Card>
          {restoreFeedback && (
            <View
              style={[
                styles.feedback,
                restoreFeedback.tone === "success"
                  ? styles.feedbackSuccess
                  : styles.feedbackError,
              ]}
              accessibilityLiveRegion="polite"
            >
              <Ionicons
                name={
                  restoreFeedback.tone === "success"
                    ? "checkmark-circle-outline"
                    : "alert-circle-outline"
                }
                size={18}
                color={
                  restoreFeedback.tone === "success"
                    ? Colors.success
                    : Colors.error
                }
              />
              <Text
                style={[
                  styles.feedbackText,
                  restoreFeedback.tone === "success"
                    ? styles.feedbackTextSuccess
                    : styles.feedbackTextError,
                ]}
              >
                {restoreFeedback.message}
              </Text>
            </View>
          )}
        </AnimatedEntry>
      </ScrollView>
    </SafeAreaView>
  );
}

function PickedBackupReview({
  payload,
  name,
  restoring,
  onCancel,
  onRestore,
}: {
  payload: MiySpendBackup;
  name: string;
  restoring: boolean;
  onCancel: () => void;
  onRestore: () => void;
}) {
  const counts = countBackupCollections(payload);
  let exportDate = "unknown date";
  if (typeof payload.exportedAt === "string" && payload.exportedAt) {
    const parsed = new Date(payload.exportedAt);
    if (!Number.isNaN(parsed.getTime())) {
      exportDate = parsed.toLocaleDateString();
    }
  }

  return (
    <View style={styles.review}>
      <View style={styles.fileRow}>
        <Ionicons name="document-text-outline" size={20} color={Colors.primary} />
        <Text style={styles.fileName} numberOfLines={2}>
          {name || "Backup file"}
        </Text>
      </View>
      <Text style={styles.fileDate}>Exported {exportDate}</Text>

      <View style={styles.warningCard}>
        <Ionicons
          name="warning-outline"
          size={20}
          color={Colors.error}
        />
        <Text style={styles.warningText}>
          Restoring replaces what is currently on this device. Every existing
          record will be deleted and this backup's records take their place.
          This cannot be undone.
        </Text>
      </View>

      <Text style={styles.contentsLabel}>The backup contains</Text>
      {COLLECTION_LABELS.map(([key, label]) => (
        <View style={styles.countRow} key={key}>
          <Text style={styles.countLabel}>{label}</Text>
          <Text style={styles.countValue}>{counts[key]}</Text>
        </View>
      ))}

      <View style={styles.buttonRow}>
        <View style={styles.buttonCell}>
          <Button
            title="Cancel"
            onPress={onCancel}
            variant="secondary"
            disabled={restoring}
          />
        </View>
        <View style={styles.buttonCell}>
          <Button
            title="Restore backup"
            onPress={onRestore}
            loading={restoring}
            disabled={restoring}
          />
        </View>
      </View>
    </View>
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
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
  },
  backButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
    marginLeft: Spacing.md,
  },
  content: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.base,
  },
  privacyCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    padding: Spacing.base,
  },
  privacyText: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    flex: 1,
  },
  sectionLabel: {
    ...Typography.label,
    color: Colors.textSecondary,
    marginBottom: -Spacing.xs,
  },
  card: {
    padding: Spacing.base,
    gap: Spacing.md,
  },
  cardText: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
  feedback: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    padding: Spacing.base,
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginTop: Spacing.sm,
  },
  feedbackSuccess: {
    backgroundColor: Colors.primarySoft,
    borderColor: Colors.primary,
  },
  feedbackError: {
    borderColor: Colors.error,
  },
  feedbackText: {
    ...Typography.bodySmall,
    flex: 1,
  },
  feedbackTextSuccess: {
    color: Colors.primary,
  },
  feedbackTextError: {
    color: Colors.error,
  },
  errorBlock: {
    gap: Spacing.md,
    alignItems: "flex-start",
  },
  errorText: {
    ...Typography.bodySmall,
    color: Colors.error,
  },
  review: {
    gap: Spacing.sm,
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  fileName: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
    flex: 1,
  },
  fileDate: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  warningCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    padding: Spacing.base,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.error,
    backgroundColor: Colors.error + "08",
  },
  warningText: {
    ...Typography.bodySmall,
    color: Colors.textPrimary,
    flex: 1,
  },
  contentsLabel: {
    ...Typography.label,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  countRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: Spacing.xs,
  },
  countLabel: {
    ...Typography.bodySmall,
    color: Colors.textPrimary,
  },
  countValue: {
    ...Typography.bodySmall,
    color: Colors.textPrimary,
    fontWeight: "600",
  },
  buttonRow: {
    flexDirection: "row",
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  buttonCell: {
    flex: 1,
  },
});