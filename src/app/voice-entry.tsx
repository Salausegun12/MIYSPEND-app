import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSQLiteContext } from "expo-sqlite";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { AnimatedEntry } from "../components/ui/AnimatedEntry";
import { usePopup } from "../components/popup/PopupProvider";
import { Colors } from "../constants/colors";
import { Radius } from "../constants/radius";
import { Typography } from "../constants/typography";
import { Spacing } from "../constants/spacing";
import { Pressed } from "../constants/motion";
import { getAllCategories } from "../database/categories";
import {
  getAllGoals,
  getGoalsWithBalances,
} from "../database/savingsGoals";
import {
  getBudgetsWithSpending,
  getCurrentBudgetPeriod,
} from "../database/budget";
import { getTotalIncome } from "../database/income";
import { getTotalExpenses } from "../database/expenses";
import { computeInsights } from "../database/insights";
import {
  applyBudgetAnswer,
  applyGoalAnswer,
  applyVoiceAnswer,
  buildBudgetQuestion,
  buildBudgetScript,
  buildGoalQuestion,
  buildGoalsScript,
  buildInsightsScript,
  buildNextQuestion,
  buildSpendingSummaryScript,
  confirmAndSaveBudgetDraft,
  confirmAndSaveGoalDraft,
  confirmAndSaveVoiceDraft,
  detectReadAloudTopic,
  detectVoiceIntent,
  getVoiceRecognizer,
  offlineTranscriptRecognizer,
  parseBudgetCommand,
  parseGoalCommand,
  parseVoiceCommand,
  summarizeBudgetDraft,
  summarizeGoalDraft,
  summarizeVoiceDraft,
  voiceCancelled,
  voiceDuplicateGuard,
  voiceNotHeard,
  voiceReadAloudFailed,
  voiceReadyToReview,
  voiceSaveFailed,
  voiceSpokenSaveConfirmation,
} from "../services/voice";
import { useVoicePlayback } from "../services/voice/useVoicePlayback";
import { registerExpoSpeechRecognizer } from "../services/voice/expoSpeechRecognizer";
import type {
  BudgetDraft,
  GoalDraft,
  ReadAloudScript,
  VoiceDraft,
  VoiceIntent,
  VoiceQuestionField,
  VoiceSummaryRow,
} from "../services/voice/types";
import type { Category, SavingsGoal } from "../types/database";
import { getMonthEnd, getMonthStart } from "../utils/date";

const SAMPLE_COMMANDS = [
  "I spent ₦3,000 on food today",
  "Record ₦50,000 income from freelance work",
  "Set my monthly food budget to ₦40,000",
  "Create a savings goal of ₦200,000 for a laptop",
  "How much did I spend this month?",
  "Read my spending insights",
];

/** A follow-up question normalised across the transaction, budget and goal flows. */
interface ScreenQuestion {
  field: string;
  prompt: string;
  kind: "choice" | "amount" | "text";
  options?: { label: string; value: string; detail?: string }[];
}

