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
  applyVoiceAnswer,
  buildNextQuestion,
  offlineTranscriptRecognizer,
  parseVoiceCommand,
  summarizeVoiceDraft,
  voiceDuplicateGuard,
} from "../services/voice";
import { confirmAndSaveVoiceDraft } from "../services/voice/recorder";
import { getVoiceRecognizer } from "../services/voice/recognizer";
import type { VoiceDraft, VoiceQuestion } from "../services/voice/types";
import type { Category } from "../types/database";

const SAMPLE_COMMANDS = [
  "I spent ₦3,000 on food today",
  "Record ₦50,000 income from freelance work",
];

export default function VoiceEntryScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const popup = usePopup();

  const [categories, setCategories] = useState<Category[]>([]);
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [draft, setDraft] = useState<VoiceDraft | null>(null);
  const [question, setQuestion] = useState<VoiceQuestion | null>(null);
  const [answerAmount, setAnswerAmount] = useState("");
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const savingRef = useRef(false);
  const categoriesRef = useRef<Category[]>([]);
  categoriesRef.current = categories;

  useEffect(() => {
    let cancelled = false;
    getAllCategories(db)
      .then((cats) => {
        if (!cancelled) setCategories(cats);
      })
      .catch((e) => console.warn("Failed to load categories:", e));
    return () => {
      cancelled = true;
    };
  }, [db]);

  const handleTranscript = useCallback((text: string) => {
    const clean = text.trim();
    if (!clean) {
      popup.warning("I didn't catch that. Please try again.");
      setListening(false);
      return;
    }
    const parsed = parseVoiceCommand(clean, {
      categories: categoriesRef.current,
    });
    setTranscript(clean);
    setDraft(parsed);
    setQuestion(buildNextQuestion(parsed, categoriesRef.current));
    setAnswerAmount("");
    setAnswerError(null);
    setListening(false);
  }, [popup]);

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

  const answerQuestion = useCallback(
    (value: string) => {
      if (!draft || !question) return;
      const next = applyVoiceAnswer(
        draft,
        question.field,
        value,
        categoriesRef.current
      );
      setDraft(next);
      setQuestion(buildNextQuestion(next, categoriesRef.current));
      setAnswerAmount("");
      setAnswerError(null);
    },
    [draft, question]
  );

  function submitAmount() {
    const parsed = Number(answerAmount.replace(/[₦,\s]/g, ""));
    if (!answerAmount.trim() || !Number.isFinite(parsed) || parsed <= 0) {
      setAnswerError("Enter a valid amount");
      return;
    }
    answerQuestion(String(parsed));
  }

  function reset() {
    setTranscript("");
    setDraft(null);
    setQuestion(null);
    setAnswerAmount("");
    setAnswerError(null);
    setListening(false);
  }

  function cancel() {
    reset();
    popup.info("Cancelled");
  }

  const confirm = useCallback(async () => {
    if (!draft) return;
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const result = await confirmAndSaveVoiceDraft(
        db,
        draft,
        voiceDuplicateGuard
      );
      if (result.status === "saved") {
        popup.success(result.message);
        router.back();
        return;
      }
      if (result.status === "duplicate") {
        popup.warning(result.message);
        reset();
        return;
      }
      popup.error(result.message);
    } catch (e) {
      console.warn("Voice save failed:", e);
      popup.error("Could not save this entry. Please try again.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [db, draft, popup, router]);

  const step = !draft ? "capture" : question ? "question" : "review";

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
            <Text style={styles.headerTitle}>Voice Entry</Text>
          </View>
        </AnimatedEntry>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.offlineNote}>
            <Ionicons name="cloud-offline-outline" size={14} color={Colors.primary} />
            <Text style={styles.offlineNoteText}>
              Works offline. Nothing leaves your device.
            </Text>
          </View>

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
                  label="Or type what happened"
                  placeholder="e.g. I spent ₦3,000 on food today"
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
                      onPress={() =>
                        submitTranscript(sample)
                      }
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

          {step === "review" && draft && (
            <AnimatedEntry delay={60}>
              <Card style={styles.card}>
                <View style={styles.reviewHeader}>
                  <View
                    style={[
                      styles.reviewBadge,
                      {
                        backgroundColor:
                          draft.type === "income"
                            ? Colors.successSoft
                            : Colors.warningSoft,
                      },
                    ]}
                  >
                    <Ionicons
                      name={
                        draft.type === "income"
                          ? "arrow-down-circle"
                          : "arrow-up-circle"
                      }
                      size={22}
                      color={
                        draft.type === "income"
                          ? Colors.success
                          : Colors.warning
                      }
                    />
                  </View>
                  <View style={styles.reviewHeaderText}>
                    <Text style={styles.reviewTitle}>Does this look right?</Text>
                    <Text style={styles.youSaid} numberOfLines={2}>
                      “{transcript}”
                    </Text>
                  </View>
                </View>

                <View style={styles.summary}>
                  {summarizeVoiceDraft(draft).map((row) => (
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
