import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSQLiteContext } from "expo-sqlite";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { IconContainer } from "../../components/ui/IconContainer";
import { Colors } from "../../constants/colors";
import { Radius } from "../../constants/radius";
import { Typography } from "../../constants/typography";
import { Spacing } from "../../constants/spacing";
import {
  getTodayString,
  getWeekStart,
  getWeekStartForDate,
  getWeekEndForDate,
  shiftWeek,
  formatWeekRange,
  getDayOfWeek,
  formatShortDate,
  getWeekDays,
} from "../../utils/date";
import { formatKoboAmount, koboToNaira } from "../../utils/money";
import { getExpensesByDateRange, getTotalExpenses } from "../../database/expenses";
import type { ExpenseWithCategory } from "../../types/database";

interface CategorySpending {
  category_id: number;
  category_name: string;
  category_icon: string;
  category_color: string;
  total: number;
}

interface DailySpending {
  date: string;
  dayName: string;
  shortDate: string;
  total: number;
}

export default function ReportsScreen() {
  const db = useSQLiteContext();

  const [loading, setLoading] = useState(true);
  const [selectedMonday, setSelectedMonday] = useState(() => {
    const today = getTodayString();
    return getWeekStartForDate(today);
  });

  const weekMonday = selectedMonday;
  const weekSunday = getWeekEndForDate(weekMonday);
  const weekDays = getWeekDays(weekMonday);
  const prevMonday = shiftWeek(weekMonday, -1);
  const prevSunday = getWeekEndForDate(prevMonday);

  const loadData = useCallback(async () => {
    try {
      const start = `${weekMonday} 00:00:00`;
      const end = `${weekSunday} 23:59:59`;
      const prevStart = `${prevMonday} 00:00:00`;
      const prevEnd = `${prevSunday} 23:59:59`;

      const [weekExpenses, weekTotal, prevTotal] = await Promise.all([
        getExpensesByDateRange(db, start, end),
        getTotalExpenses(db, start, end),
        getTotalExpenses(db, prevStart, prevEnd),
      ]);

      const dailySpending: DailySpending[] = weekDays.map((dayDate) => {
        const dayKey = dayDate.substring(0, 10);
        const dayTotal = weekExpenses
          .filter((e) => e.date.startsWith(dayKey))
          .reduce((sum, e) => sum + e.amount, 0);
        return {
          date: dayDate,
          dayName: getDayOfWeek(dayDate),
          shortDate: formatShortDate(dayDate),
          total: dayTotal,
        };
      });

      const categoryMap = new Map<number, CategorySpending>();
      for (const exp of weekExpenses) {
        const existing = categoryMap.get(exp.category_id);
        if (existing) {
          existing.total += exp.amount;
        } else {
          categoryMap.set(exp.category_id, {
            category_id: exp.category_id,
            category_name: exp.category_name,
            category_icon: exp.category_icon,
            category_color: exp.category_color,
            total: exp.amount,
          });
        }
      }
      const categorySpending = Array.from(categoryMap.values()).sort(
        (a, b) => b.total - a.total
      );

      const highestDay = dailySpending.reduce(
        (max, d) => (d.total > max.total ? d : max),
        dailySpending[0]
      );
      const highestCategory = categorySpending[0] ?? null;
      const averageDaily = Math.round(weekTotal / 7);

      setWeekTotal(weekTotal);
      setPrevWeekTotal(prevTotal);
      setDailySpending(dailySpending);
      setCategorySpending(categorySpending);
      setHighestDay(highestDay);
      setHighestCategory(highestCategory);
      setAverageDaily(averageDaily);
    } catch (e) {
      console.warn("Failed to load report data:", e);
    } finally {
      setLoading(false);
    }
  }, [db, weekMonday, weekSunday, prevMonday, prevSunday, weekDays]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadData();
    }, [loadData])
  );

  const [weekTotal, setWeekTotal] = useState(0);
  const [prevWeekTotal, setPrevWeekTotal] = useState(0);
  const [dailySpending, setDailySpending] = useState<DailySpending[]>([]);
  const [categorySpending, setCategorySpending] = useState<CategorySpending[]>(
    []
  );
  const [highestDay, setHighestDay] = useState<DailySpending | null>(null);
  const [highestCategory, setHighestCategory] =
    useState<CategorySpending | null>(null);
  const [averageDaily, setAverageDaily] = useState(0);

  const isCurrentWeek = useMemo(() => {
    const today = getTodayString();
    const currentMonday = getWeekStart();
    return weekMonday === currentMonday;
  }, [weekMonday]);

  const weekDiff = weekTotal - prevWeekTotal;
  const spendingIncreased = weekDiff > 0;
  const hasData = weekTotal > 0;
  const hasPrevData = prevWeekTotal > 0;
  const maxDaily = useMemo(
    () => Math.max(...dailySpending.map((d) => d.total), 1),
    [dailySpending]
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Reports</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Reports</Text>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.weekNav}>
          <Pressable
            onPress={() => setSelectedMonday(shiftWeek(weekMonday, -1))}
            style={styles.navArrow}
          >
            <Ionicons
              name="chevron-back"
              size={24}
              color={Colors.primary}
            />
          </Pressable>
          <View style={styles.weekInfo}>
            <Text style={styles.weekLabel}>
              {isCurrentWeek ? "This Week" : "Week of"}
            </Text>
            <Text style={styles.weekRange}>
              {formatWeekRange(weekMonday, weekSunday)}
            </Text>
          </View>
          <Pressable
            onPress={() => setSelectedMonday(shiftWeek(weekMonday, 1))}
            style={styles.navArrow}
            disabled={isCurrentWeek}
          >
            <Ionicons
              name="chevron-forward"
              size={24}
              color={isCurrentWeek ? Colors.disabled : Colors.primary}
            />
          </Pressable>
        </View>

        {!hasData ? (
          <EmptyState
            title="No spending this week"
            message="Your expenses for this week will appear here."
            icon={
              <Ionicons
                name="bar-chart-outline"
                size={48}
                color={Colors.primary}
              />
            }
          />
        ) : (
          <>
            <View style={styles.summaryRow}>
              <Card style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Total Spent</Text>
                <Text style={styles.summaryAmount}>
                  {formatKoboAmount(weekTotal)}
                </Text>
              </Card>
              <Card style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Daily Average</Text>
                <Text style={styles.summaryAmount}>
                  {formatKoboAmount(averageDaily)}
                </Text>
              </Card>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Daily Spending</Text>
              <Card style={styles.dailyCard}>
                {dailySpending.map((day, index) => {
                  const barWidth =
                    maxDaily > 0 ? (day.total / maxDaily) * 100 : 0;
                  const isToday = day.date === getTodayString();
                  return (
                    <View key={day.date} style={styles.dailyRow}>
                      <View style={styles.dailyLeft}>
                        <Text
                          style={[
                            styles.dailyDayName,
                            isToday && styles.dailyDayNameActive,
                          ]}
                        >
                          {day.dayName}
                        </Text>
                        <Text style={styles.dailyDate}>{day.shortDate}</Text>
                      </View>
                      <View style={styles.dailyBarContainer}>
                        <View
                          style={[
                            styles.dailyBar,
                            {
                              width: `${barWidth}%`,
                              backgroundColor:
                                day.total > 0
                                  ? Colors.primary
                                  : Colors.disabled,
                            },
                          ]}
                        />
                      </View>
                      <Text
                        style={[
                          styles.dailyAmount,
                          day.total === 0 && styles.dailyAmountZero,
                        ]}
                      >
                        {day.total > 0 ? formatKoboAmount(day.total) : "₦0"}
                      </Text>
                    </View>
                  );
                })}
              </Card>
            </View>

            {highestCategory && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Spending by Category</Text>
                <Card style={styles.categoryCard}>
                  {categorySpending.map((cat) => {
                    const pct =
                      weekTotal > 0
                        ? Math.round((cat.total / weekTotal) * 100)
                        : 0;
                    return (
                      <View key={cat.category_id} style={styles.catRow}>
                        <IconContainer
                          size={36}
                          backgroundColor={cat.category_color + "20"}
                        >
                          <Text style={styles.catIcon}>
                            {cat.category_icon}
                          </Text>
                        </IconContainer>
                        <View style={styles.catInfo}>
                          <View style={styles.catHeader}>
                            <Text style={styles.catName}>{cat.category_name}</Text>
                            <Text style={styles.catPct}>{pct}%</Text>
                          </View>
                          <View style={styles.catBarBg}>
                            <View
                              style={[
                                styles.catBarFill,
                                {
                                  width: `${pct}%`,
                                  backgroundColor: cat.category_color,
                                },
                              ]}
                            />
                          </View>
                        </View>
                        <Text style={styles.catAmount}>
                          {formatKoboAmount(cat.total)}
                        </Text>
                      </View>
                    );
                  })}
                </Card>
              </View>
            )}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Highlights</Text>
              <Card style={styles.highlightsCard}>
                {highestCategory && (
                  <View style={styles.highlightRow}>
                    <IconContainer
                      size={36}
                      backgroundColor={highestCategory.category_color + "20"}
                    >
                      <Text style={styles.catIcon}>
                        {highestCategory.category_icon}
                      </Text>
                    </IconContainer>
                    <View style={styles.highlightInfo}>
                      <Text style={styles.highlightLabel}>
                        Highest Category
                      </Text>
                      <Text style={styles.highlightValue}>
                        {highestCategory.category_name}
                      </Text>
                    </View>
                    <Text style={styles.highlightAmount}>
                      {formatKoboAmount(highestCategory.total)}
                    </Text>
                  </View>
                )}
                {highestDay && highestDay.total > 0 && (
                  <>
                    <View style={styles.highlightDivider} />
                    <View style={styles.highlightRow}>
                      <IconContainer size={36} backgroundColor={Colors.primarySoft}>
                        <Ionicons
                          name="trending-up"
                          size={18}
                          color={Colors.primary}
                        />
                      </IconContainer>
                      <View style={styles.highlightInfo}>
                        <Text style={styles.highlightLabel}>
                          Highest Day
                        </Text>
                        <Text style={styles.highlightValue}>
                          {highestDay.dayName}, {highestDay.shortDate}
                        </Text>
                      </View>
                      <Text style={styles.highlightAmount}>
                        {formatKoboAmount(highestDay.total)}
                      </Text>
                    </View>
                  </>
                )}
              </Card>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Compare with Previous Week</Text>
              <Card style={styles.compareCard}>
                <View style={styles.compareRow}>
                  <View style={styles.compareItem}>
                    <Text style={styles.compareLabel}>Previous Week</Text>
                    <Text style={styles.compareAmount}>
                      {hasPrevData
                        ? formatKoboAmount(prevWeekTotal)
                        : "₦0"}
                    </Text>
                  </View>
                  <View style={styles.compareDivider} />
                  <View style={styles.compareItem}>
                    <Text style={styles.compareLabel}>Difference</Text>
                    <Text
                      style={[
                        styles.compareDiff,
                        weekDiff > 0
                          ? styles.diffIncrease
                          : weekDiff < 0
                            ? styles.diffDecrease
                            : styles.diffNeutral,
                      ]}
                    >
                      {weekDiff > 0 ? "+" : ""}
                      {formatKoboAmount(weekDiff)}
                    </Text>
                    {!hasPrevData && prevWeekTotal === 0 && weekTotal > 0 ? (
                      <Text style={styles.compareNote}>
                        No data for previous week
                      </Text>
                    ) : weekDiff > 0 ? (
                      <Text style={styles.compareNote}>Spending increased</Text>
                    ) : weekDiff < 0 ? (
                      <Text style={styles.compareNote}>
                        Spending decreased
                      </Text>
                    ) : (
                      <Text style={styles.compareNote}>Same as last week</Text>
                    )}
                  </View>
                </View>
              </Card>
            </View>
          </>
        )}
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
  content: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.base,
  },
  weekNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  navArrow: {
    padding: Spacing.sm,
  },
  weekInfo: {
    alignItems: "center",
    gap: 2,
  },
  weekLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  weekRange: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
  },
  summaryRow: {
    flexDirection: "row",
    gap: Spacing.base,
  },
  summaryCard: {
    flex: 1,
  },
  summaryLabel: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  summaryAmount: {
    ...Typography.amountSmall,
    color: Colors.textPrimary,
  },
  section: {
    gap: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
  },
  dailyCard: {
    padding: Spacing.sm,
    gap: Spacing.xs,
  },
  dailyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  dailyLeft: {
    width: 70,
    gap: 2,
  },
  dailyDayName: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    fontWeight: "500",
  },
  dailyDayNameActive: {
    color: Colors.primary,
    fontWeight: "600",
  },
  dailyDate: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  dailyBarContainer: {
    flex: 1,
    height: 20,
    backgroundColor: Colors.border + "60",
    borderRadius: Radius.sm,
    overflow: "hidden",
  },
  dailyBar: {
    height: "100%",
    borderRadius: Radius.sm,
    minWidth: 2,
  },
  dailyAmount: {
    ...Typography.bodySmall,
    color: Colors.textPrimary,
    fontWeight: "500",
    width: 80,
    textAlign: "right",
  },
  dailyAmountZero: {
    color: Colors.textSecondary,
  },
  categoryCard: {
    padding: Spacing.sm,
    gap: Spacing.md,
  },
  catRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  catIcon: {
    fontSize: 16,
  },
  catInfo: {
    flex: 1,
    gap: 4,
  },
  catHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  catName: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
  },
  catPct: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  catBarBg: {
    height: 6,
    backgroundColor: Colors.border + "60",
    borderRadius: 3,
    overflow: "hidden",
  },
  catBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  catAmount: {
    ...Typography.bodySmall,
    color: Colors.textPrimary,
    fontWeight: "500",
    minWidth: 70,
    textAlign: "right",
  },
  highlightsCard: {
    padding: Spacing.sm,
    gap: Spacing.sm,
  },
  highlightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  highlightInfo: {
    flex: 1,
  },
  highlightLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  highlightValue: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
    fontWeight: "500",
  },
  highlightAmount: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
    fontWeight: "600",
  },
  highlightDivider: {
    height: 1,
    backgroundColor: Colors.border,
  },
  compareCard: {
    padding: Spacing.base,
  },
  compareRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  compareItem: {
    flex: 1,
    gap: Spacing.xs,
  },
  compareDivider: {
    width: 1,
    backgroundColor: Colors.border,
    alignSelf: "stretch",
    marginHorizontal: Spacing.base,
  },
  compareLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  compareAmount: {
    ...Typography.amountSmall,
    color: Colors.textPrimary,
  },
  compareDiff: {
    ...Typography.amountSmall,
  },
  diffIncrease: {
    color: Colors.error,
  },
  diffDecrease: {
    color: Colors.success,
  },
  diffNeutral: {
    color: Colors.textPrimary,
  },
  compareNote: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
});
