import React, { useState, useCallback } from "react";
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
import { LinearGradient } from "expo-linear-gradient";
import { useSQLiteContext } from "expo-sqlite";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card } from "../../components/ui/Card";
import { AnimatedEntry } from "../../components/ui/AnimatedEntry";
import { IconContainer } from "../../components/ui/IconContainer";
import { BarChart, type BarChartItem } from "../../components/charts/BarChart";
import { PieChart } from "../../components/charts/PieChart";
import { LineChart } from "../../components/charts/LineChart";
import { Colors } from "../../constants/colors";
import { Typography } from "../../constants/typography";
import { Spacing } from "../../constants/spacing";
import { Pressed } from "../../constants/motion";
import { Radius } from "../../constants/radius";
import { Shadows } from "../../constants/shadows";
import {
  getTotalExpenses,
  getAllExpenses,
  getTodayExpenseCount,
  getExpensesByDateRange,
} from "../../database/expenses";
import { getTotalIncome, getAllIncome } from "../../database/income";
import {
  getTodayString,
  getWeekStart,
  getWeekEnd,
  getMonthStart,
  getMonthEnd,
  getGreeting,
  getWeekDays,
  getDayOfWeek,
} from "../../utils/date";
import { formatKoboAmount, formatSignedKoboAmount } from "../../utils/money";
import {
  INCOME_SOURCE_COLORS,
  INCOME_SOURCE_ICONS,
} from "../../constants/income";
import { getUserName } from "../../utils/user";
import type { ExpenseWithCategory, Income, IncomeSource } from "../../types/database";

interface StatTileProps {
  label: string;
  income: number;
  expenses: number;
  children?: React.ReactNode;
}

const PERIOD_TINTS: Record<string, { background: string; color: string }> = {
  Today: { background: Colors.accent.goldSoft, color: Colors.accent.gold },
  "This Week": { background: Colors.accent.skySoft, color: Colors.accent.sky },
  "This Month": {
    background: Colors.accent.violetSoft,
    color: Colors.accent.violet,
  },
};

