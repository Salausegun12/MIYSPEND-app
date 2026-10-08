import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useRouter, Href, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSQLiteContext } from "expo-sqlite";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card } from "../components/ui/Card";
import { AnimatedEntry } from "../components/ui/AnimatedEntry";
import { IconContainer } from "../components/ui/IconContainer";
import { EmptyState } from "../components/ui/EmptyState";
import { Colors } from "../constants/colors";
import { Radius } from "../constants/radius";
import { Typography } from "../constants/typography";
import { Spacing } from "../constants/spacing";
import { Pressed } from "../constants/motion";
import { INCOME_SOURCE_COLORS, INCOME_SOURCE_ICONS } from "../constants/income";
import { getIncomeByDateRange } from "../database/income";
import {
  getTodayString,
  getYesterdayString,
  getWeekStart,
  getWeekEnd,
  getLastWeekStart,
  getLastWeekEnd,
  getMonthStart,
  getMonthEnd,
  isToday,
  isYesterday,
  formatHistoryDate,
} from "../utils/date";
import { formatKoboAmount } from "../utils/money";
import type { Income, IncomeSource } from "../types/database";

type FilterKey = "today" | "yesterday" | "thisWeek" | "lastWeek" | "thisMonth";

interface FilterOption {
  key: FilterKey;
  label: string;
}

const FILTERS: FilterOption[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "thisWeek", label: "This Week" },
  { key: "lastWeek", label: "Last Week" },
  { key: "thisMonth", label: "This Month" },
];

interface DateGroup {
  dateKey: string;
  dateLabel: string;
  incomes: Income[];
  total: number;
}

// Income stores income_date as a plain YYYY-MM-DD string, so the range
// boundaries stay plain dates instead of the expense-style datetime bounds.
function getFilterDateRange(filter: FilterKey): { start: string; end: string } {
  switch (filter) {
    case "today": {
      const d = getTodayString();
      return { start: d, end: d };
    }
    case "yesterday": {
      const d = getYesterdayString();
      return { start: d, end: d };
    }
    case "thisWeek":
      return { start: getWeekStart(), end: getWeekEnd() };
    case "lastWeek":
      return { start: getLastWeekStart(), end: getLastWeekEnd() };
    case "thisMonth":
      return { start: getMonthStart(), end: getMonthEnd() };
  }
}

// Rows arrive newest first, so a Map preserves newest-group-first ordering.
function groupByDate(incomes: Income[]): DateGroup[] {
  const groups = new Map<string, Income[]>();

  for (const income of incomes) {
    const existing = groups.get(income.income_date);
    if (existing) {
      existing.push(income);
    } else {
      groups.set(income.income_date, [income]);
    }
  }

  return Array.from(groups.entries()).map(([dateKey, items]) => ({
    dateKey,
    dateLabel: isToday(dateKey)
      ? "TODAY"
      : isYesterday(dateKey)
        ? "YESTERDAY"
        : formatHistoryDate(dateKey),
    incomes: items,
    total: items.reduce((sum, i) => sum + i.amount, 0),
  }));
}

