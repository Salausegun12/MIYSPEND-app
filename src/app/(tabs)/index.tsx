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
import { useSQLiteContext } from "expo-sqlite";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { AnimatedEntry } from "../../components/ui/AnimatedEntry";
import { IconContainer } from "../../components/ui/IconContainer";
import { Colors } from "../../constants/colors";
import { Typography } from "../../constants/typography";
import { Spacing } from "../../constants/spacing";
import { Pressed } from "../../constants/motion";
import {
  getTotalExpenses,
  getAllExpenses,
  getTodayExpenseCount,
} from "../../database/expenses";
import { getTotalIncome, getAllIncome } from "../../database/income";
import { processDueRecurringTransactions } from "../../database/recurring";
import {
  getTodayString,
  getWeekStart,
  getWeekEnd,
  getMonthStart,
  getMonthEnd,
  getGreeting,
} from "../../utils/date";
import { formatKoboAmount, formatSignedKoboAmount } from "../../utils/money";
import {
  INCOME_SOURCE_COLORS,
  INCOME_SOURCE_ICONS,
} from "../../constants/income";
import { getUserName } from "../../utils/user";
import type { ExpenseWithCategory, Income, IncomeSource } from "../../types/database";

interface PeriodSummary {
  label: string;
  income: number;
  expenses: number;
  caption?: string;
}