export default function VoiceEntryScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const popup = usePopup();

  const [categories, setCategories] = useState<Category[]>([]);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [existingBudgetCategoryIds, setExistingBudgetCategoryIds] = useState<
    Set<number>
  >(new Set());
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [mode, setMode] = useState<VoiceIntent | null>(null);
  const [transactionDraft, setTransactionDraft] = useState<VoiceDraft | null>(
    null
  );
  const [budgetDraft, setBudgetDraft] = useState<BudgetDraft | null>(null);
  const [goalDraft, setGoalDraft] = useState<GoalDraft | null>(null);
  const [question, setQuestion] = useState<ScreenQuestion | null>(null);
  const [answerAmount, setAnswerAmount] = useState("");
  const [answerText, setAnswerText] = useState("");
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [insightScript, setInsightScript] = useState<ReadAloudScript | null>(
    null
  );

  const handleUnavailable = useCallback(
    (message: string) => popup.info(message),
    [popup]
  );
  const playback = useVoicePlayback({ onUnavailable: handleUnavailable });
  // Install the on-device microphone recognizer once; the screen then drives
  // `getVoiceRecognizer()`, which now points at the real speech engine.
  useState(() => {
    registerExpoSpeechRecognizer();
  });

  const savingRef = useRef(false);
  const categoriesRef = useRef<Category[]>([]);
  categoriesRef.current = categories;
  const goalsRef = useRef<SavingsGoal[]>([]);
  goalsRef.current = goals;

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getAllCategories(db),
      getAllGoals(db),
      getBudgetsWithSpending(
        db,
        getCurrentBudgetPeriod(getMonthStart(), getMonthEnd())
      ),
    ])
      .then(([cats, goalList, budgets]) => {
        if (cancelled) return;
        setCategories(cats);
        setGoals(goalList);
        setExistingBudgetCategoryIds(
          new Set(budgets.map((budget) => budget.category_id))
        );
      })
      .catch((e) => console.warn("Failed to load voice command data:", e));
    return () => {
      cancelled = true;
    };
  }, [db]);

  /**
   * Answers a read-only question from data the app already has. The user asked
   * for this aloud, so the answer is spoken and also shown on screen; nothing
   * sensitive is ever read without this explicit request.
   */
  const prepareInsightAnswer = useCallback(
    async (text: string) => {
      const topic = detectReadAloudTopic(text);
      const monthStart = getMonthStart();
      const monthEnd = getMonthEnd();
      try {
        let script: ReadAloudScript;
        if (topic === "budgets") {
          const budgets = await getBudgetsWithSpending(
            db,
            getCurrentBudgetPeriod(monthStart, monthEnd)
          );
          script = buildBudgetScript(budgets);
        } else if (topic === "goals") {
          const goals = await getGoalsWithBalances(db);
          script = buildGoalsScript(goals);
        } else if (topic === "spending") {
          const [income, expenses] = await Promise.all([
            getTotalIncome(db, monthStart, monthEnd),
            getTotalExpenses(db, `${monthStart} 00:00:00`, `${monthEnd} 23:59:59`),
          ]);
          script = buildSpendingSummaryScript({
            label: "this month",
            totalIncomeKobo: income,
            totalExpensesKobo: expenses,
          });
        } else {
          const insights = await computeInsights(db);
          script = buildInsightsScript(insights);
        }
        setInsightScript(script);
        void playback.play(script.text);
      } catch (e) {
        console.warn("Failed to prepare read-aloud:", e);
        popup.error(voiceReadAloudFailed());
        reset();
      }
    },
    [db, playback, popup]
  );

  const handleTranscript = useCallback(
    (text: string) => {
      const clean = text.trim();
      if (!clean) {
        popup.warning(voiceNotHeard());
        setListening(false);
        return;
      }

      setTranscript(clean);
      setAnswerAmount("");
      setAnswerText("");
      setAnswerError(null);

      const intent = detectVoiceIntent(clean);
      setInsightScript(null);
      if (intent === "insight") {
        setMode("insight");
        setTransactionDraft(null);
        setBudgetDraft(null);
        setGoalDraft(null);
        setQuestion(null);
        void prepareInsightAnswer(clean);
      } else if (intent === "budget") {
        const parsed = parseBudgetCommand(clean, {
          categories: categoriesRef.current,
        });
        setMode("budget");
        setBudgetDraft(parsed);
        setTransactionDraft(null);
        setGoalDraft(null);
        setQuestion(buildBudgetQuestion(parsed, categoriesRef.current));
      } else if (intent === "goal") {
        const parsed = parseGoalCommand(clean, { goals: goalsRef.current });
        setMode("goal");
        setGoalDraft(parsed);
        setTransactionDraft(null);
        setBudgetDraft(null);
        setQuestion(buildGoalQuestion(parsed, goalsRef.current));
      } else {
        const parsed = parseVoiceCommand(clean, {
          categories: categoriesRef.current,
        });
        setMode("transaction");
        setTransactionDraft(parsed);
        setBudgetDraft(null);
        setGoalDraft(null);
        setQuestion(buildNextQuestion(parsed, categoriesRef.current));
      }
      setListening(false);
    },
    [prepareInsightAnswer, popup]
  );

  useEffect(() => {
    const recognizer = getVoiceRecognizer();
    return recognizer.subscribe((event) => {
      if (event.type === "listening") setListening(true);
      else if (event.type === "end") setListening(false);
      else if (event.type === "transcript" && event.isFinal) {
        handleTranscript(event.text);
      } else if (event.type === "error") {
        setListening(false);
        popup.warning(event.error.message);
      }
    });
  }, [handleTranscript, popup]);

  function startListening() {
    const recognizer = getVoiceRecognizer();
    if (listening) {
      recognizer.stop().catch(() => setListening(false));
      return;
    }
    recognizer.start().catch(() => {
      popup.warning("Voice is unavailable right now. You can type instead.");
    });
  }

  function submitTranscript(text: string) {
    // Typed input always goes through the offline recognizer. If a different
    // on-device engine is registered, hand the text straight to the parser
    // since that engine drives its own transcript events.
    if (getVoiceRecognizer() === offlineTranscriptRecognizer) {
      offlineTranscriptRecognizer.submit(text);
      return;
    }
    handleTranscript(text);
  }

  function submitTyped() {
    submitTranscript(transcript);
  }

  function answerQuestion(value: string) {
    setAnswerAmount("");
    setAnswerText("");
    setAnswerError(null);

    if (mode === "budget" && budgetDraft && question) {
      const next = applyBudgetAnswer(
        budgetDraft,
        question.field,
        value,
        categoriesRef.current
      );
      setBudgetDraft(next);
      setQuestion(buildBudgetQuestion(next, categoriesRef.current));
      return;
    }

    if (mode === "goal" && goalDraft && question) {
      const next = applyGoalAnswer(
        goalDraft,
        question.field,
        value,
        goalsRef.current
      );
      setGoalDraft(next);
      setQuestion(buildGoalQuestion(next, goalsRef.current));
      return;
    }

    if (mode === "transaction" && transactionDraft && question) {
      const next = applyVoiceAnswer(
        transactionDraft,
        question.field as VoiceQuestionField,
        value,
        categoriesRef.current
      );
      setTransactionDraft(next);
      setQuestion(buildNextQuestion(next, categoriesRef.current));
    }
  }

  function submitAmount() {
    const parsed = Number(answerAmount.replace(/[₦,\s]/g, ""));
    if (!answerAmount.trim() || !Number.isFinite(parsed) || parsed <= 0) {
      setAnswerError("Enter a valid amount");
      return;
    }
    answerQuestion(String(parsed));
  }

  function submitText() {
    const value = answerText.trim();
    if (!value) {
      setAnswerError("Enter a name");
      return;
    }
    answerQuestion(value);
  }

  function reset() {
    setTranscript("");
    setMode(null);
    setTransactionDraft(null);
    setBudgetDraft(null);
    setGoalDraft(null);
    setQuestion(null);
    setAnswerAmount("");
    setAnswerText("");
    setAnswerError(null);
    setInsightScript(null);
    setListening(false);
    void playback.stop();
  }

  function cancel() {
    reset();
    popup.info(voiceCancelled());
  }

  const confirm = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      let result: { status: string; message: string } | null = null;
      if (mode === "budget" && budgetDraft) {
        result = await confirmAndSaveBudgetDraft(
          db,
          budgetDraft,
          voiceDuplicateGuard
        );
      } else if (mode === "goal" && goalDraft) {
        result = await confirmAndSaveGoalDraft(
          db,
          goalDraft,
          voiceDuplicateGuard
        );
      } else if (mode === "transaction" && transactionDraft) {
        result = await confirmAndSaveVoiceDraft(
          db,
          transactionDraft,
          voiceDuplicateGuard
        );
      }

      if (!result) return;

      // A calm spoken confirmation that never includes figures. The detailed
      // result message stays on screen for the user to read.
      void playback.play(
        voiceSpokenSaveConfirmation(
          result.status as "saved" | "duplicate" | "duplicate_goal" | "unknown_goal" | "incomplete"
        )
      );

      if (result.status === "saved") {
        popup.success(result.message);
        router.back();
        return;
      }
      if (result.status === "duplicate" || result.status === "duplicate_goal") {
        popup.warning(result.message);
        reset();
        return;
      }
      popup.error(result.message);
    } catch (e) {
      console.warn("Voice save failed:", e);
      popup.error(voiceSaveFailed());
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [
    db,
    mode,
    budgetDraft,
    goalDraft,
    transactionDraft,
    popup,
    router,
    playback,
  ]);

  const step =
    mode === "insight"
      ? "answer"
      : !mode
        ? "capture"
        : question
          ? "question"
          : "review";

  const summaryRows: VoiceSummaryRow[] =
    mode === "budget" && budgetDraft
      ? summarizeBudgetDraft(
          budgetDraft,
          budgetDraft.categoryId !== null &&
            existingBudgetCategoryIds.has(budgetDraft.categoryId)
        )
      : mode === "goal" && goalDraft
        ? summarizeGoalDraft(goalDraft)
        : transactionDraft
          ? summarizeVoiceDraft(transactionDraft)
          : [];

  const reviewIcon: keyof typeof Ionicons.glyphMap =
    mode === "budget"
      ? "pie-chart"
      : mode === "goal"
        ? "flag"
        : transactionDraft?.type === "income"
          ? "arrow-down-circle"
          : "arrow-up-circle";
  const reviewColor =
    mode === "budget"
      ? Colors.primary
      : mode === "goal"
        ? Colors.accent.gold
        : transactionDraft?.type === "income"
          ? Colors.success
          : Colors.warning;
  const reviewBackground =
    mode === "budget"
      ? Colors.primarySoft
      : mode === "goal"
        ? Colors.accent.goldSoft
        : transactionDraft?.type === "income"
          ? Colors.successSoft
          : Colors.warningSoft;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <AnimatedEntry delay={40}>
          <View style={styles.header}>
            <Pressable
              onPress={() => router.back()}
              style={styles.backButton}
              accessibilityLabel="Close voice entry"
              hitSlop={8}
            >
              <Ionicons name="close" size={24} color={Colors.textPrimary} />
            </Pressable>
            <Text style={styles.headerTitle}>Voice Assistant</Text>
          </View>
        </AnimatedEntry>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.offlineNote}>
            <Ionicons name="mic-outline" size={14} color={Colors.primary} />
            <Text style={styles.offlineNoteText}>
              Speak to record income or an expense.
            </Text>
          </View>

          {playback.speaking && (
            <AnimatedEntry delay={20}>
              <Pressable
                onPress={() => void playback.stop()}
                style={({ pressed }) => [
                  styles.stopSpeech,
                  pressed && Pressed.default,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Stop reading aloud"
              >
                <Ionicons name="stop-circle-outline" size={18} color={Colors.textPrimary} />
                <Text style={styles.stopSpeechText}>Stop reading</Text>
              </Pressable>
            </AnimatedEntry>
          )}

          {step === "capture" && (
            <AnimatedEntry delay={60}>
              <View style={styles.captureBlock}>
                <Pressable
                  onPress={startListening}
                  style={({ pressed }) => [
                    styles.micButton,
                    listening && styles.micButtonActive,
                    pressed && styles.micButtonPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={
                    listening ? "Stop listening" : "Start voice entry"
                  }
                >
                  <Ionicons
                    name={listening ? "stop" : "mic"}
                    size={34}
                    color={Colors.white}
                  />
                </Pressable>
                <Text style={styles.micLabel}>
                  {listening ? "Listening…" : "Tap to speak"}
                </Text>

                <Input
                  label="Or type what you want to do"
                  placeholder="e.g. Set my monthly food budget to ₦40,000"
                  value={transcript}
                  onChangeText={(t) => {
                    setTranscript(t);
                    setAnswerError(null);
                  }}
                  onSubmitEditing={submitTyped}
                  returnKeyType="done"
                  autoCorrect={false}
                />

                <Button
                  title="Interpret"
                  onPress={submitTyped}
                  disabled={!transcript.trim()}
                />

                <View style={styles.samples}>
                  <Text style={styles.samplesTitle}>Try saying</Text>
                  {SAMPLE_COMMANDS.map((sample) => (
                    <Pressable
                      key={sample}
                      onPress={() => submitTranscript(sample)}
                      style={({ pressed }) => [
                        styles.sampleChip,
                        pressed && Pressed.default,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Use example: ${sample}`}
                    >
                      <Ionicons
                        name="chatbubble-ellipses-outline"
                        size={14}
                        color={Colors.primary}
                      />
                      <Text style={styles.sampleText}>{sample}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </AnimatedEntry>
          )}

          {step === "question" && question && (
            <AnimatedEntry delay={60}>
              <Card style={styles.card}>
                <Text style={styles.youSaid} numberOfLines={2}>
                  “{transcript}”
                </Text>
                <Text style={styles.questionPrompt}>{question.prompt}</Text>

                {question.kind === "choice" && (
                  <View style={styles.choices}>
                    {(question.options ?? []).map((option) => (
                      <Pressable
                        key={option.value}
                        onPress={() => answerQuestion(option.value)}
                        style={({ pressed }) => [
                          styles.choice,
                          pressed && Pressed.default,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={option.label}
                      >
                        {option.detail ? (
                          <Text style={styles.choiceIcon}>{option.detail}</Text>
                        ) : null}
                        <Text style={styles.choiceLabel}>{option.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}

                {question.kind === "amount" && (
                  <View style={styles.amountBlock}>
                    <View style={styles.amountRow}>
                      <Text style={styles.nairaSign}>₦</Text>
                      <View style={styles.amountField}>
                        <Input
                          placeholder="0.00"
                          keyboardType="decimal-pad"
                          value={answerAmount}
                          onChangeText={(t) => {
                            setAnswerAmount(t);
                            setAnswerError(null);
                          }}
                          error={answerError ?? undefined}
                          autoFocus
                        />
                      </View>
                    </View>
                    <Button title="Continue" onPress={submitAmount} />
                  </View>
                )}

                {question.kind === "text" && (
                  <View style={styles.amountBlock}>
                    <Input
                      placeholder="Goal name"
                      value={answerText}
                      onChangeText={(t) => {
                        setAnswerText(t);
                        setAnswerError(null);
                      }}
                      onSubmitEditing={submitText}
                      returnKeyType="done"
                      error={answerError ?? undefined}
                      autoFocus
                      autoCapitalize="sentences"
                    />
                    <Button title="Continue" onPress={submitText} />
                  </View>
                )}

                <View style={styles.questionActions}>
                  <Button
                    title="Cancel"
                    variant="secondary"
                    onPress={cancel}
                  />
                </View>
              </Card>
            </AnimatedEntry>
          )}

          {step === "review" && (
            <AnimatedEntry delay={60}>
              <Card style={styles.card}>
                <View style={styles.reviewHeader}>
                  <View
                    style={[
                      styles.reviewBadge,
                      { backgroundColor: reviewBackground },
                    ]}
                  >
                    <Ionicons name={reviewIcon} size={22} color={reviewColor} />
                  </View>
                  <View style={styles.reviewHeaderText}>
                    <Text style={styles.reviewTitle}>Does this look right?</Text>
                    <Text style={styles.youSaid} numberOfLines={2}>
                      “{transcript}”
                    </Text>
                  </View>
                </View>

                <View style={styles.summary}>
                  {summaryRows.map((row) => (
                    <View key={row.label} style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>{row.label}</Text>
                      <Text style={styles.summaryValue} numberOfLines={1}>
                        {row.value}
                      </Text>
                    </View>
                  ))}
                </View>
              </Card>

              <AnimatedEntry delay={90}>
                <View style={styles.footer}>
                  <Button
                    title="Confirm & Save"
                    onPress={confirm}
                    loading={saving}
                    disabled={saving}
                  />
                  <Button
                    title="Cancel"
                    variant="secondary"
                    onPress={cancel}
                    disabled={saving}
                  />
                  <Button
                    title="Read my summary"
                    variant="secondary"
                    onPress={() => void playback.play(voiceReadyToReview())}
                    disabled={saving}
                  />
                </View>
              </AnimatedEntry>
            </AnimatedEntry>
          )}

          {step === "answer" && (
            <AnimatedEntry delay={60}>
              <Card style={styles.card}>
                <View style={styles.reviewHeader}>
                  <View
                    style={[
                      styles.reviewBadge,
                      { backgroundColor: Colors.primarySoft },
                    ]}
                  >
                    <Ionicons name="volume-high-outline" size={22} color={Colors.primary} />
                  </View>
                  <View style={styles.reviewHeaderText}>
                    <Text style={styles.reviewTitle}>Here&apos;s what I found</Text>
                    <Text style={styles.youSaid} numberOfLines={2}>
                      “{transcript}”
                    </Text>
                  </View>
                </View>

                {insightScript ? (
                  <Text style={styles.answerText}>{insightScript.text}</Text>
                ) : (
                  <View style={styles.insightsLoading}>
                    <ActivityIndicator size="small" color={Colors.primary} />
                    <Text style={styles.insightsLoadingText}>
                      Looking that up...
                    </Text>
                  </View>
                )}

                {insightScript && (
                  <Button
                    title={playback.speaking ? "Read again" : "Read aloud"}
                    variant="secondary"
                    onPress={() => void playback.play(insightScript.text)}
                  />
                )}
              </Card>

              <AnimatedEntry delay={90}>
                <View style={styles.footer}>
                  <Button title="Ask something else" onPress={reset} />
                  <Button
                    title="Done"
                    variant="secondary"
                    onPress={() => router.back()}
                  />
                </View>
              </AnimatedEntry>
            </AnimatedEntry>
          )}

          {saving && (
            <View style={styles.savingRow}>
              <ActivityIndicator color={Colors.primary} size="small" />
              <Text style={styles.savingText}>Saving…</Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
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
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
  },
  backButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
    marginLeft: Spacing.md,
  },
  content: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.xxl,
    gap: Spacing.base,
  },
  offlineNote: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: Spacing.xs,
    backgroundColor: Colors.primarySoft,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.xl,
  },
  offlineNoteText: {
    ...Typography.caption,
    color: Colors.primary,
  },
  stopSpeech: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.xl,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
  stopSpeechText: {
    ...Typography.caption,
    color: Colors.textPrimary,
  },
  answerText: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
    lineHeight: 24,
  },
  insightsLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  insightsLoadingText: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
  captureBlock: {
    gap: Spacing.base,
    alignItems: "stretch",
  },
  micButton: {
    alignSelf: "center",
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.sm,
  },
  micButtonActive: {
    backgroundColor: Colors.accent.rose,
  },
  micButtonPressed: Pressed.default,
  micLabel: {
    ...Typography.bodyMedium,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  samples: {
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  samplesTitle: {
    ...Typography.label,
    color: Colors.textSecondary,
  },
  sampleChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  sampleText: {
    ...Typography.bodySmall,
    color: Colors.textPrimary,
    flex: 1,
  },
  card: {
    gap: Spacing.base,
  },
  youSaid: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    fontStyle: "italic",
  },
  questionPrompt: {
    ...Typography.h3,
    color: Colors.textPrimary,
  },
  choices: {
    gap: Spacing.sm,
  },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
  },
  choiceIcon: {
    fontSize: 18,
    fontFamily: "Poppins_400Regular",
  },
  choiceLabel: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
  },
  amountBlock: {
    gap: Spacing.base,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  nairaSign: {
    ...Typography.amount,
    color: Colors.primary,
  },
  amountField: {
    flex: 1,
  },
  questionActions: {
    marginTop: Spacing.xs,
  },
  reviewHeader: {
    flexDirection: "row",
    gap: Spacing.md,
    alignItems: "center",
  },
  reviewBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  reviewHeaderText: {
    flex: 1,
    gap: 2,
  },
  reviewTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
  },
  summary: {
    gap: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    paddingTop: Spacing.base,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.base,
  },
  summaryLabel: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
  summaryValue: {
    ...Typography.bodySmall,
    color: Colors.textPrimary,
    fontFamily: "Poppins_600SemiBold",
    flexShrink: 1,
    textAlign: "right",
  },
  footer: {
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  savingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  savingText: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
});
