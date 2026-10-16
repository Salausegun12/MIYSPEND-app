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
import { AnimatedEntry } from "../../components/ui/AnimatedEntry";
import { IconContainer } from "../../components/ui/IconContainer";
import { EmptyState } from "../../components/ui/EmptyState";
import { Colors } from "../../constants/colors";
import { Radius } from "../../constants/radius";
import { Typography } from "../../constants/typography";
import { Spacing } from "../../constants/spacing";
import { Pressed } from "../../constants/motion";
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
  shortLabel: string;
}

const FILTERS: FilterOption[] = [
  { key: "today", label: "Today", shortLabel: "Today" },
  { key: "yesterday", label: "Yesterday", shortLabel: "Yesterday" },
  { key: "thisWeek", label: "This Week", shortLabel: "This Week" },
  { key: "lastWeek", label: "Last Week", shortLabel: "Last Week" },
  { key: "thisMonth", label: "This Month", shortLabel: "This Month" },
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
  const totalAmount = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses]);

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
      {/* ── Header ── */}
      <AnimatedEntry delay={20}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>History</Text>
            {hasExpenses && (
              <Text style={styles.headerSubtitle}>
                {expenses.length} transaction{expenses.length !== 1 ? "s" : ""} · {formatKoboAmount(totalAmount)}
              </Text>
            )}
          </View>
          <Pressable
            onPress={() => router.push("/search" as Href)}
            style={({ pressed }) => [styles.searchButton, pressed && styles.searchButtonPressed]}
            accessibilityRole="button"
            accessibilityLabel="Search transactions"
            hitSlop={8}
          >
            <Ionicons name="search" size={20} color={Colors.primary} />
          </Pressable>
        </View>
      </AnimatedEntry>

      {/* ── Filter chips ── */}
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
                accessibilityLabel={`Filter expenses by ${filter.label}`}
              >
                <Text style={[styles.filterLabel, active && styles.filterLabelActive]}>
                  {filter.shortLabel}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ── Content ── */}
      {hasExpenses ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {dateGroups.map((group, gIdx) => (
            <AnimatedEntry key={group.dateLabel} delay={gIdx * 30}>
              <View style={styles.groupSection}>
                <View style={styles.groupHeader}>
                  <View style={styles.groupHeaderLeft}>
                    <View style={styles.groupDateDot} />
                    <Text style={styles.groupDateLabel}>{group.dateLabel}</Text>
                  </View>
                  <View style={styles.groupTotalBadge}>
                    <Text style={styles.groupTotal}>
                      {formatKoboAmount(group.expenses.reduce((s, e) => s + e.amount, 0))}
                    </Text>
                  </View>
                </View>
                <Card style={styles.groupCard}>
                  {group.expenses.map((expense, index) => (
                    <React.Fragment key={expense.id}>
                      {index > 0 && <View style={styles.divider} />}
                      <Pressable
                        onPress={() =>
                          router.push(`/expense-detail?id=${expense.id}` as Href)
                        }
                        style={({ pressed }) => [
                          styles.expenseRow,
                          pressed && styles.expenseRowPressed,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`View ${expense.description || expense.category_name} expense`}
                      >
                        <IconContainer
                          size={44}
                          backgroundColor={expense.category_color + "1F"}
                        >
                          <Text style={styles.expenseIcon}>{expense.category_icon}</Text>
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
                        <View style={styles.expenseRight}>
                          <Text style={styles.expenseAmount}>
                            {formatKoboAmount(expense.amount)}
                          </Text>
                          <Ionicons name="chevron-forward" size={13} color={Colors.textTertiary} />
                        </View>
                      </Pressable>
                    </React.Fragment>
                  ))}
                </Card>
              </View>
            </AnimatedEntry>
          ))}
        </ScrollView>
      ) : (
        <View style={styles.emptyContainer}>
          <EmptyState
            title="No expenses found"
            message="Your spending records for this period will appear here."
            icon={
              <Ionicons name="receipt-outline" size={48} color={Colors.primary} />
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

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.base,
    paddingBottom: Spacing.sm,
  },
  headerTitle: {
    ...Typography.h1,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  searchButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: Colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#CDEFE1",
  },
  searchButtonPressed: Pressed.default,
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  // Filter bar
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
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.surface,
    shadowColor: "#0B1512",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  filterChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  filterLabel: {
    ...Typography.label,
    color: Colors.textSecondary,
  },
  filterLabelActive: {
    color: Colors.white,
    fontFamily: "Poppins_700Bold",
  },
  filterChipPressed: Pressed.default,

  // Scroll content
  scrollContent: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.base,
  },

  // Group
  groupSection: {
    gap: Spacing.sm,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
  },
  groupHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  groupDateDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  groupDateLabel: {
    ...Typography.label,
    color: Colors.textSecondary,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    fontFamily: "Poppins_700Bold",
  },
  groupTotalBadge: {
    backgroundColor: Colors.primarySoft,
    borderRadius: Radius.xl,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "#CDEFE1",
  },
  groupTotal: {
    ...Typography.caption,
    color: Colors.primary,
    fontFamily: "Poppins_700Bold",
  },
  groupCard: {
    padding: 0,
    overflow: "hidden",
  },

  // Expense row
  expenseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.md + 2,
    paddingHorizontal: Spacing.base,
  },
  expenseRowPressed: {
    backgroundColor: Colors.background,
  },
  expenseIcon: {
    fontSize: 22,
    fontFamily: "Poppins_400Regular",
  },
  expenseInfo: {
    flex: 1,
    gap: 2,
  },
  expenseCategory: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
    fontFamily: "Poppins_600SemiBold",
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
    color: Colors.textTertiary,
  },
  expenseTime: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  expenseRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  expenseAmount: {
    ...Typography.bodySmall,
    color: Colors.accent.rose,
    fontFamily: "Poppins_700Bold",
  },
  divider: {
    height: 1,
    backgroundColor: Colors.borderLight,
    marginHorizontal: Spacing.base,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