function PeriodBlock({ label, income, expenses, caption }: PeriodSummary) {
  const net = income - expenses;
  return (
    <View style={styles.summaryBlock}>
      <Text style={styles.summaryPeriod}>{label}</Text>
      <View style={styles.summaryRows}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Income</Text>
          <Text style={[styles.summaryValue, styles.incomeValue]}>
            {formatKoboAmount(income)}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Expenses</Text>
          <Text style={[styles.summaryValue, styles.expenseValue]}>
            {formatKoboAmount(expenses)}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Net</Text>
          <Text
            style={[
              styles.summaryValue,
              net >= 0 ? styles.netPositive : styles.netNegative,
            ]}
          >
            {formatSignedKoboAmount(net)}
          </Text>
        </View>
      </View>
      {caption ? (
        <Text style={styles.summaryCaption}>{caption}</Text>
      ) : null}
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
  const [recentExpenses, setRecentExpenses] = useState<ExpenseWithCategory[]>(
    []
  );
  const [recentIncomes, setRecentIncomes] = useState<Income[]>([]);
  const [userName, setUserName] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const today = getTodayString();
      const weekStart = getWeekStart();
      const weekEnd = getWeekEnd();
      const monthStart = getMonthStart();
      const monthEnd = getMonthEnd();

      // Record any recurring income/expenses that came due since last focus.
      await processDueRecurringTransactions(db);

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
      ] = await Promise.all([
        // Income stores a plain YYYY-MM-DD income_date, so it is queried with
        // plain date bounds while expenses keep their datetime bounds.
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

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.greeting}>
            {getGreeting()}{userName ? `, ${userName}` : ""} 👋
          </Text>
          <Text style={styles.brand}>MiySpend</Text>
        </View>

        <AnimatedEntry delay={40} style={styles.overviewSection}>
          <Card style={styles.summaryCard}>
            <PeriodBlock
              label="Today"
              income={todayIncome}
              expenses={todayExpense}
              caption={`${todayCount} expense${
                todayCount === 1 ? "" : "s"
              } recorded today`}
            />
            <View style={styles.summaryDivider} />
            <PeriodBlock
              label="This Week"
              income={weekIncome}
              expenses={weekExpense}
            />
            <View style={styles.summaryDivider} />
            <PeriodBlock
              label="This Month"
              income={monthIncome}
              expenses={monthExpense}
            />
          </Card>
          <Text style={styles.netNote}>
            Net is income you recorded minus expenses you recorded. It is not
            your bank balance.
          </Text>
        </AnimatedEntry>

        {hasExpenses ? (
          <View style={styles.recentSection}>
            <View style={styles.recentHeader}>
              <Text style={styles.sectionTitle}>Recent expenses</Text>
              <Pressable
                onPress={() => router.navigate("/(tabs)/history" as Href)}
                style={({ pressed }) => [
                  styles.seeAll,
                  pressed && styles.seeAllPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="View all expenses"
              >
                <Text style={styles.seeAllText}>See all</Text>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={Colors.primary}
                />
              </Pressable>
            </View>
            <Card style={styles.recentCard}>
              {recentExpenses.map((expense, index) => (
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
                    accessibilityLabel={`View ${expense.description} expense`}
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
                      <Text style={styles.expenseName}>
                        {expense.category_name}
                      </Text>
                      <Text style={styles.expenseDesc} numberOfLines={1}>
                        {expense.description}
                      </Text>
                    </View>
                    <Text style={styles.expenseAmount}>
                      {formatKoboAmount(expense.amount)}
                    </Text>
                  </Pressable>
                </React.Fragment>
              ))}
            </Card>
          </View>
        ) : null}

        {hasIncome ? (
          <View style={styles.recentSection}>
            <View style={styles.recentHeader}>
              <Text style={styles.sectionTitle}>Recent income</Text>
              <Pressable
                onPress={() => router.push("/income-history" as Href)}
                style={({ pressed }) => [
                  styles.seeAll,
                  pressed && styles.seeAllPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="View all income"
              >
                <Text style={styles.seeAllText}>See all</Text>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={Colors.primary}
                />
              </Pressable>
            </View>
            <Card style={styles.recentCard}>
              {recentIncomes.map((income, index) => {
                const source = income.source as IncomeSource;
                const color =
                  INCOME_SOURCE_COLORS[source] ?? Colors.primary;
                return (
                  <React.Fragment key={income.id}>
                    {index > 0 && <View style={styles.divider} />}
                    <Pressable
                      onPress={() =>
                        router.push(`/income-detail?id=${income.id}` as Href)
                      }
                      style={({ pressed }) => [
                        styles.expenseRow,
                        pressed && styles.expenseRowPressed,
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
                          name={
                            INCOME_SOURCE_ICONS[source] ?? "wallet-outline"
                          }
                          size={18}
                          color={color}
                        />
                      </IconContainer>
                      <View style={styles.expenseInfo}>
                        <Text style={styles.expenseName}>{source}</Text>
                        <Text style={styles.expenseDesc} numberOfLines={1}>
                          {income.note
                            ? income.note
                            : income.payment_method}
                        </Text>
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
        ) : null}

        {!hasExpenses && !hasIncome ? (
          <Card style={styles.emptyCard}>
            <View style={styles.emptyContent}>
              <View style={styles.emptyIcon}>
                <Ionicons
                  name="wallet-outline"
                  size={40}
                  color={Colors.primary}
                />
              </View>
              <Text style={styles.emptyTitle}>Nothing recorded yet</Text>
              <Text style={styles.emptyMessage}>
                Start recording your income and expenses to see your financial
                activity here.
              </Text>
            </View>
          </Card>
        ) : null}

        <View style={styles.buttonWrapper}>
          <Button
            title="+ Add Expense"
            onPress={() => router.push("/add-expense" as Href)}
          />
          <Button
            title="+ Add Income"
            variant="secondary"
            onPress={() => router.push("/add-income" as Href)}
          />
          <Pressable
            onPress={() => router.push("/recurring" as Href)}
            style={({ pressed }) => [
              styles.incomeHistoryLink,
              pressed && styles.seeAllPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Manage recurring transactions"
          >
            <Ionicons name="repeat-outline" size={16} color={Colors.primary} />
            <Text style={styles.seeAllText}>Manage Recurring Transactions</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
          </Pressable>
          <Pressable
            onPress={() => router.push("/income-history" as Href)}
            style={({ pressed }) => [
              styles.incomeHistoryLink,
              pressed && styles.seeAllPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="View income history"
          >
            <Ionicons
              name="trending-up-outline"
              size={16}
              color={Colors.primary}
            />
            <Text style={styles.seeAllText}>View Income History</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
          </Pressable>
        </View>
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
    backgroundColor: Colors.background,
  },
  header: {
    paddingTop: Spacing.base,
    paddingBottom: Spacing.sm,
  },
  greeting: {
    ...Typography.body,
    color: Colors.textSecondary,
  },
  brand: {
    ...Typography.h1,
    color: Colors.primary,
    marginTop: Spacing.xs,
  },
  overviewSection: {
    gap: Spacing.sm,
  },
  summaryCard: {
    gap: Spacing.md,
  },
  summaryBlock: {
    gap: Spacing.sm,
  },
  summaryPeriod: {
    ...Typography.h3,
    color: Colors.textPrimary,
  },
  summaryRows: {
    gap: Spacing.xs,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  summaryLabel: {
    ...Typography.bodyMedium,
    color: Colors.textSecondary,
  },
  summaryValue: {
    ...Typography.bodyMedium,
    fontWeight: "600",
  },
  incomeValue: {
    color: Colors.success,
  },
  expenseValue: {
    color: Colors.textPrimary,
  },
  netPositive: {
    color: Colors.success,
  },
  netNegative: {
    color: Colors.error,
  },
  summaryCaption: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: Colors.border,
  },
  netNote: {
    ...Typography.caption,
    color: Colors.textSecondary,
    paddingHorizontal: Spacing.xs,
  },
  recentSection: {
    gap: Spacing.sm,
  },
  recentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  seeAll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: Spacing.xs,
  },
  seeAllText: {
    ...Typography.bodySmall,
    color: Colors.primary,
    fontWeight: "600",
  },
  seeAllPressed: Pressed.default,
  sectionTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
  },
  recentCard: {
    padding: Spacing.sm,
  },
  expenseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  expenseRowPressed: Pressed.default,
  expenseIcon: {
    fontSize: 18,
  },
  expenseInfo: {
    flex: 1,
  },
  expenseName: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
  },
  expenseDesc: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  expenseAmount: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
    fontWeight: "600",
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
  emptyCard: {
    paddingVertical: Spacing.xxxl,
    alignItems: "center",
  },
  emptyIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: Colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyContent: {
    alignItems: "center",
    gap: Spacing.sm,
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
  buttonWrapper: {
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  incomeHistoryLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingVertical: Spacing.xs,
    marginTop: Spacing.xs,
  },
});
