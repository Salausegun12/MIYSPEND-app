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
import { IconContainer } from "../../components/ui/IconContainer";
import { Colors } from "../../constants/colors";
import { Radius } from "../../constants/radius";
import { Typography } from "../../constants/typography";
import { Spacing } from "../../constants/spacing";
import {
  getTotalExpenses,
  getAllExpenses,
  getTodayExpenseCount,
} from "../../database/expenses";
import { getTodayString, getWeekStart, getWeekEnd, getGreeting } from "../../utils/date";
import { formatKoboAmount } from "../../utils/money";
import type { ExpenseWithCategory } from "../../types/database";

export default function HomeScreen() {
  const router = useRouter();
  const db = useSQLiteContext();

  const [loading, setLoading] = useState(true);
  const [todayTotal, setTodayTotal] = useState(0);
  const [weekTotal, setWeekTotal] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [recentExpenses, setRecentExpenses] = useState<ExpenseWithCategory[]>(
    []
  );

  const loadData = useCallback(async () => {
    try {
      const today = getTodayString();
      const weekStart = getWeekStart();
      const weekEnd = getWeekEnd();

      const [todayTot, weekTot, count, recent] = await Promise.all([
        getTotalExpenses(db, today, today),
        getTotalExpenses(db, weekStart, weekEnd),
        getTodayExpenseCount(db, today),
        getAllExpenses(db, 5),
      ]);

      setTodayTotal(todayTot);
      setWeekTotal(weekTot);
      setTodayCount(count);
      setRecentExpenses(recent);
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

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.greeting}>{getGreeting()} 👋</Text>
          <Text style={styles.brand}>Miyspend</Text>
        </View>

        {hasExpenses ? (
          <>
            <View style={styles.summaryRow}>
              <Card style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Today's spending</Text>
                <Text style={styles.summaryAmount}>
                  {formatKoboAmount(todayTotal)}
                </Text>
              </Card>
              <Card style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>This week</Text>
                <Text style={styles.summaryAmount}>
                  {formatKoboAmount(weekTotal)}
                </Text>
              </Card>
            </View>

            <Card style={styles.countCard}>
              <Text style={styles.countText}>
                {todayCount} {todayCount === 1 ? "transaction" : "transactions"}{" "}
                today
              </Text>
            </Card>

            <View style={styles.recentSection}>
              <Text style={styles.sectionTitle}>Recent expenses</Text>
              <Card style={styles.recentCard}>
                {recentExpenses.map((expense, index) => (
                  <React.Fragment key={expense.id}>
                    {index > 0 && <View style={styles.divider} />}
                    <View style={styles.expenseRow}>
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
                    </View>
                  </React.Fragment>
                ))}
              </Card>
            </View>
          </>
        ) : (
          <Card style={styles.emptyCard}>
            <View style={styles.emptyContent}>
              <Ionicons
                name="wallet-outline"
                size={48}
                color={Colors.primary}
              />
              <Text style={styles.emptyTitle}>No expenses yet</Text>
              <Text style={styles.emptyMessage}>
                Start recording your spending to see your financial activity
                here.
              </Text>
            </View>
          </Card>
        )}

        <View style={styles.buttonWrapper}>
          <Button
            title="+ Add Expense"
            onPress={() => router.push("/add-expense" as Href)}
          />
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
  countCard: {
    alignItems: "center",
  },
  countText: {
    ...Typography.bodyMedium,
    color: Colors.textSecondary,
  },
  recentSection: {
    gap: Spacing.sm,
  },
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
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.xs,
  },
  emptyCard: {
    paddingVertical: Spacing.xxxl,
    alignItems: "center",
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
  },
});