function StatTile({ label, income, expenses, children }: StatTileProps) {
  const net = income - expenses;
  const isPositive = net >= 0;
  const tint = PERIOD_TINTS[label];
  return (
    <View style={styles.statTile}>
      <Text
        style={[
          styles.statPeriod,
          tint && { backgroundColor: tint.background, color: tint.color },
        ]}
      >
        {label}
      </Text>
      <View style={styles.statBody}>
        <View style={styles.statRows}>
          <View style={styles.statRow}>
            <View style={styles.statDot} />
            <Text style={styles.statLabel}>Income</Text>
            <Text style={[styles.statValue, styles.incomeValue]}>
              {formatKoboAmount(income)}
            </Text>
          </View>
          <View style={styles.statRow}>
            <View style={[styles.statDot, styles.statDotExpense]} />
            <Text style={styles.statLabel}>Expenses</Text>
            <Text style={[styles.statValue, styles.expenseValue]}>
              {formatKoboAmount(expenses)}
            </Text>
          </View>
          <View style={[styles.statRow, styles.statNetRow]}>
            <Text style={[styles.statNetLabel, isPositive ? styles.netPositive : styles.netNegative]}>
              Net {isPositive ? "▲" : "▼"} {formatSignedKoboAmount(net)}
            </Text>
          </View>
        </View>
        {children ? <View style={styles.statChart}>{children}</View> : null}
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const db = useSQLiteContext();

  const [loading, setLoading] = useState(true);
  const [todayIncome, setTodayIncome] = useState(0);
  const [todayExpense, setTodayExpense] = useState(0);
  const [weekIncome, setWeekIncome] = useState(0);
  const [weekExpense, setWeekExpense] = useState(0);
  const [monthIncome, setMonthIncome] = useState(0);
  const [monthExpense, setMonthExpense] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [recentExpenses, setRecentExpenses] = useState<ExpenseWithCategory[]>([]);
  const [recentIncomes, setRecentIncomes] = useState<Income[]>([]);
  const [userName, setUserName] = useState<string | null>(null);
  const [weekBars, setWeekBars] = useState<BarChartItem[]>([]);
  const [monthDaily, setMonthDaily] = useState<number[]>([]);

  const loadData = useCallback(async () => {
    try {
      const today = getTodayString();
      const weekStart = getWeekStart();
      const weekEnd = getWeekEnd();
      const monthStart = getMonthStart();
      const monthEnd = getMonthEnd();

      const [
        todaysIncome,
        todaysExpense,
        weeksIncome,
        weeksExpense,
        monthsIncome,
        monthsExpense,
        count,
        recentExp,
        recentInc,
        name,
        monthExpenses,
      ] = await Promise.all([
        getTotalIncome(db, today, today),
        getTotalExpenses(db, `${today} 00:00:00`, `${today} 23:59:59`),
        getTotalIncome(db, weekStart, weekEnd),
        getTotalExpenses(db, `${weekStart} 00:00:00`, `${weekEnd} 23:59:59`),
        getTotalIncome(db, monthStart, monthEnd),
        getTotalExpenses(db, `${monthStart} 00:00:00`, `${monthEnd} 23:59:59`),
        getTodayExpenseCount(db, today),
        getAllExpenses(db, 5),
        getAllIncome(db, 5),
        getUserName(db),
        getExpensesByDateRange(
          db,
          `${monthStart} 00:00:00`,
          `${monthEnd} 23:59:59`
        ),
      ]);

      setTodayIncome(todaysIncome);
      setTodayExpense(todaysExpense);
      setWeekIncome(weeksIncome);
      setWeekExpense(weeksExpense);
      setMonthIncome(monthsIncome);
      setMonthExpense(monthsExpense);
      setTodayCount(count);
      setRecentExpenses(recentExp);
      setRecentIncomes(recentInc);
      setUserName(name);

      const totalsByDate = new Map<string, number>();
      for (const expense of monthExpenses) {
        const key = expense.date.slice(0, 10);
        totalsByDate.set(key, (totalsByDate.get(key) ?? 0) + expense.amount);
      }

      const weekDates = getWeekDays(weekStart);
      setWeekBars(
        weekDates.map((date) => ({
          id: date,
          label: getDayOfWeek(date),
          value: totalsByDate.get(date.slice(0, 10)) ?? 0,
        }))
      );

      const monthPrefix = monthStart.slice(0, 8);
      const daysInMonth = new Date(
        Number(monthStart.slice(0, 4)),
        Number(monthStart.slice(5, 7)),
        0
      ).getDate();
      setMonthDaily(
        Array.from({ length: daysInMonth }, (_, index) => {
          const day = `${monthPrefix}${String(index + 1).padStart(2, "0")}`;
          return totalsByDate.get(day) ?? 0;
        })
      );
    } catch (e) {
      console.warn("Failed to load dashboard data:", e);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadData();
    }, [loadData])
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const hasExpenses = recentExpenses.length > 0;
  const hasIncome = recentIncomes.length > 0;
  const monthNet = monthIncome - monthExpense;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{getGreeting()}{userName ? `, ${userName}` : ""} 👋</Text>
            <Text style={styles.brand}>MiySpend</Text>
          </View>
          <Pressable
            onPress={() => router.push("/search" as Href)}
            style={({ pressed }) => [styles.searchBtn, pressed && styles.searchBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Search transactions"
          >
            <Ionicons name="search-outline" size={20} color={Colors.primary} />
          </Pressable>
        </View>

        {/* ── Hero balance card ── */}
        <AnimatedEntry delay={30}>
          <LinearGradient
            colors={Colors.gradient.hero}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            {/* Decorative circles */}
            <View style={styles.heroBubble1} />
            <View style={styles.heroBubble2} />
            <View style={styles.heroBubble3} />

            <Text style={styles.heroLabel}>This month's net</Text>
            <Text style={[styles.heroAmount, monthNet < 0 && styles.heroAmountNeg]}>
              {formatSignedKoboAmount(monthNet)}
            </Text>
            <View style={styles.heroStats}>
              <View style={styles.heroStat}>
                <Ionicons name="arrow-up-circle" size={14} color="#A8EDD7" />
                <Text style={styles.heroStatLabel}>Income</Text>
                <Text style={styles.heroStatValue}>{formatKoboAmount(monthIncome)}</Text>
              </View>
              <View style={styles.heroStatDivider} />
              <View style={styles.heroStat}>
                <Ionicons name="arrow-down-circle" size={14} color="#FFB4B4" />
                <Text style={styles.heroStatLabel}>Expenses</Text>
                <Text style={styles.heroStatValue}>{formatKoboAmount(monthExpense)}</Text>
              </View>
            </View>

            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>
                {todayCount} expense{todayCount === 1 ? "" : "s"} recorded today
              </Text>
            </View>
          </LinearGradient>
        </AnimatedEntry>

        {/* ── Quick actions ── */}
        <AnimatedEntry delay={60}>
          <View style={styles.quickActions}>
            <Pressable
              onPress={() => router.push("/add-expense" as Href)}
              style={({ pressed }) => [styles.quickBtn, pressed && styles.quickBtnPressed]}
              accessibilityRole="button"
              accessibilityLabel="Add expense"
            >
              <LinearGradient
                colors={Colors.gradient.sunset}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.quickBtnFill}
              >
                <Ionicons name="remove-circle-outline" size={22} color={Colors.white} />
                <Text style={styles.quickBtnText} numberOfLines={1}>Add Expense</Text>
              </LinearGradient>
            </Pressable>
            <Pressable
              onPress={() => router.push("/add-income" as Href)}
              style={({ pressed }) => [styles.quickBtn, pressed && styles.quickBtnPressed]}
              accessibilityRole="button"
              accessibilityLabel="Add income"
            >
              <LinearGradient
                colors={Colors.gradient.mint}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.quickBtnFill}
              >
                <Ionicons name="add-circle-outline" size={22} color={Colors.white} />
                <Text style={styles.quickBtnText} numberOfLines={1}>Add Income</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </AnimatedEntry>

        {/* ── Period summary ── */}
        <AnimatedEntry delay={80}>
          <Text style={styles.sectionTitle}>Period summary</Text>
          <Card style={styles.periodCard}>
            <StatTile label="Today" income={todayIncome} expenses={todayExpense}>
              <PieChart
                data={[
                  {
                    id: "income",
                    label: "Income",
                    value: todayIncome,
                    color: Colors.success,
                  },
                  {
                    id: "expenses",
                    label: "Expenses",
                    value: todayExpense,
                    color: Colors.error,
                  },
                ]}
                total={todayIncome + todayExpense}
                centerLabel="Total"
                formatValue={formatKoboAmount}
                size={84}
                stroke={14}
                showLegend={false}
              />
            </StatTile>
            <View style={styles.periodDivider} />
            <StatTile label="This Week" income={weekIncome} expenses={weekExpense}>
              <BarChart
                compact
                data={weekBars}
                activeId={getTodayString()}
                formatValue={formatKoboAmount}
                color={Colors.accent.rose}
                colorSoft="#FDA4AF"
              />
            </StatTile>
            <View style={styles.periodDivider} />
            <StatTile label="This Month" income={monthIncome} expenses={monthExpense}>
              <LineChart
                data={monthDaily}
                height={64}
                formatValue={formatKoboAmount}
              />
            </StatTile>
          </Card>
        </AnimatedEntry>

        {/* ── Recent expenses ── */}
        {hasExpenses && (
          <AnimatedEntry delay={100}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent expenses</Text>
              <Pressable
                onPress={() => router.navigate("/(tabs)/history" as Href)}
                style={({ pressed }) => [styles.seeAll, pressed && styles.seeAllPressed]}
                accessibilityRole="button"
                accessibilityLabel="View all expenses"
              >
                <Text style={styles.seeAllText}>See all</Text>
                <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
              </Pressable>
            </View>
            <Card style={styles.listCard}>
              {recentExpenses.map((expense, index) => (
                <React.Fragment key={expense.id}>
                  {index > 0 && <View style={styles.divider} />}
                  <Pressable
                    onPress={() => router.push(`/expense-detail?id=${expense.id}` as Href)}
                    style={({ pressed }) => [styles.txRow, pressed && styles.txRowPressed]}
                    accessibilityRole="button"
                    accessibilityLabel={`View ${expense.description} expense`}
                  >
                    <IconContainer size={44} backgroundColor={expense.category_color + "1F"}>
                      <Text style={styles.txIcon}>{expense.category_icon}</Text>
                    </IconContainer>
                    <View style={styles.txInfo}>
                      <Text style={styles.txName}>{expense.category_name}</Text>
                      <Text style={styles.txDesc} numberOfLines={1}>{expense.description}</Text>
                    </View>
                    <View style={styles.txRight}>
                      <Text style={styles.txAmount}>-{formatKoboAmount(expense.amount)}</Text>
                      <Ionicons name="chevron-forward" size={14} color={Colors.textTertiary} />
                    </View>
                  </Pressable>
                </React.Fragment>
              ))}
            </Card>
          </AnimatedEntry>
        )}

        {/* ── Recent income ── */}
        {hasIncome && (
          <AnimatedEntry delay={120}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent income</Text>
              <Pressable
                onPress={() => router.push("/income-history" as Href)}
                style={({ pressed }) => [styles.seeAll, pressed && styles.seeAllPressed]}
                accessibilityRole="button"
                accessibilityLabel="View all income"
              >
                <Text style={styles.seeAllText}>See all</Text>
                <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
              </Pressable>
            </View>
            <Card style={styles.listCard}>
              {recentIncomes.map((income, index) => {
                const source = income.source as IncomeSource;
                const color = INCOME_SOURCE_COLORS[source] ?? Colors.primary;
                return (
                  <React.Fragment key={income.id}>
                    {index > 0 && <View style={styles.divider} />}
                    <Pressable
                      onPress={() => router.push(`/income-detail?id=${income.id}` as Href)}
                      style={({ pressed }) => [styles.txRow, pressed && styles.txRowPressed]}
                      accessibilityRole="button"
                      accessibilityLabel={`View ${source} income of ${formatKoboAmount(income.amount)}`}
                    >
                      <IconContainer size={44} backgroundColor={color + "1F"}>
                        <Ionicons
                          name={INCOME_SOURCE_ICONS[source] ?? "wallet-outline"}
                          size={20}
                          color={color}
                        />
                      </IconContainer>
                      <View style={styles.txInfo}>
                        <Text style={styles.txName}>{source}</Text>
                        <Text style={styles.txDesc} numberOfLines={1}>
                          {income.note ? income.note : income.payment_method}
                        </Text>
                      </View>
                      <View style={styles.txRight}>
                        <Text style={[styles.txAmount, styles.incomeAmountText]}>
                          +{formatKoboAmount(income.amount)}
                        </Text>
                        <Ionicons name="chevron-forward" size={14} color={Colors.textTertiary} />
                      </View>
                    </Pressable>
                  </React.Fragment>
                );
              })}
            </Card>
          </AnimatedEntry>
        )}

        {/* ── Empty state ── */}
        {!hasExpenses && !hasIncome && (
          <AnimatedEntry delay={100}>
            <Card style={styles.emptyCard}>
              <View style={styles.emptyIconWrap}>
                <LinearGradient
                  colors={Colors.gradient.primary}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.emptyIconGradient}
                >
                  <Ionicons name="wallet-outline" size={32} color={Colors.white} />
                </LinearGradient>
              </View>
              <Text style={styles.emptyTitle}>Nothing recorded yet</Text>
              <Text style={styles.emptyMessage}>
                Start recording your income and expenses to see your financial activity here.
              </Text>
            </Card>
          </AnimatedEntry>
        )}

        {/* ── Income history link ── */}
        <AnimatedEntry delay={140}>
          <Pressable
            onPress={() => router.push("/income-history" as Href)}
            style={({ pressed }) => [styles.incomeHistoryLink, pressed && styles.seeAllPressed]}
            accessibilityRole="button"
            accessibilityLabel="View income history"
          >
            <Ionicons name="trending-up-outline" size={16} color={Colors.primary} />
            <Text style={styles.seeAllText}>View Income History</Text>
            <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
          </Pressable>
        </AnimatedEntry>
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
  content: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.base,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  // Header
  header: {
    paddingTop: Spacing.base,
    paddingBottom: Spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  greeting: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  brand: {
    ...Typography.h1,
    color: Colors.primary,
  },
  searchBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBtnPressed: Pressed.default,

  // Hero card
  heroCard: {
    borderRadius: Radius.xxl,
    padding: Spacing.xl,
    overflow: "hidden",
    gap: Spacing.xs,
    ...Shadows.lg,
  },
  heroBubble1: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(167,139,250,0.28)",
    top: -40,
    right: -30,
  },
  heroBubble2: {
    position: "absolute",
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "rgba(251,191,36,0.20)",
    bottom: -20,
    left: -20,
  },
  heroBubble3: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(56,189,248,0.16)",
    bottom: -45,
    right: -25,
  },
  heroLabel: {
    ...Typography.caption,
    color: "rgba(255,255,255,0.65)",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  heroAmount: {
    fontSize: 36,
    fontWeight: "700",
    color: Colors.white,
    letterSpacing: -0.5,
    marginTop: 2,
  },
  heroAmountNeg: {
    color: "#FFB4B4",
  },
  heroStats: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.md,
    backgroundColor: "rgba(0,0,0,0.15)",
    borderRadius: Radius.lg,
    padding: Spacing.md,
  },
  heroStat: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  heroStatLabel: {
    ...Typography.caption,
    color: "rgba(255,255,255,0.65)",
    flex: 1,
  },
  heroStatValue: {
    ...Typography.caption,
    color: Colors.white,
    fontWeight: "600",
  },
  heroStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginHorizontal: Spacing.md,
  },
  heroBadge: {
    alignSelf: "flex-start",
    marginTop: Spacing.sm,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  heroBadgeText: {
    ...Typography.caption,
    color: "rgba(255,255,255,0.8)",
  },

  // Quick actions
  quickActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  quickBtn: {
    flex: 1,
    height: 56,
    borderRadius: Radius.lg,
    overflow: "hidden",
    ...Shadows.sm,
  },
  quickBtnFill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: Spacing.sm,
  },
  quickBtnPressed: Pressed.default,
  quickBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.white,
    flexShrink: 1,
  },

  // Section
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.xs,
  },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
  },
  seeAll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  seeAllText: {
    ...Typography.caption,
    color: Colors.primary,
    fontWeight: "700",
  },
  seeAllPressed: Pressed.default,

  // Period stats card
  periodCard: {
    gap: 0,
    padding: 0,
    overflow: "hidden",
  },
  statTile: {
    padding: Spacing.base,
    gap: Spacing.sm,
  },
  statPeriod: {
    ...Typography.label,
    alignSelf: "flex-start",
    color: Colors.textSecondary,
    backgroundColor: Colors.borderLight,
    borderRadius: 999,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    letterSpacing: 0.3,
    overflow: "hidden",
  },
  statBody: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  statRows: {
    flex: 1,
    gap: Spacing.xs,
  },
  statChart: {
    width: 150,
    alignItems: "center",
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  statNetRow: {
    marginTop: 2,
  },
  statDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  statDotExpense: {
    backgroundColor: Colors.accent.rose,
  },
  statLabel: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    flex: 1,
  },
  statValue: {
    ...Typography.bodySmall,
    color: Colors.textPrimary,
    fontWeight: "600",
  },
  incomeValue: {
    color: Colors.success,
  },
  expenseValue: {
    color: Colors.accent.rose,
  },
  statNetLabel: {
    ...Typography.caption,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  netPositive: {
    color: Colors.success,
  },
  netNegative: {
    color: Colors.error,
  },
  periodDivider: {
    height: 1,
    backgroundColor: Colors.borderLight,
  },

  // Transaction rows
  listCard: {
    padding: 0,
    overflow: "hidden",
  },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
  },
  txRowPressed: Pressed.default,
  txIcon: {
    fontSize: 20,
  },
  txInfo: {
    flex: 1,
  },
  txName: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
  },
  txDesc: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  txRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  txAmount: {
    ...Typography.bodySmall,
    color: Colors.textPrimary,
    fontWeight: "700",
  },
  incomeAmountText: {
    color: Colors.success,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.borderLight,
    marginHorizontal: Spacing.base,
  },

  // Empty state
  emptyCard: {
    alignItems: "center",
    paddingVertical: Spacing.xxxl,
    gap: Spacing.md,
  },
  emptyIconWrap: {
    marginBottom: Spacing.xs,
  },
  emptyIconGradient: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    ...Shadows.md,
  },
  emptyTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
    textAlign: "center",
  },
  emptyMessage: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    textAlign: "center",
    maxWidth: 260,
  },

  incomeHistoryLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: Spacing.sm,
  },
});
