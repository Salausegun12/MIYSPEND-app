import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSQLiteContext } from "expo-sqlite";
import { AnimatedEntry } from "../components/ui/AnimatedEntry";
import { Card } from "../components/ui/Card";
import { IconContainer } from "../components/ui/IconContainer";
import { Button } from "../components/ui/Button";
import { getExpenseById } from "../database/expenses";
import { formatKoboAmount } from "../utils/money";
import { formatHistoryDate } from "../utils/date";
import type { ExpenseWithCategory } from "../types/database";
import { Colors } from "../constants/colors";
import { Radius } from "../constants/radius";
import { Typography } from "../constants/typography";
import { Spacing } from "../constants/spacing";

export default function PhotoViewerScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const { id, uri } = useLocalSearchParams<{ id?: string; uri?: string }>();
  const expenseId = Number(id);
  const photoUri = typeof uri === "string" ? uri : "";

  const [expense, setExpense] = useState<ExpenseWithCategory | null | undefined>(
    undefined
  );
  const [imageBroken, setImageBroken] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setImageBroken(false);

    if (Number.isNaN(expenseId)) {
      setExpense(null);
      return;
    }

    setExpense(undefined);
    getExpenseById(db, expenseId)
      .then((row) => {
        if (!cancelled) setExpense(row);
      })
      .catch(() => {
        if (!cancelled) setExpense(null);
      });

    return () => {
      cancelled = true;
    };
  }, [db, expenseId]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <AnimatedEntry delay={20}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backButton}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close photo viewer"
          >
            <Ionicons
              name="close"
              size={24}
              color={Colors.textPrimary}
            />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>Receipt</Text>
            <Text style={styles.headerSubtitle}>Attached to an expense</Text>
          </View>
        </View>
      </AnimatedEntry>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {photoUri === "" ? (
          <Card style={styles.ph}>
            <Text style={styles.mutedText}>
              This receipt could not be found.
            </Text>
          </Card>
        ) : imageBroken ? (
          <Card style={styles.ph}>
            <Ionicons
              name="image-outline"
              size={40}
              color={Colors.textTertiary}
            />
            <Text style={styles.mutedText}>
              This photo file is no longer on your device.
            </Text>
          </Card>
        ) : (
          <AnimatedEntry delay={40}>
            <Pressable
              style={({ pressed }) => [
                styles.imageWrap,
                pressed && styles.imagePressed,
              ]}
              accessibilityRole="imagebutton"
              accessibilityLabel="Receipt photo"
            >
              <Ionicons
                name="search-outline"
                size={20}
                color="rgba(255,255,255,0.9)"
                style={styles.zoomHint}
              />
              <Image
                source={{ uri: photoUri }}
                style={styles.image}
                resizeMode="contain"
                onError={() => setImageBroken(true)}
              />
            </Pressable>
          </AnimatedEntry>
        )}

        {expense === undefined ? (
          <Card style={styles.detailsCard}>
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.mutedText}>Loading expense details...</Text>
            </View>
          </Card>
        ) : expense === null ? (
          <Card style={styles.detailsCard}>
            <Ionicons
              name="link-outline"
              size={24}
              color={Colors.textTertiary}
            />
            <Text style={styles.mutedText}>
              This receipt is no longer linked to an expense — it may have been
              deleted.
            </Text>
          </Card>
        ) : (
          <Card style={styles.detailsCard}>
            <Text style={styles.amount}>{formatKoboAmount(expense.amount)}</Text>
            {expense.description ? (
              <Text style={styles.description}>{expense.description}</Text>
            ) : null}

            <View style={styles.detailRow}>
              <IconContainer
                size={32}
                backgroundColor={expense.category_color + "20"}
              >
                <Text style={styles.categoryIcon}>{expense.category_icon}</Text>
              </IconContainer>
              <View style={styles.detailText}>
                <Text style={styles.detailLabel}>Category</Text>
                <Text style={styles.detailValue}>
                  {expense.category_name}
                </Text>
              </View>
            </View>

            <View style={styles.detailRow}>
              <IconContainer size={32} backgroundColor={Colors.primarySoft}>
                <Ionicons
                  name="calendar-outline"
                  size={16}
                  color={Colors.primary}
                />
              </IconContainer>
              <View style={styles.detailText}>
                <Text style={styles.detailLabel}>Date</Text>
                <Text style={styles.detailValue}>
                  {formatHistoryDate(expense.date)}
                </Text>
              </View>
            </View>

            <View style={styles.detailRow}>
              <IconContainer size={32} backgroundColor={Colors.accent.skySoft}>
                <Ionicons
                  name="card-outline"
                  size={16}
                  color={Colors.accent.sky}
                />
              </IconContainer>
              <View style={styles.detailText}>
                <Text style={styles.detailLabel}>Paid with</Text>
                <Text style={styles.detailValue}>
                  {expense.payment_method || "Not specified"}
                </Text>
              </View>
            </View>

            {expense.note ? (
              <View style={styles.detailRow}>
                <IconContainer
                  size={32}
                  backgroundColor={Colors.accent.goldSoft}
                >
                  <Ionicons
                    name="document-text-outline"
                    size={16}
                    color={Colors.accent.gold}
                  />
                </IconContainer>
                <View style={styles.detailText}>
                  <Text style={styles.detailLabel}>Note</Text>
                  <Text style={styles.detailValue}>{expense.note}</Text>
                </View>
              </View>
            ) : null}

            <Button
              title="Open expense"
              onPress={() =>
                router.push(
                  `/expense-detail?id=${expense.id}` as Href
                )
              }
              style={styles.openButton}
            />
          </Card>
        )}

        <Text style={styles.offlineNote}>
          Viewed from your device only. Receipts are never uploaded.
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
    gap: Spacing.base,
  },
  imageWrap: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: Radius.xl,
    backgroundColor: Colors.primary,
    overflow: "hidden",
  },
  imagePressed: {
    opacity: 0.95,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  zoomHint: {
    position: "absolute",
    top: Spacing.md,
    right: Spacing.md,
    zIndex: 1,
  },
  ph: {
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.xl,
  },
  detailsCard: {
    gap: Spacing.md,
    padding: Spacing.base,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  amount: {
    ...Typography.amount,
    color: Colors.textPrimary,
  },
  description: {
    ...Typography.body,
    color: Colors.textSecondary,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  detailText: {
    flex: 1,
    gap: 2,
  },
  detailLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  detailValue: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
  },
  categoryIcon: {
    fontSize: 16,
  },
  openButton: {
    marginTop: Spacing.sm,
  },
  mutedText: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  offlineNote: {
    ...Typography.caption,
    color: Colors.textTertiary,
    textAlign: "center",
  },
});