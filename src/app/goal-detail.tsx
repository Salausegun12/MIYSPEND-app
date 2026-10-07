import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
  Href,
} from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { SafeAreaView } from "react-native-safe-area-context";
import { AnimatedEntry } from "../components/ui/AnimatedEntry";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Divider } from "../components/ui/Divider";
import { EmptyState } from "../components/ui/EmptyState";
import { usePopup } from "../components/popup/PopupProvider";
import { Colors } from "../constants/colors";
import { Radius } from "../constants/radius";
import { Spacing } from "../constants/spacing";
import { Pressed } from "../constants/motion";
import { Typography } from "../constants/typography";
import {
  createContribution,
  deleteContribution,
  deleteGoal,
  getContributionsByGoal,
  getGoalWithBalance,
} from "../database/savingsGoals";
import { formatShortDate, getTodayString } from "../utils/date";
import { formatKoboAmount, nairaToKobo, parseNairaAmount } from "../utils/money";
import type { Contribution, SavingsGoalWithBalance } from "../types/database";

export default function GoalDetailScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const popup = usePopup();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const goalId = Number(id);

  const [goal, setGoal] = useState<SavingsGoalWithBalance | null>(null);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isSafeInteger(goalId) || goalId <= 0) {
      setLoading(false);
      return;
    }
    try {
      const [g, c] = await Promise.all([
        getGoalWithBalance(db, goalId),
        getContributionsByGoal(db, goalId),
      ]);
      setGoal(g);
      setContributions(c);
    } catch (e) {
      console.warn("Failed to load goal:", e);
    } finally {
      setLoading(false);
    }
  }, [db, goalId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleAddContribution() {
    const parsed = parseNairaAmount(amount);
    if (!amount.trim() || Number.isNaN(parsed) || parsed <= 0) {
      setError("Enter a valid amount");
      return;
    }
    if (saving) return;

    setSaving(true);
    setError(undefined);
    try {
      await createContribution(db, {
        goal_id: goalId,
        amount: nairaToKobo(parsed),
      });
      setAmount("");
      await load();
    } catch (e) {
      console.warn("Failed to add contribution:", e);
      setError(e instanceof Error ? e.message : "Failed to save contribution");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteContribution(contribution: Contribution) {
    const confirmed = await popup.confirm(
      "Delete Contribution",
      `Remove ${formatKoboAmount(contribution.amount)} from ${goal?.name ?? "this goal"}?`,
      { destructive: true, confirmText: "Delete" }
    );
    if (!confirmed) return;

    try {
      await deleteContribution(db, contribution.id);
      load();
    } catch (e) {
      console.warn("Failed to delete contribution:", e);
      popup.error("Failed to delete contribution.");
    }
  }

  async function confirmDeleteGoal() {
    if (!goal) return;
    const confirmed = await popup.confirm(
      "Delete Goal",
      `Delete ${goal.name}? Its ${contributions.length} ${
        contributions.length === 1 ? "contribution" : "contributions"
      } will be removed too. This cannot be undone.`,
      { destructive: true, confirmText: "Delete" }
    );
    if (!confirmed) return;

    try {
      await deleteGoal(db, goal.id);
      // Drop the detail screen too, so back does not land on a
      // deleted goal.
      router.dismissAll();
      router.push("/goals" as Href);
    } catch (e) {
      console.warn("Failed to delete goal:", e);
      popup.error("Failed to delete goal.");
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!goal) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={styles.closeButton}
            accessibilityLabel="Go back"
            hitSlop={8}
          >
            <Ionicons name="close" size={24} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Goal</Text>
        </View>
        <EmptyState
          title="Goal not found"
          message="This goal may have been deleted."
          icon={
            <Ionicons
              name="alert-circle-outline"
              size={40}
              color={Colors.textSecondary}
            />
          }
        />
      </SafeAreaView>
    );
  }

  const percent = goal.percent_complete;
  const fraction = Math.min(percent, 100) / 100;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.closeButton}
          accessibilityLabel="Go back"
          hitSlop={8}
        >
          <Ionicons name="close" size={24} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {goal.name}
        </Text>
        <Pressable
          onPress={() => router.push(`/goal-form?id=${goal.id}` as Href)}
          style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Edit goal"
          hitSlop={8}
        >
          <Ionicons name="create-outline" size={20} color={Colors.primary} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <AnimatedEntry delay={20}>
          <Card>
            <View style={styles.summaryTop}>
              <Text style={styles.saved}>{formatKoboAmount(goal.balance)}</Text>
              <Text style={styles.target}>
                {" "}
                of {formatKoboAmount(goal.target_amount)}
              </Text>
            </View>
            <Text
              style={[
                styles.percent,
                { color: goal.is_reached ? Colors.success : Colors.primary },
              ]}
            >
              {percent}% complete
            </Text>

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
                    backgroundColor: goal.is_reached
                      ? Colors.success
                      : Colors.primary,
                  },
                ]}
              />
            </View>

            <Divider style={styles.divider} />

            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Remaining</Text>
              <Text style={styles.statValue}>
                {goal.remaining > 0
                  ? formatKoboAmount(goal.remaining)
                  : "Target reached"}
              </Text>
            </View>
            {goal.target_date && (
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Target date</Text>
                <Text style={styles.statValue}>
                  {formatShortDate(goal.target_date)} {goal.target_date}
                </Text>
              </View>
            )}
            {goal.note ? (
              <View style={styles.noteBlock}>
                <Text style={styles.statLabel}>Note</Text>
                <Text style={styles.noteText}>{goal.note}</Text>
              </View>
            ) : null}
          </Card>
        </AnimatedEntry>

        <AnimatedEntry delay={60}>
          <Card>
            <Text style={styles.sectionLabel}>Add a contribution</Text>
            <View style={styles.addRow}>
              <View style={styles.amountInputWrap}>
                <Text style={styles.currency}>₦</Text>
                <TextInput
                  value={amount}
                  onChangeText={(t) => {
                    setAmount(t);
                    if (error) setError(undefined);
                  }}
                  placeholder="0"
                  placeholderTextColor={Colors.textSecondary}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  onSubmitEditing={handleAddContribution}
                  style={styles.amountInput}
                  accessibilityLabel="Contribution amount in naira"
                />
              </View>
              <Button
                title="Add"
                onPress={handleAddContribution}
                loading={saving}
                disabled={saving}
              />
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Text style={styles.helper}>
              Contributions are recorded manually. No money is moved.
            </Text>
          </Card>
        </AnimatedEntry>

        <AnimatedEntry delay={100}>
          <Text style={styles.listTitle}>
            Contributions ({contributions.length})
          </Text>
        </AnimatedEntry>

        {contributions.length === 0 ? (
          <EmptyState
            title="No contributions yet"
            message="Add your first contribution to start building this goal."
            icon={
              <Ionicons
                name="wallet-outline"
                size={36}
                color={Colors.textSecondary}
              />
            }
          />
        ) : (
          contributions.map((c) => (
            <View key={c.id} style={styles.contributionRow}>
              <Card>
                <View style={styles.contributionTop}>
                  <View style={styles.contributionInfo}>
                    <Text style={styles.contributionAmount}>
                      {formatKoboAmount(c.amount)}
                    </Text>
                    <Text style={styles.contributionDate}>
                      {c.date === getTodayString()
                        ? "Today"
                        : formatShortDate(c.date)}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => confirmDeleteContribution(c)}
                    style={({ pressed }) => [
                      styles.deleteButton,
                      pressed && styles.pressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete contribution of ${formatKoboAmount(c.amount)}`}
                    hitSlop={8}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={18}
                      color={Colors.error}
                    />
                  </Pressable>
                </View>
                {c.note ? (
                  <Text style={styles.contributionNote}>{c.note}</Text>
                ) : null}
              </Card>
            </View>
          ))
        )}

        <AnimatedEntry delay={140}>
          <Button
            title="Delete Goal"
            variant="destructive"
            onPress={confirmDeleteGoal}
          />
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
    gap: Spacing.md,
  },
  closeButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
    flex: 1,
  },
  editButton: {
    padding: Spacing.xs,
  },
  pressed: Pressed.default,
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
  summaryTop: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
  },
  saved: {
    ...Typography.h2,
    color: Colors.textPrimary,
  },
  target: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
  percent: {
    ...Typography.bodyMedium,
    fontWeight: "600",
    marginTop: 2,
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
  divider: {
    marginVertical: Spacing.md,
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.xs,
  },
  statLabel: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
  statValue: {
    ...Typography.bodySmall,
    color: Colors.textPrimary,
    fontWeight: "600",
  },
  noteBlock: {
    marginTop: Spacing.sm,
    gap: 2,
  },
  noteText: {
    ...Typography.bodySmall,
    color: Colors.textPrimary,
  },
  sectionLabel: {
    ...Typography.label,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  amountInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surface,
  },
  currency: {
    ...Typography.bodyMedium,
    color: Colors.textSecondary,
  },
  amountInput: {
    flex: 1,
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
    paddingVertical: Spacing.sm,
  },
  error: {
    ...Typography.caption,
    color: Colors.error,
    marginTop: Spacing.xs,
  },
  helper: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },
  listTitle: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
    marginTop: Spacing.sm,
  },
  contributionRow: {
    marginBottom: -Spacing.sm,
  },
  contributionTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  contributionInfo: {
    gap: 2,
  },
  contributionAmount: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
  },
  contributionDate: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  contributionNote: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  deleteButton: {
    padding: Spacing.xs,
    borderRadius: Radius.sm,
  },
});
