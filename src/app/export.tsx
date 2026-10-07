import React, { useEffect, useState } from "react";
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
import { IconContainer } from "../components/ui/IconContainer";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { Colors } from "../constants/colors";
import { Radius } from "../constants/radius";
import { Typography } from "../constants/typography";
import { Spacing } from "../constants/spacing";
import { buildExportReport } from "../database/export";
import { formatKoboAmount } from "../utils/money";
import { getTodayString } from "../utils/date";
import { downloadCsvReport, CsvExportError } from "../utils/csvDownload";
import {
  downloadSpendingReport,
  ReportDownloadError,
} from "../utils/reportDownload";
import type { ExportReport } from "../types/database";

export default function ExportScreen() {
  const router = useRouter();
  const db = useSQLiteContext();

  const [report, setReport] = useState<ExportReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [format, setFormat] = useState<"csv" | "pdf" | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const built = await buildExportReport(db);
        if (!cancelled) setReport(built);
      } catch (e) {
        console.warn("Failed to load export data:", e);
        if (!cancelled) {
          setLoadError("Your data could not be read. Please try again.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [db]);

  const handleExportCsv = async () => {
    if (!report) return;
    setFormat("csv");
    setFeedback(null);
    try {
      await downloadCsvReport(
        report.csv,
        `miyspend-data-${getTodayString()}.csv`
      );
      setFeedback({
        tone: "success",
        message: "CSV export shared. The file stays on your device.",
      });
    } catch (error) {
      console.warn("CSV export failed:", error);
      setFeedback({
        tone: "error",
        message:
          error instanceof CsvExportError
            ? error.message
            : "Unable to export the CSV. Please try again.",
      });
    } finally {
      setFormat(null);
    }
  };

  const handleExportPdf = async () => {
    if (!report) return;
    setFormat("pdf");
    setFeedback(null);
    try {
      await downloadSpendingReport(
        report.pdfHtml,
        `miyspend-data-${getTodayString()}.pdf`
      );
      setFeedback({
        tone: "success",
        message: "PDF report shared. The file stays on your device.",
      });
    } catch (error) {
      console.warn("PDF export failed:", error);
      setFeedback({
        tone: "error",
        message:
          error instanceof ReportDownloadError
            ? error.message
            : "Unable to export the PDF. Please try again.",
      });
    } finally {
      setFormat(null);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backButton}
            accessibilityLabel="Close export"
            hitSlop={8}
          >
            <Ionicons name="close" size={24} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Export Data</Text>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (loadError || !report) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backButton}
            accessibilityLabel="Close export"
            hitSlop={8}
          >
            <Ionicons name="close" size={24} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Export Data</Text>
        </View>
        <View style={styles.centered}>
          <EmptyState
            title="Could not prepare your export"
            message={loadError ?? "Please try again."}
            icon={
              <Ionicons
                name="alert-circle-outline"
                size={48}
                color={Colors.error}
              />
            }
          />
        </View>
      </SafeAreaView>
    );
  }

  const { summary } = report;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <AnimatedEntry delay={40}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backButton}
            accessibilityLabel="Close export"
            hitSlop={8}
          >
            <Ionicons name="close" size={24} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Export Data</Text>
        </View>
      </AnimatedEntry>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Card style={styles.privacyCard}>
          <Ionicons
            name="lock-closed-outline"
            size={18}
            color={Colors.primary}
          />
          <Text style={styles.privacyText}>
            Generated entirely on your device. Nothing is uploaded and no
            server is involved — the file is shared through your OS picker.
          </Text>
        </Card>

        <View style={styles.summaryRow}>
          <AnimatedEntry delay={80} style={styles.summaryCell}>
            <Card style={styles.summaryCard}>
              <Ionicons
                name="arrow-down-circle-outline"
                size={22}
                color={Colors.success}
              />
              <Text style={styles.summaryLabel}>Income</Text>
              <Text style={styles.summaryValue}>
                {formatKoboAmount(summary.income)}
              </Text>
            </Card>
          </AnimatedEntry>
          <AnimatedEntry delay={120} style={styles.summaryCell}>
            <Card style={styles.summaryCard}>
              <Ionicons
                name="arrow-up-circle-outline"
                size={22}
                color={Colors.error}
              />
              <Text style={styles.summaryLabel}>Expenses</Text>
              <Text style={styles.summaryValue}>
                {formatKoboAmount(summary.expenses)}
              </Text>
            </Card>
          </AnimatedEntry>
        </View>

        <AnimatedEntry delay={160}>
          <Card style={styles.summaryCard}>
            <Ionicons
              name="wallet-outline"
              size={22}
              color={Colors.primary}
            />
            <Text style={styles.summaryLabel}>Net</Text>
            <Text
              style={[
                styles.summaryValue,
                summary.net < 0 && { color: Colors.error },
                summary.net > 0 && { color: Colors.success },
              ]}
            >
              {formatKoboAmount(summary.net)}
            </Text>
            <Text style={styles.summaryCount}>
              {summary.transactionCount} transaction
              {summary.transactionCount === 1 ? "" : "s"}
            </Text>
          </Card>
        </AnimatedEntry>

        <AnimatedEntry delay={200}>
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Top categories</Text>
            <Card style={styles.listCard}>
              {summary.categories.length === 0 ? (
                <Text style={styles.listEmpty}>No expenses recorded.</Text>
              ) : (
                summary.categories.slice(0, 5).map((total, index) => (
                  <React.Fragment
                    key={total.categoryId}
                  >
                    {index > 0 && <View style={styles.divider} />}
                    <View style={styles.listRow}>
                      <IconContainer
                        size={34}
                        backgroundColor={total.color + "20"}
                      >
                        <Text style={styles.listEmoji}>{total.icon}</Text>
                      </IconContainer>
                      <View style={styles.listInfo}>
                        <Text style={styles.listTitle}>{total.name}</Text>
                        <Text style={styles.listSubtitle}>
                          {total.count} transaction{total.count === 1 ? "" : "s"}
                        </Text>
                      </View>
                      <Text style={styles.listAmount}>
                        {formatKoboAmount(total.total)}
                      </Text>
                    </View>
                  </React.Fragment>
                ))
              )}
            </Card>
          </View>
        </AnimatedEntry>

        <AnimatedEntry delay={240}>
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Top income sources</Text>
            <Card style={styles.listCard}>
              {summary.sources.length === 0 ? (
                <Text style={styles.listEmpty}>No income recorded.</Text>
              ) : (
                summary.sources.slice(0, 5).map((total, index) => (
                  <React.Fragment key={total.source}>
                    {index > 0 && <View style={styles.divider} />}
                    <View style={styles.listRow}>
                      <IconContainer
                        size={34}
                        backgroundColor={Colors.primarySoft}
                      >
                        <Ionicons
                          name="trending-up-outline"
                          size={17}
                          color={Colors.primary}
                        />
                      </IconContainer>
                      <View style={styles.listInfo}>
                        <Text style={styles.listTitle}>{total.source}</Text>
                        <Text style={styles.listSubtitle}>
                          {total.count} transaction{total.count === 1 ? "" : "s"}
                        </Text>
                      </View>
                      <Text style={styles.listAmount}>
                        {formatKoboAmount(total.total)}
                      </Text>
                    </View>
                  </React.Fragment>
                ))
              )}
            </Card>
          </View>
        </AnimatedEntry>

        <AnimatedEntry delay={280}>
          <Button
            title="Export CSV"
            onPress={handleExportCsv}
            loading={format === "csv"}
            disabled={format !== null}
          />
          <View style={styles.buttonGap} />
          <Button
            title="Export PDF report"
            onPress={handleExportPdf}
            loading={format === "pdf"}
            disabled={format !== null}
            variant="secondary"
          />
        </AnimatedEntry>

        {feedback && (
          <AnimatedEntry delay={40}>
            <View
              style={[
                styles.feedback,
                feedback.tone === "success"
                  ? styles.feedbackSuccess
                  : styles.feedbackError,
              ]}
              accessibilityLiveRegion="polite"
            >
              <Ionicons
                name={
                  feedback.tone === "success"
                    ? "checkmark-circle-outline"
                    : "alert-circle-outline"
                }
                size={18}
                color={
                  feedback.tone === "success" ? Colors.success : Colors.error
                }
              />
              <Text
                style={[
                  styles.feedbackText,
                  feedback.tone === "success"
                    ? styles.feedbackTextSuccess
                    : styles.feedbackTextError,
                ]}
              >
                {feedback.message}
              </Text>
            </View>
          </AnimatedEntry>
        )}

        <Text style={styles.exportNote}>
          {report.transactions.length > 0
            ? `The export contains all ${summary.transactionCount} locally recorded transaction${
                summary.transactionCount === 1 ? "" : "s"
              }, dated ${report.transactions[report.transactions.length - 1].date.substring(
                0,
                10
              )} to ${report.transactions[0].date.substring(0, 10)}.`
            : "You have no recorded transactions yet. The exported file will contain only the summary."}
        </Text>
      </ScrollView>
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
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
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
  summaryRow: {
    flexDirection: "row",
    gap: Spacing.base,
  },
  summaryCell: {
    flex: 1,
  },
  summaryCard: {
    gap: Spacing.xs,
    alignItems: "flex-start",
  },
  summaryLabel: {
    ...Typography.label,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  summaryValue: {
    ...Typography.amountSmall,
    color: Colors.textPrimary,
  },
  summaryCount: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  section: {
    gap: Spacing.xs,
  },
  sectionLabel: {
    ...Typography.label,
    color: Colors.textSecondary,
  },
  listCard: {
    padding: Spacing.sm,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  listInfo: {
    flex: 1,
    gap: 2,
  },
  listTitle: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
  },
  listSubtitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  listAmount: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
    fontWeight: "600",
  },
  listEmoji: {
    fontSize: 16,
  },
  listEmpty: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    paddingVertical: Spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.xs,
  },
  buttonGap: {
    height: Spacing.md,
  },
  feedback: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    padding: Spacing.base,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  feedbackSuccess: {
    backgroundColor: Colors.primarySoft,
    borderColor: Colors.primary,
  },
  feedbackError: {
    backgroundColor: Colors.primarySoft + "00",
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
  exportNote: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textAlign: "center",
  },
});