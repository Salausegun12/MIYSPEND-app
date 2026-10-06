import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter, Href } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { SafeAreaView } from "react-native-safe-area-context";
import { AnimatedEntry } from "../../components/ui/AnimatedEntry";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { Colors } from "../../constants/colors";
import { Radius } from "../../constants/radius";
import { Spacing } from "../../constants/spacing";
import { Pressed } from "../../constants/motion";
import { Typography } from "../../constants/typography";
import { getGoalsWithBalances } from "../../database/savingsGoals";
import { formatShortDate } from "../../utils/date";
import { formatKoboAmount } from "../../utils/money";
import type { SavingsGoalWithBalance } from "../../types/database";

function GoalCard({ goal }: { goal: SavingsGoalWithBalance }) {
  const router = useRouter();
  const percent = goal.percent_complete;
  const fraction = Math.min(percent, 100) / 100;
  const done = goal.is_reached;

  return (
    <Pressable
      onPress={() => router.push(`/goal-detail?id=${goal.id}` as Href)}
      style={({ pressed }) => (pressed ? styles.pressed : undefined)}
      accessibilityRole="button"
      accessibilityLabel={`${goal.name}, ${percent} percent complete`}
    >
      <Card>
        <View style={styles.cardHeader}>
          <View style={styles.iconWrap}>
            <Ionicons
              name={done ? "checkmark-circle" : "flag-outline"}
              size={20}
              color={done ? Colors.success : Colors.primary}
            />
          </View>
          <View style={styles.cardTitles}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {goal.name}
            </Text>
            {goal.target_date ? (
              <Text style={styles.cardSubtitle}>
                Target {formatShortDate(goal.target_date)}
              </Text>
            ) : (
              <Text style={styles.cardSubtitle}>No target date</Text>
            )}
          </View>
          <Text
            style={[
              styles.percent,
              { color: done ? Colors.success : Colors.primary },
            ]}
          >
            {percent}%
          </Text>
        </View>

        <View style={styles.amountRow}>
          <Text style={styles.saved}>{formatKoboAmount(goal.balance)}</Text>
          <Text style={styles.target}> / {formatKoboAmount(goal.target_amount)}</Text>
        </View>
        <Text style={styles.percentLabel}>complete</Text>

        <View
          style={styles.progressTrack}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: Math.min(percent, 100) }}
        >
          <View
            style={[
              styles.progressFill,
              {
                width: `${fraction * 100}%`,
                backgroundColor: done ? Colors.success : Colors.primary,
              },
            ]}
          />
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.remaining}>
            {goal.remaining > 0
              ? `${formatKoboAmount(goal.remaining)} to go`
              : "Target reached"}
          </Text>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={Colors.textSecondary}
          />
        </View>
      </Card>
    </Pressable>
  );
}

export default function GoalsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [goals, setGoals] = useState<SavingsGoalWithBalance[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setGoals(await getGoalsWithBalances(db));
    } catch (e) {
      console.warn("Failed to load goals:", e);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const totalTarget = goals.reduce((s, g) => s + g.target_amount, 0);
  const totalSaved = goals.reduce((s, g) => s + g.balance, 0);
  const completed = goals.filter((g) => g.is_reached).length;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Savings Goals</Text>
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
          {goals.length > 0 && (
            <AnimatedEntry delay={20}>
              <Card>
                <Text style={styles.summaryLabel}>All goals</Text>
                <View style={styles.summaryRow}>
                  <Text style={styles.summarySaved}>
                    {formatKoboAmount(totalSaved)}
                  </Text>
                  <Text style={styles.summaryTarget}>
                    {" "}
                    of {formatKoboAmount(totalTarget)} saved
                  </Text>
                </View>
                {completed > 0 && (
                  <View style={styles.summaryDone}>
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color={Colors.success}
                    />
                    <Text style={styles.summaryDoneText}>
                      {completed} {completed === 1 ? "goal" : "goals"} reached
                    </Text>
                  </View>
                )}
              </Card>
            </AnimatedEntry>
          )}

          {goals.length === 0 ? (
            <EmptyState
              title="No goals yet"
              message="Create a goal to start tracking money you are saving up for."
              icon={
                <Ionicons name="flag-outline" size={40} color={Colors.primary} />
              }
            />
          ) : (
            goals.map((goal, index) => (
              <AnimatedEntry key={goal.id} delay={40 + index * 20}>
                <GoalCard goal={goal} />
              </AnimatedEntry>
            ))
          )}

          <AnimatedEntry delay={120}>
            <Button
              title="New Goal"
              onPress={() => router.push("/goal-form" as Href)}
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
  headerTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
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
  pressed: Pressed.default,
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
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
  percent: {
    ...Typography.bodyMedium,
    fontWeight: "700",
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: Spacing.sm,
  },
  saved: {
    ...Typography.h3,
    color: Colors.textPrimary,
  },
  target: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
  percentLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.disabledBackground,
    overflow: "hidden",
    marginTop: Spacing.sm,
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.sm,
  },
  remaining: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
  summaryLabel: {
    ...Typography.label,
    color: Colors.textSecondary,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    marginTop: Spacing.xs,
  },
  summarySaved: {
    ...Typography.h2,
    color: Colors.textPrimary,
  },
  summaryTarget: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
  summaryDone: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  summaryDoneText: {
    ...Typography.caption,
    color: Colors.success,
    fontWeight: "500",
  },
});
