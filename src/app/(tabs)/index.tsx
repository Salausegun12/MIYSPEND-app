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
import { Button } from "../../components/ui/Button";
import { IconContainer } from "../../components/ui/IconContainer";
import { Colors } from "../../constants/colors";
import { Radius } from "../../constants/radius";
import { Shadows } from "../../constants/shadows";
import { Typography } from "../../constants/typography";
import { Spacing } from "../../constants/spacing";
import {
  getTotalExpenses,
  getAllExpenses,
  getTodayExpenseCount,
} from "../../database/expenses";
import { getTodayString, getWeekStart, getWeekEnd, getGreeting } from "../../utils/date";
import { formatKoboAmount } from "../../utils/money";
import { getUserName } from "../../utils/user";
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
  const [userName, setUserName] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const today = getTodayString();
      const weekStart = getWeekStart();
      const weekEnd = getWeekEnd();

      const [todayTot, weekTot, count, recent, name] = await Promise.all([
        getTotalExpenses(db, today, today),
        getTotalExpenses(db, weekStart, weekEnd),
        getTodayExpenseCount(db, today),
        getAllExpenses(db, 5),
        getUserName(db),
      ]);

      setTodayTotal(todayTot);
      setWeekTotal(weekTot);
      setTodayCount(count);
      setRecentExpenses(recent);
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

        <LinearGradient
          colors={Colors.gradient.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.heroLabel}>Today's spending</Text>
              <Text style={styles.heroAmount}>
                {formatKoboAmount(todayTotal)}
              </Text>
            </View>
            <View style={styles.heroBadge}>
              <Ionicons name="wallet" size={24} color={Colors.primary} />
            </View>
          </View>

          <View style={styles.heroChips}>
            <View style={styles.heroChip}>
              <Text style={styles.heroChipLabel}>This week</Text>
              <Text style={styles.heroChipValue}>
                {formatKoboAmount(weekTotal)}
              </Text>
            </View>
            <View style={styles.heroChip}>
              <Text style={styles.heroChipLabel}>Transactions today</Text>
              <Text style={styles.heroChipValue}>{todayCount}</Text>
            </View>
          </View>
        </LinearGradient>

        {hasExpenses ? (
          <View style={styles.recentSection}>
            <View style={styles.recentHeader}>
              <Text style={styles.sectionTitle}>Recent expenses</Text>
              <Pressable
                onPress={() => router.navigate("/(tabs)/history" as Href)}
                style={styles.seeAll}
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
        ) : (
          <Card style={styles.emptyCard}>
            <View style={styles.emptyContent}>
              <View style={styles.emptyIcon}>
                <Ionicons
                  name="wallet-outline"
                  size={40}
                  color={Colors.primary}
                />
              </View>
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
          <Button
            title="+ Add Income"
            variant="secondary"
            onPress={() => router.push("/add-income" as Href)}
          />
          <Pressable
            onPress={() => router.push("/income-history" as Href)}
            style={({ pressed }) => [
              styles.incomeHistoryLink,
              pressed && styles.incomeHistoryLinkPressed,
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
  hero: {
    borderRadius: Radius.xxl,
    padding: Spacing.lg,
    gap: Spacing.lg,
    ...Shadows.lg,
  },
  heroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  heroLabel: {
    ...Typography.bodySmall,
    color: Colors.white + "CC",
    marginBottom: Spacing.xs,
  },
  heroAmount: {
    ...Typography.display,
    fontSize: 38,
    color: Colors.white,
  },
  heroBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.white + "26",
    alignItems: "center",
    justifyContent: "center",
  },
  heroChips: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  heroChip: {
    flex: 1,
    backgroundColor: Colors.white + "1F",
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.base,
    gap: 2,
  },
  heroChipLabel: {
    ...Typography.caption,
    color: Colors.white + "CC",
  },
  heroChipValue: {
    ...Typography.bodyMedium,
    color: Colors.white,
    fontWeight: "600",
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
  incomeHistoryLinkPressed: {
    opacity: 0.65,
  },
});
