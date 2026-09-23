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
import { Card } from "../../components/ui/Card";
import { IconContainer } from "../../components/ui/IconContainer";
import { EmptyState } from "../../components/ui/EmptyState";
import { Colors } from "../../constants/colors";
import { Radius } from "../../constants/radius";
import { Typography } from "../../constants/typography";
import { Spacing } from "../../constants/spacing";
import {
  getExpensesByDateRange,
  getAllExpenses,
} from "../../database/expenses";
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
} from "../../utils/date";
import { formatKoboAmount } from "../../utils/money";
import type { ExpenseWithCategory } from "../../types/database";

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
  dateLabel: string;
  expenses: ExpenseWithCategory[];
}

function getFilterDateRange(filter: FilterKey): { start: string; end: string } | null {
  switch (filter) {
    case "today": {
      const d = getTodayString();
      return { start: `${d} 00:00:00`, end: `${d} 23:59:59` };
    }
    case "yesterday": {
      const d = getYesterdayString();
      return { start: `${d} 00:00:00`, end: `${d} 23:59:59` };
    }
    case "thisWeek":
      return { start: `${getWeekStart()} 00:00:00`, end: `${getWeekEnd()} 23:59:59` };
    case "lastWeek":
      return { start: `${getLastWeekStart()} 00:00:00`, end: `${getLastWeekEnd()} 23:59:59` };
    case "thisMonth":
      return { start: `${getMonthStart()} 00:00:00`, end: `${getMonthEnd()} 23:59:59` };
    default:
      return null;
  }
}

function groupByDate(expenses: ExpenseWithCategory[]): DateGroup[] {
  const groups = new Map<string, ExpenseWithCategory[]>();

  for (const expense of expenses) {
    const dateKey = expense.date.substring(0, 10);
    if (!groups.has(dateKey)) {
      groups.set(dateKey, []);
    }
    groups.get(dateKey)!.push(expense);
  }

  return Array.from(groups.entries()).map(([dateKey, exps]) => ({
    dateLabel: isToday(dateKey)
      ? "TODAY"
      : isYesterday(dateKey)
        ? "YESTERDAY"
        : formatHistoryDate(dateKey),
    expenses: exps,
  }));
}

function extractTime(dateStr: string): string {
  const parts = dateStr.split(" ");
  if (parts.length < 2) return "";
  const timeParts = parts[1].split(":");
  if (timeParts.length < 2) return "";
  const h = parseInt(timeParts[0], 10);
  const m = parseInt(timeParts[1], 10);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

export default function HistoryScreen() {
  const router = useRouter();
  const db = useSQLiteContext();

  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("today");
  const [expenses, setExpenses] = useState<ExpenseWithCategory[]>([]);

  const loadData = useCallback(async () => {
    try {
      const range = getFilterDateRange(activeFilter);
      const data = range
        ? await getExpensesByDateRange(db, range.start, range.end)
        : await getAllExpenses(db);
      setExpenses(data);
    } catch (e) {
      console.warn("Failed to load history:", e);
    } finally {
      setLoading(false);
    }
  }, [db, activeFilter]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadData();
    }, [loadData])
  );

  const handleFilterChange = useCallback((filter: FilterKey) => {
    setActiveFilter(filter);
  }, []);

  const dateGroups = useMemo(() => groupByDate(expenses), [expenses]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>History</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const hasExpenses = expenses.length > 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>History</Text>
      </View>

      <View style={styles.filterBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterContent}
        >
          {FILTERS.map((filter) => {
            const active = activeFilter === filter.key;
            return (
              <Pressable
                key={filter.key}
                onPress={() => handleFilterChange(filter.key)}
                style={[styles.filterChip, active && styles.filterChipActive]}
              >
                <Text
                  style={[
                    styles.filterLabel,
                    active && styles.filterLabelActive,
                  ]}
                >
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {hasExpenses ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {dateGroups.map((group) => (
            <View key={group.dateLabel} style={styles.groupSection}>
              <View style={styles.groupHeader}>
                <Text style={styles.groupDateLabel}>{group.dateLabel}</Text>
                <Text style={styles.groupTotal}>
                  {formatKoboAmount(
                    group.expenses.reduce((sum, e) => sum + e.amount, 0)
                  )}
                </Text>
              </View>
              <Card style={styles.groupCard}>
                {group.expenses.map((expense, index) => (
                  <React.Fragment key={expense.id}>
                    {index > 0 && <View style={styles.divider} />}
                    <Pressable
                      onPress={() =>
                        router.push(
                          `/expense-detail?id=${expense.id}` as Href
                        )
                      }
                      style={styles.expenseRow}
                    >
                      <IconContainer
                        size={40}
                        backgroundColor={expense.category_color + "20"}
                      >
                        <Text style={styles.expenseIcon}>
                          {expense.category_icon}
                        </Text>
                      </IconContainer>
                      <View style={styles.expenseInfo}>
                        <Text style={styles.expenseCategory} numberOfLines={1}>
                          {expense.description || expense.category_name}
                        </Text>
                        <View style={styles.expenseMeta}>
                          <Text style={styles.expensePayment} numberOfLines={1}>
                            {expense.payment_method}
                          </Text>
                          <Text style={styles.metaDot}> · </Text>
                          <Text style={styles.expenseTime}>
                            {extractTime(expense.date)}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.expenseAmount}>
                        {formatKoboAmount(expense.amount)}
                      </Text>
                    </Pressable>
                  </React.Fragment>
                ))}
              </Card>
            </View>
          ))}
        </ScrollView>
      ) : (
        <View style={styles.emptyContainer}>
          <EmptyState
            title="No expenses found"
            message="Your spending records for this period will appear here."
            icon={
              <Ionicons
                name="receipt-outline"
                size={48}
                color={Colors.primary}
              />
            }
          />
        </View>
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
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.base,
    paddingBottom: Spacing.sm,
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
  },
  filterChip: {
    alignSelf: "flex-start",
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
    color: Colors.textPrimary,
    fontWeight: "600",
  },
  groupCard: {
    padding: Spacing.sm,
  },
  expenseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  expenseIcon: {
    fontSize: 18,
  },
  expenseInfo: {
    flex: 1,
    gap: 2,
  },
  expenseCategory: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
  },
  expenseMeta: {
    flexDirection: "row",
    alignItems: "center",
  },
  expensePayment: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  metaDot: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  expenseTime: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  expenseAmount: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
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