function formatTimeLabel(time: string): string {
  const [h, m] = time.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return time;
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

function sourceOf(income: Income): IncomeSource {
  return income.source as IncomeSource;
}

export default function IncomeHistoryScreen() {
  const router = useRouter();
  const db = useSQLiteContext();

  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("today");
  const [incomes, setIncomes] = useState<Income[]>([]);

  const loadData = useCallback(async () => {
    try {
      const range = getFilterDateRange(activeFilter);
      setIncomes(await getIncomeByDateRange(db, range.start, range.end));
    } catch (e) {
      console.warn("Failed to load income history:", e);
    } finally {
      setLoading(false);
    }
  }, [db, activeFilter]);

  // Re-runs whenever the screen regains focus, so a newly added, edited or
  // deleted income shows up as soon as the user returns from that flow.
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadData();
    }, [loadData])
  );

  const handleFilterChange = useCallback((filter: FilterKey) => {
    setActiveFilter(filter);
  }, []);

  const dateGroups = useMemo(() => groupByDate(incomes), [incomes]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <AnimatedEntry delay={40}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
          >
            <Ionicons name="close" size={24} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Income History</Text>
        </View>
      </AnimatedEntry>

      <View style={styles.filterBar}>
        <View style={styles.filterContent}>
          {FILTERS.map((filter) => {
            const active = activeFilter === filter.key;
            return (
              <Pressable
                key={filter.key}
                onPress={() => handleFilterChange(filter.key)}
                style={({ pressed }) => [
                  styles.filterChip,
                  active && styles.filterChipActive,
                  pressed && styles.filterChipPressed,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Filter income by ${filter.label}`}
              >
                <Text
                  style={[styles.filterLabel, active && styles.filterLabelActive]}
                >
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : incomes.length === 0 ? (
        <View style={styles.emptyContainer}>
          <EmptyState
            title="No income found"
            message="Income you record for this period will appear here."
            icon={
              <Ionicons
                name="trending-up-outline"
                size={48}
                color={Colors.primary}
              />
            }
          />
        </View>
      ) : (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {dateGroups.map((group) => (
            <View key={group.dateKey} style={styles.groupSection}>
              <View style={styles.groupHeader}>
                <Text style={styles.groupDateLabel}>{group.dateLabel}</Text>
                <Text style={styles.groupTotal}>
                  {formatKoboAmount(group.total)}
                </Text>
              </View>
              <Card style={styles.groupCard}>
                {group.incomes.map((income, index) => {
                  const source = sourceOf(income);
                  const color = INCOME_SOURCE_COLORS[source] ?? Colors.primary;
                  return (
                    <React.Fragment key={income.id}>
                      {index > 0 && <View style={styles.divider} />}
                      <Pressable
                        onPress={() =>
                          router.push(`/income-detail?id=${income.id}` as Href)
                        }
                        style={({ pressed }) => [
                          styles.incomeRow,
                          pressed && styles.incomeRowPressed,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`View ${source} income of ${formatKoboAmount(
                          income.amount
                        )}`}
                      >
                        <IconContainer
                          size={40}
                          backgroundColor={color + "20"}
                        >
                          <Ionicons
                            name={INCOME_SOURCE_ICONS[source] ?? "wallet-outline"}
                            size={18}
                            color={color}
                          />
                        </IconContainer>
                        <View style={styles.incomeInfo}>
                          <Text style={styles.incomeSource} numberOfLines={1}>
                            {source}
                          </Text>
                          {income.note ? (
                            <Text style={styles.incomeNote} numberOfLines={1}>
                              {income.note}
                            </Text>
                          ) : null}
                          <View style={styles.incomeMeta}>
                            <Text style={styles.incomePayment} numberOfLines={1}>
                              {income.payment_method}
                            </Text>
                            <Text style={styles.metaDot}> · </Text>
                            <Text style={styles.incomeTime}>
                              {formatTimeLabel(income.income_time)}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.incomeAmount}>
                          {formatKoboAmount(income.amount)}
                        </Text>
                      </Pressable>
                    </React.Fragment>
                  );
                })}
              </Card>
            </View>
          ))}
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
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.base,
    paddingBottom: Spacing.sm,
  },
  backButton: {
    padding: Spacing.xs,
    marginRight: Spacing.md,
  },
  headerTitle: {
    ...Typography.h1,
    color: Colors.textPrimary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  filterBar: {
    paddingBottom: Spacing.md,
  },
  filterContent: {
    paddingHorizontal: Spacing.base,
    gap: Spacing.sm,
    flexDirection: "row",
    flexWrap: "wrap",
  },
  filterChip: {
    alignSelf: "flex-start",
    flexShrink: 0,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  filterChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  filterLabel: {
    ...Typography.label,
    color: Colors.textSecondary,
  },
  filterLabelActive: {
    color: Colors.surface,
    fontWeight: "600",
  },
  filterChipPressed: Pressed.default,
  scrollContent: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.base,
  },
  groupSection: {
    gap: Spacing.sm,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  groupDateLabel: {
    ...Typography.label,
    color: Colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  groupTotal: {
    ...Typography.bodySmall,
    color: Colors.success,
    fontWeight: "600",
  },
  groupCard: {
    padding: Spacing.sm,
  },
  incomeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  incomeRowPressed: Pressed.default,
  incomeInfo: {
    flex: 1,
    gap: 2,
  },
  incomeSource: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
    fontWeight: "600",
  },
  incomeNote: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  incomeMeta: {
    flexDirection: "row",
    alignItems: "center",
  },
  incomePayment: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  metaDot: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  incomeTime: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  incomeAmount: {
    ...Typography.bodyMedium,
    color: Colors.success,
    fontWeight: "600",
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.xs,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
