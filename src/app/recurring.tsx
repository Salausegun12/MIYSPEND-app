import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter, Href } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { SafeAreaView } from "react-native-safe-area-context";
import { AnimatedEntry } from "../components/ui/AnimatedEntry";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { IconContainer } from "../components/ui/IconContainer";
import { EmptyState } from "../components/ui/EmptyState";
import { Colors } from "../constants/colors";
import { Spacing } from "../constants/spacing";
import { Typography } from "../constants/typography";
import { Pressed } from "../constants/motion";
import {
  getAllRecurringTransactions,
  processDueRecurringTransactions,
  setRecurringActive,
} from "../database/recurring";
import { formatHistoryDate } from "../utils/date";
import { formatKoboAmount } from "../utils/money";
import type {
  RecurringFrequency,
  RecurringTransactionWithCategory,
} from "../types/database";

const FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

function formatDay(day: number | undefined): string {
  if (day === undefined) return "";
  const suffix =
    day % 100 >= 11 && day % 100 <= 13
      ? "th"
      : day % 10 === 1
        ? "st"
        : day % 10 === 2
          ? "nd"
          : day % 10 === 3
            ? "rd"
            : "th";
  return `${day}${suffix}`;
}

function RecurringCard({
  item,
  onToggleActive,
  toggling,
}: {
  item: RecurringTransactionWithCategory;
  onToggleActive: (item: RecurringTransactionWithCategory, active: boolean) => void;
  toggling: boolean;
}) {
  const router = useRouter();
  const isIncome = item.type === "income";
  const active = item.is_active === 1;

  return (
    <Pressable
      onPress={() =>
        router.push(`/recurring-form?id=${item.id}` as Href)
      }
      style={({ pressed }) => (pressed ? styles.pressed : undefined)}
      accessibilityRole="button"
      accessibilityLabel={`${item.description}, ${FREQUENCY_LABELS[item.frequency]}`}
    >
      <Card style={active ? styles.card : { ...styles.card, ...styles.cardPaused }}>
        <View style={styles.cardHeader}>
          <IconContainer
            size={40}
            backgroundColor={
              isIncome ? Colors.primarySoft : Colors.error + "14"
            }
          >
            <Ionicons
              name={isIncome ? "trending-up" : "trending-down"}
              size={18}
              color={isIncome ? Colors.success : Colors.error}
            />
          </IconContainer>

          <View style={styles.cardTitles}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.description}
            </Text>
            <Text style={styles.cardSubtitle} numberOfLines={1}>
              {FREQUENCY_LABELS[item.frequency]}
              {item.frequency === "monthly"
                ? ` · ${formatDay(item.anchor_day)} of month`
                : ""}
              {!isIncome && item.category_name ? ` · ${item.category_name}` : ""}
            </Text>
            <Text style={styles.cardNext} numberOfLines={1}>
              {active ? (
                <>
                  Next: {formatHistoryDate(item.next_occurrence)}
                  {item.end_date ? ` · ends ${formatHistoryDate(item.end_date)}` : ""}
                </>
              ) : (
                "Paused"
              )}
            </Text>
          </View>

          <View style={styles.cardRight}>
            <Text
              style={[
                styles.cardAmount,
                isIncome ? styles.amountIncome : styles.amountExpense,
              ]}
            >
              {formatKoboAmount(item.amount)}
            </Text>
            <Switch
              value={active}
              disabled={toggling}
              onValueChange={(value) => onToggleActive(item, value)}
              trackColor={{ false: Colors.disabled, true: Colors.primaryLight }}
              thumbColor={Colors.surface}
              accessibilityRole="switch"
              accessibilityLabel={`${active ? "Pause" : "Resume"} ${item.description}`}
              accessibilityState={{ checked: active, disabled: toggling }}
            />
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

export default function RecurringScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [items, setItems] = useState<RecurringTransactionWithCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      await processDueRecurringTransactions(db);
      setItems(await getAllRecurringTransactions(db));
    } catch (e) {
      console.warn("Failed to load recurring transactions:", e);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  async function handleToggleActive(
    item: RecurringTransactionWithCategory,
    active: boolean
  ) {
    if (togglingId !== null) return;
    setTogglingId(item.id);
    try {
      await setRecurringActive(db, item.id, active ? 1 : 0);
      setItems(await getAllRecurringTransactions(db));
    } catch (e) {
      console.warn("Failed to toggle recurring transaction:", e);
      Alert.alert("Error", "Could not update this recurring transaction.");
    } finally {
      setTogglingId(null);
    }
  }

  const activeCount = items.filter((i) => i.is_active === 1).length;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.closeButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
        >
          <Ionicons name="close" size={24} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Recurring</Text>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <AnimatedEntry delay={20}>
            <Card style={styles.infoCard}>
              <View style={styles.infoRow}>
                <IconContainer
                  size={36}
                  backgroundColor={Colors.primarySoft}
                >
                  <Ionicons
                    name="repeat"
                    size={18}
                    color={Colors.primary}
                  />
                </IconContainer>
                <Text style={styles.infoText}>
                  Income and expenses that repeat automatically. Each due
                  occurrence is recorded on this device when you open the app
                  — no bank connection needed.
                </Text>
              </View>
            </Card>
          </AnimatedEntry>

          {items.length > 0 && (
            <AnimatedEntry delay={40}>
              <Text style={styles.sectionLabel}>
                {activeCount} active{" · "}
                {items.length - activeCount} paused
              </Text>
            </AnimatedEntry>
          )}

          {items.length === 0 ? (
            <EmptyState
              title="No recurring transactions"
              message="Set up regular income like your salary, or recurring bills like rent and subscriptions, and MiySpend records them for you each time they're due."
              icon={
                <Ionicons name="repeat-outline" size={40} color={Colors.primary} />
              }
            />
          ) : (
            items.map((item, index) => (
              <AnimatedEntry key={item.id} delay={60 + index * 20}>
                <RecurringCard
                  item={item}
                  toggling={togglingId === item.id}
                  onToggleActive={handleToggleActive}
                />
              </AnimatedEntry>
            ))
          )}

          <AnimatedEntry delay={120}>
            <Button
              title="New Recurring"
              onPress={() => router.push("/recurring-form" as Href)}
            />
          </AnimatedEntry>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
  },
  closeButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
    marginLeft: Spacing.md,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.xl,
    gap: Spacing.base,
  },
  infoCard: {
    padding: Spacing.base,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  infoText: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    flex: 1,
  },
  sectionLabel: {
    ...Typography.label,
    color: Colors.textSecondary,
  },
  pressed: Pressed.default,
  card: {
    padding: Spacing.base,
  },
  cardPaused: {
    opacity: 0.7,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  cardTitles: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
  },
  cardSubtitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  cardNext: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  cardRight: {
    alignItems: "flex-end",
    gap: Spacing.xs,
  },
  cardAmount: {
    ...Typography.bodyMedium,
    fontWeight: "600",
  },
  amountIncome: {
    color: Colors.success,
  },
  amountExpense: {
    color: Colors.textPrimary,
  },
});