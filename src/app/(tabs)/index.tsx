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

const HERO_GRADIENT = ["#00A88C", "#005A4C"] as const;

interface PeriodRowProps {
  label: string;
  income: number;
  expense: number;
  children?: React.ReactNode;
}

function PeriodRow({ label, income, expense, children }: PeriodRowProps) {
  const net = income - expense;
  const isPositive = net >= 0;
  return (
    <View style={styles.periodRow}>
      <View style={styles.periodRowLeft}>
        <View style={styles.periodRowHeader}>
          <Text style={styles.periodRowLabel}>{label}</Text>
          <Text
            style={[
              styles.periodRowNet,
              isPositive ? styles.netPositive : styles.netNegative,
            ]}
          >
            {formatSignedKoboAmount(net)}
          </Text>
        </View>
        <Text style={styles.periodRowMeta}>
          <Text style={styles.periodRowIn}>+{formatKoboAmount(income)}</Text>
          {"  ·  "}
          <Text style={styles.periodRowOut}>-{formatKoboAmount(expense)}</Text>
        </Text>
      </View>
      {children ? <View style={styles.periodRowChart}>{children}</View> : null}
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
        <AnimatedEntry delay={0}>
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
        </AnimatedEntry>

        {/* ── Hero balance card ── */}
        <AnimatedEntry delay={60}>
          <LinearGradient
            colors={HERO_GRADIENT}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            {/* Decorative orbs */}
            <View style={styles.heroOrb1} />
            <View style={styles.heroOrb2} />
            <View style={styles.heroOrb3} />

            <Text style={styles.heroLabel}>This month&apos;s net</Text>
            <Text style={[styles.heroAmount, monthNet < 0 && styles.heroAmountNeg]}>
              {formatSignedKoboAmount(monthNet)}
            </Text>

            <View style={styles.heroStats}>
              <View style={styles.heroStat}>
                <View style={styles.heroStatIconRow}>
                  <View style={styles.heroStatDot} />
                  <Text style={styles.heroStatLabel}>Income</Text>
                </View>
                <Text style={styles.heroStatValue}>{formatKoboAmount(monthIncome)}</Text>
              </View>
              <View style={styles.heroStatDivider} />
              <View style={styles.heroStat}>
                <View style={styles.heroStatIconRow}>
                  <View style={[styles.heroStatDot, styles.heroStatDotRed]} />
                  <Text style={styles.heroStatLabel}>Expenses</Text>
                </View>
                <Text style={styles.heroStatValue}>{formatKoboAmount(monthExpense)}</Text>
              </View>
            </View>
          </LinearGradient>
        </AnimatedEntry>

        {/* ── Quick actions ── */}
        <AnimatedEntry delay={100}>
          <View style={styles.quickActions}>
            <Pressable
              onPress={() => router.push("/add-expense" as Href)}
              style={({ pressed }) => [styles.quickBtn, pressed && styles.quickBtnPressed]}
              accessibilityRole="button"
              accessibilityLabel="Add expense"
            >
              <LinearGradient
                colors={Colors.gradient.primary}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.quickBtnFill}
              >
                <View style={styles.quickBtnIconWrap}>
                  <Ionicons name="remove-circle-outline" size={20} color={Colors.white} />
                </View>
                <Text style={styles.quickBtnText} numberOfLines={1}>Add Expense</Text>
              </LinearGradient>
            </Pressable>
            <Pressable
              onPress={() => router.push("/add-income" as Href)}
              style={({ pressed }) => [styles.quickBtn, styles.quickBtnSoft, pressed && styles.quickBtnPressed]}
              accessibilityRole="button"
              accessibilityLabel="Add income"
            >
              <View style={styles.quickBtnFill}>
                <View style={[styles.quickBtnIconWrap, styles.quickBtnIconWrapSoft]}>
                  <Ionicons name="add-circle-outline" size={20} color={Colors.primary} />
                </View>
                <Text style={[styles.quickBtnText, styles.quickBtnTextSoft]} numberOfLines={1}>Add Income</Text>
              </View>
            </Pressable>
          </View>
        </AnimatedEntry>

        {/* ── Period summary ── */}
        <AnimatedEntry delay={130}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Period summary</Text>
          </View>
          <Card style={styles.periodCard}>
            <PeriodRow label="Today" income={todayIncome} expense={todayExpense}>
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
                size={76}
                stroke={12}
                showLegend={false}
              />
            </PeriodRow>
            <View style={styles.periodDivider} />
            <PeriodRow label="This Week" income={weekIncome} expense={weekExpense}>
              <BarChart
                compact
                data={weekBars}
                activeId={getTodayString()}
                formatValue={formatKoboAmount}
                color={Colors.primary}
                colorSoft="#A7E8D6"
              />
            </PeriodRow>
            <View style={styles.periodDivider} />
            <PeriodRow label="This Month" income={monthIncome} expense={monthExpense}>
              <LineChart
                data={monthDaily}
                height={64}
                formatValue={formatKoboAmount}
              />
            </PeriodRow>
          </Card>
        </AnimatedEntry>

        {/* ── Recent expenses ── */}
        {hasExpenses && (
          <AnimatedEntry delay={160}>
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
                    <IconContainer size={46} backgroundColor={expense.category_color + "22"}>
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
          <AnimatedEntry delay={190}>
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
                      <IconContainer size={46} backgroundColor={color + "22"}>
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
          <AnimatedEntry delay={160}>
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
        <AnimatedEntry delay={220}>
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

      {/* ── Floating voice assistant ── */}
      <Pressable
        onPress={() => router.push("/voice-entry" as unknown as Href)}
        style={({ pressed }) => [
          styles.voiceFab,
          pressed && styles.voiceFabPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Voice assistant"
      >
        <LinearGradient
          colors={Colors.gradient.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.voiceFabFill}
        >
          <Ionicons name="mic" size={26} color={Colors.white} />
        </LinearGradient>
      </Pressable>
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
    paddingBottom: 124,
    gap: Spacing.base,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  // Header
  header: {
    paddingTop: Spacing.md,
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
    letterSpacing: -0.5,
  },
  searchBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: Colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#CDEFE1",
    ...Shadows.sm,
  },
  searchBtnPressed: Pressed.default,

  // Hero card
  heroCard: {
    borderRadius: Radius.xxl + 4,
    padding: Spacing.xl,
    gap: Spacing.xs,
    overflow: "hidden",
    ...Shadows.lg,
  },
  heroOrb1: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(255,255,255,0.07)",
    top: -50,
    right: -40,
  },
  heroOrb2: {
    position: "absolute",
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "rgba(255,255,255,0.05)",
    bottom: -20,
    left: 20,
  },
  heroOrb3: {
    position: "absolute",
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(255,255,255,0.08)",
    top: 20,
    left: -10,
  },
  heroLabel: {
    ...Typography.caption,
    color: "rgba(255,255,255,0.72)",
    letterSpacing: 1,
    textTransform: "uppercase",
    fontFamily: "Poppins_600SemiBold",
  },
  heroAmount: {
    fontSize: 38,
    fontFamily: "Poppins_700Bold",
    color: Colors.white,
    letterSpacing: -0.5,
    marginTop: 4,
  },
  heroAmountNeg: {
    color: "#FFB4B4",
  },
  heroStats: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.15)",
  },
  heroStat: {
    flex: 1,
    gap: 4,
  },
  heroStatIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  heroStatDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#34D399",
  },
  heroStatDotRed: {
    backgroundColor: "#FB7185",
  },
  heroStatLabel: {
    ...Typography.caption,
    color: "rgba(255,255,255,0.65)",
    fontFamily: "Poppins_500Medium",
  },
  heroStatValue: {
    ...Typography.bodyMedium,
    color: Colors.white,
    fontFamily: "Poppins_700Bold",
  },
  heroStatDivider: {
    width: 1,
    height: 36,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginHorizontal: Spacing.lg,
  },

  // Quick actions
  quickActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  quickBtn: {
    flex: 1,
    height: 58,
    borderRadius: Radius.lg + 2,
    overflow: "hidden",
    ...Shadows.sm,
  },
  quickBtnFill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: Spacing.sm,
  },
  quickBtnIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  quickBtnIconWrapSoft: {
    backgroundColor: Colors.primarySoft,
  },
  quickBtnPressed: Pressed.default,
  quickBtnSoft: {
    backgroundColor: Colors.primarySoft,
    borderWidth: 1.5,
    borderColor: "#CDEFE1",
  },
  quickBtnText: {
    fontSize: 14,
    fontFamily: "Poppins_700Bold",
    color: Colors.white,
    flexShrink: 1,
    letterSpacing: 0.2,
  },
  quickBtnTextSoft: {
    color: Colors.primary,
  },

  // Floating voice assistant
  voiceFab: {
    position: "absolute",
    right: Spacing.base,
    bottom: Spacing.base,
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: "hidden",
    ...Shadows.lg,
  },
  voiceFabPressed: Pressed.default,
  voiceFabFill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  // Section
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
  },
  seeAll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.xs,
    backgroundColor: Colors.primarySoft,
    borderRadius: Radius.xl,
    paddingLeft: Spacing.sm,
  },
  seeAllText: {
    ...Typography.caption,
    color: Colors.primary,
    fontFamily: "Poppins_700Bold",
  },
  seeAllPressed: Pressed.default,

  // Period summary card
  periodCard: {
    gap: 0,
    padding: 0,
    overflow: "hidden",
  },
  periodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.md + 2,
    paddingHorizontal: Spacing.base,
  },
  periodRowLeft: {
    flex: 1,
    gap: 4,
  },
  periodRowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.xs,
  },
  periodRowLabel: {
    ...Typography.label,
    color: Colors.textPrimary,
    fontFamily: "Poppins_600SemiBold",
  },
  periodRowMeta: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  periodRowIn: {
    color: Colors.success,
    fontFamily: "Poppins_600SemiBold",
  },
  periodRowOut: {
    color: Colors.accent.rose,
    fontFamily: "Poppins_600SemiBold",
  },
  periodRowNet: {
    ...Typography.bodyMedium,
    fontFamily: "Poppins_700Bold",
  },
  periodRowChart: {
    width: 140,
    alignItems: "center",
    justifyContent: "center",
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
    marginHorizontal: Spacing.base,
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
    paddingVertical: Spacing.md + 2,
    paddingHorizontal: Spacing.base,
  },
  txRowPressed: {
    backgroundColor: Colors.background,
  },
  txIcon: {
    fontSize: 22,
    fontFamily: "Poppins_400Regular",
  },
  txInfo: {
    flex: 1,
  },
  txName: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
    fontFamily: "Poppins_600SemiBold",
  },
  txDesc: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  txRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  txAmount: {
    ...Typography.bodySmall,
    color: Colors.textPrimary,
    fontFamily: "Poppins_700Bold",
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
    width: 80,
    height: 80,
    borderRadius: 40,
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
