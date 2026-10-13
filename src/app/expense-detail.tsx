import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Image,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSQLiteContext } from "expo-sqlite";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { usePopup } from "../components/popup/PopupProvider";
import { AnimatedEntry } from "../components/ui/AnimatedEntry";
import { Card } from "../components/ui/Card";
import { ExpensePhotoField } from "../components/ui/ExpensePhotoField";
import { Colors } from "../constants/colors";
import { Radius } from "../constants/radius";
import { Shadows } from "../constants/shadows";
import { Typography } from "../constants/typography";
import { Spacing } from "../constants/spacing";
import { Pressed } from "../constants/motion";
import {
  getExpenseById,
  updateExpense,
  deleteExpense,
} from "../database/expenses";
import { getAllCategories } from "../database/categories";
import { nairaToKobo, koboToNaira, parseNairaInput, formatKoboAmount, formatAmountInput } from "../utils/money";
import {
  discardAttachmentPhoto,
  isManagedAttachment,
  saveAttachmentPhoto,
} from "../services/attachments";
import type { ExpenseWithCategory, Category, PaymentMethod } from "../types/database";
import { PAYMENT_METHODS } from "../types/database";

function extractDatePart(datetimeStr: string): string {
  return datetimeStr.substring(0, 10);
}

function extractTimePart(datetimeStr: string): string {
  const parts = datetimeStr.split(" ");
  if (parts.length < 2) return "00:00";
  return parts[1].substring(0, 5);
}

function dateStringToDate(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00");
}

function timeStringToDate(timeStr: string): Date {
  const [h, m] = timeStr.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function formatDisplayDate(dateStr: string): string {
  const d = dateStringToDate(dateStr);
  return d.toLocaleDateString("en-NG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDisplayTime(timeStr: string): string {
  const [h, m] = timeStr.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toTimeString(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${min}`;
}

export default function ExpenseDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const popup = usePopup();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expense, setExpense] = useState<ExpenseWithCategory | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editing, setEditing] = useState(false);

  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | "">("");
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [note, setNote] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  const [errors, setErrors] = useState<{
    amount?: string;
    description?: string;
    category?: string;
    paymentMethod?: string;
  }>({});

  const loadExpense = useCallback(async () => {
    if (!id) return;
    try {
      const exp = await getExpenseById(db, Number(id));
      if (exp) {
        setExpense(exp);
        setAmount(formatAmountInput(String(koboToNaira(exp.amount))));
        setDescription(exp.description);
        setSelectedPaymentMethod(exp.payment_method as PaymentMethod);
        setNote(exp.note);
        setEditDate(extractDatePart(exp.date));
        setEditTime(extractTimePart(exp.date));
        setPhotoUri(exp.attachment_uri);
      }
      const cats = await getAllCategories(db);
      setCategories(cats);
      if (exp) {
        const cat = cats.find((c) => c.id === exp.category_id);
        if (cat) setSelectedCategory(cat);
      }
    } catch (e) {
      console.warn("Failed to load expense:", e);
    } finally {
      setLoading(false);
    }
  }, [db, id]);

  useEffect(() => {
    loadExpense();
  }, [loadExpense]);

  function clearError(field: keyof typeof errors) {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function validate(): boolean {
    const next: typeof errors = {};
    const parsed = parseNairaInput(amount);
    if (!amount.trim() || isNaN(parsed) || parsed <= 0) {
      next.amount = "Enter a valid amount";
    }
    if (!description.trim()) {
      next.description = "Enter what you bought";
    }
    if (!selectedCategory) {
      next.category = "Select a category";
    }
    if (!selectedPaymentMethod) {
      next.paymentMethod = "Select a payment method";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSave() {
    if (!validate() || !expense) return;
    if (saving) return;

    setSaving(true);
    try {
      const parsed = parseNairaInput(amount);
      const amountKobo = nairaToKobo(parsed);
      const dateTime = `${editDate} ${editTime}:00`;

      let attachmentUri: string | null = expense.attachment_uri;
      let removeOldPhoto = false;
      let photoFailed = false;

      if (photoUri === null) {
        if (expense.attachment_uri) {
          attachmentUri = null;
          removeOldPhoto = true;
        }
      } else if (photoUri === expense.attachment_uri) {
        attachmentUri = photoUri;
      } else if (isManagedAttachment(photoUri)) {
        attachmentUri = photoUri;
        removeOldPhoto = true;
      } else {
        const saved = await saveAttachmentPhoto({ uri: photoUri });
        if (saved.status === "saved") {
          attachmentUri = saved.uri;
          removeOldPhoto = Boolean(expense.attachment_uri);
        } else {
          // Keep the photo that was already there rather than losing it.
          photoFailed = true;
        }
      }

      await updateExpense(db, expense.id, {
        amount: amountKobo,
        category_id: selectedCategory!.id,
        description: description.trim(),
        payment_method: selectedPaymentMethod as string,
        note: note.trim(),
        date: dateTime,
        attachment_uri: attachmentUri,
      });

      if (removeOldPhoto && expense.attachment_uri) {
        await discardAttachmentPhoto(expense.attachment_uri);
      }

      setEditing(false);
      await loadExpense();
      if (photoFailed) {
        popup.warning(
          "Changes saved, but I couldn't store the new photo. Your previous photo was kept."
        );
      } else {
        popup.success("Expense updated successfully");
      }
    } catch (e) {
      console.warn("Failed to update expense:", e);
      popup.error("Failed to update expense. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!expense) return;
    const confirmed = await popup.confirm(
      "Delete Expense",
      "Are you sure you want to delete this expense? This action cannot be undone.",
      { destructive: true, confirmText: "Delete" }
    );
    if (!confirmed || !expense) return;

    try {
      await deleteExpense(db, expense.id);
      await discardAttachmentPhoto(expense.attachment_uri);
      router.back();
    } catch (e) {
      console.warn("Failed to delete expense:", e);
      popup.error("Failed to delete expense.");
    }
  }

  function onDateChange(event: DateTimePickerEvent, selectedDate?: Date) {
    if (Platform.OS === "android") {
      setShowDatePicker(false);
    }
    if (event.type === "set" && selectedDate) {
      setEditDate(toDateString(selectedDate));
    }
  }

  function onTimeChange(event: DateTimePickerEvent, selectedTime?: Date) {
    if (Platform.OS === "android") {
      setShowTimePicker(false);
    }
    if (event.type === "set" && selectedTime) {
      setEditTime(toTimeString(selectedTime));
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!expense) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
          >
            <Ionicons name="close" size={24} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Expense</Text>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.notFound}>Expense not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <AnimatedEntry delay={20}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
          >
            <Ionicons name="close" size={24} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Expense Details</Text>
          <View style={styles.headerActions}>
            {!editing && (
              <Pressable
                onPress={() => setEditing(true)}
                style={styles.headerButton}
                accessibilityRole="button"
                accessibilityLabel="Edit expense"
              >
                <Ionicons name="pencil-outline" size={20} color={Colors.primary} />
              </Pressable>
            )}
            <Pressable
              onPress={handleDelete}
              style={styles.headerButton}
              accessibilityRole="button"
              accessibilityLabel="Delete expense"
            >
              <Ionicons name="trash-outline" size={20} color={Colors.error} />
            </Pressable>
          </View>
        </View>
      </AnimatedEntry>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {!editing ? (
          <>
            <AnimatedEntry delay={40}>
              <LinearGradient
                colors={Colors.gradient.primary}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroSection}
              >
                <View style={styles.heroIconChip}>
                  <Text style={styles.heroIcon}>{expense.category_icon}</Text>
                </View>
                <Text style={styles.heroAmount}>
                  {formatKoboAmount(expense.amount)}
                </Text>
                <Text style={styles.heroCategory}>
                  {expense.category_name}
                </Text>
              </LinearGradient>
            </AnimatedEntry>

            <AnimatedEntry delay={100}>
              <Card style={styles.detailsCard}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Description</Text>
                  <Text style={styles.detailValue}>{expense.description}</Text>
                </View>
                <View style={styles.detailDivider} />
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Payment Method</Text>
                  <Text style={styles.detailValue}>{expense.payment_method}</Text>
                </View>
                <View style={styles.detailDivider} />
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Date</Text>
                  <Text style={styles.detailValue}>{expense.date}</Text>
                </View>
                {expense.note ? (
                  <>
                    <View style={styles.detailDivider} />
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Note</Text>
                      <Text style={styles.detailValue}>{expense.note}</Text>
                    </View>
                  </>
                ) : null}
              </Card>
            </AnimatedEntry>

            {expense.attachment_uri ? (
              <AnimatedEntry delay={140}>
                <View style={styles.photoSection}>
                  <Text style={styles.label}>Receipt photo</Text>
                  <Image
                    source={{ uri: expense.attachment_uri }}
                    style={styles.photo}
                    resizeMode="cover"
                    accessibilityLabel="Receipt photo"
                  />
                </View>
              </AnimatedEntry>
            ) : null}
          </>
        ) : (
          <>
            <View>
              <Text style={styles.label}>Amount</Text>
              <View style={styles.amountRow}>
                <Text style={styles.nairaSign}>₦</Text>
                <View style={styles.amountField}>
                  <Input
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    value={amount}
                    onChangeText={(t) => {
                      setAmount(formatAmountInput(t));
                      clearError("amount");
                    }}
                    error={errors.amount}
                  />
                </View>
              </View>
            </View>

            <View>
              <Input
                label="What did you buy?"
                placeholder="e.g. Lunch at work"
                value={description}
                onChangeText={(t) => {
                  setDescription(t);
                  clearError("description");
                }}
                error={errors.description}
              />
            </View>

            <View>
              <Text style={styles.label}>Category</Text>
              {errors.category ? (
                <Text style={styles.error}>{errors.category}</Text>
              ) : null}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chips}
              >
                {categories.map((cat) => {
                  const active = selectedCategory?.id === cat.id;
                  return (
                    <Pressable
                      key={cat.id}
                      onPress={() => {
                        setSelectedCategory(cat);
                        clearError("category");
                      }}
                      style={({ pressed }) => [
                        styles.chip,
                        active && {
                          borderColor: cat.color,
                          backgroundColor: cat.color + "15",
                        },
                        pressed && styles.chipPressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={styles.chipIcon}>{cat.icon}</Text>
                      <Text
                        style={[
                          styles.chipLabel,
                          active && { color: cat.color, fontWeight: "600" },
                        ]}
                      >
                        {cat.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <View>
              <Text style={styles.label}>Payment Method</Text>
              {errors.paymentMethod ? (
                <Text style={styles.error}>{errors.paymentMethod}</Text>
              ) : null}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chips}
              >
                {PAYMENT_METHODS.map((m) => {
                  const active = selectedPaymentMethod === m;
                  return (
                    <Pressable
                      key={m}
                      onPress={() => {
                        setSelectedPaymentMethod(m);
                        clearError("paymentMethod");
                      }}
                      style={({ pressed }) => [
                        styles.chip,
                        active && styles.chipActive,
                        pressed && styles.chipPressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Text
                        style={[
                          styles.chipLabel,
                          active && styles.chipLabelActive,
                        ]}
                      >
                        {m}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.row}>
              <View style={styles.half}>
                <Text style={styles.label}>Date</Text>
                <Pressable
                  onPress={() => setShowDatePicker(true)}
                  accessibilityRole="button"
                  accessibilityLabel={`Choose date, ${formatDisplayDate(editDate)}`}
                  style={({ pressed }) => [
                    pressed && styles.datePickerPressed,
                  ]}
                >
                  <Card style={styles.dateCard}>
                    <View style={styles.dateRow}>
                      <Ionicons name="calendar-outline" size={18} color={Colors.primary} />
                      <Text style={styles.dateValue}>{formatDisplayDate(editDate)}</Text>
                    </View>
                  </Card>
                </Pressable>
              </View>
              <View style={styles.half}>
                <Text style={styles.label}>Time</Text>
                <Pressable
                  onPress={() => setShowTimePicker(true)}
                  accessibilityRole="button"
                  accessibilityLabel={`Choose time, ${formatDisplayTime(editTime)}`}
                  style={({ pressed }) => [
                    pressed && styles.datePickerPressed,
                  ]}
                >
                  <Card style={styles.dateCard}>
                    <View style={styles.dateRow}>
                      <Ionicons name="time-outline" size={18} color={Colors.primary} />
                      <Text style={styles.dateValue}>{formatDisplayTime(editTime)}</Text>
                    </View>
                  </Card>
                </Pressable>
              </View>
            </View>

            {showDatePicker && (
              <DateTimePicker
                value={dateStringToDate(editDate)}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={onDateChange}
                maximumDate={new Date()}
              />
            )}

            {showTimePicker && (
              <DateTimePicker
                value={timeStringToDate(editTime)}
                mode="time"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={onTimeChange}
              />
            )}

            {Platform.OS === "ios" && showDatePicker && (
              <Pressable
                onPress={() => setShowDatePicker(false)}
                style={styles.pickerDone}
                accessibilityRole="button"
                accessibilityLabel="Done"
              >
                <Text style={styles.pickerDoneText}>Done</Text>
              </Pressable>
            )}

            {Platform.OS === "ios" && showTimePicker && (
              <Pressable
                onPress={() => setShowTimePicker(false)}
                style={styles.pickerDone}
                accessibilityRole="button"
                accessibilityLabel="Done"
              >
                <Text style={styles.pickerDoneText}>Done</Text>
              </Pressable>
            )}

            <ExpensePhotoField
              photoUri={photoUri}
              onChange={setPhotoUri}
              disabled={saving}
            />

            <View>
              <Input
                label="Note (optional)"
                placeholder="Any additional details..."
                value={note}
                onChangeText={setNote}
                multiline
                numberOfLines={3}
                style={styles.noteInput}
              />
            </View>

            <View style={styles.actions}>
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => {
                  setEditing(false);
                  setAmount(formatAmountInput(String(koboToNaira(expense.amount))));
                  setDescription(expense.description);
                  setSelectedPaymentMethod(expense.payment_method as PaymentMethod);
                  setNote(expense.note);
                  setEditDate(extractDatePart(expense.date));
                  setEditTime(extractTimePart(expense.date));
                  setPhotoUri(expense.attachment_uri);
                  const cat = categories.find((c) => c.id === expense.category_id);
                  if (cat) setSelectedCategory(cat);
                  setErrors({});
                }}
              />
              <Button
                title="Save Changes"
                onPress={handleSave}
                loading={saving}
                disabled={saving}
              />
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
    flex: 1,
  },
  headerActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  headerButton: {
    padding: Spacing.xs,
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
  notFound: {
    ...Typography.body,
    color: Colors.textSecondary,
  },
  heroSection: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
    borderRadius: Radius.xxl,
    ...Shadows.md,
  },
  heroIconChip: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.white + "26",
    alignItems: "center",
    justifyContent: "center",
  },
  heroIcon: {
    fontSize: 28,
  },
  heroAmount: {
    ...Typography.display,
    color: Colors.white,
  },
  heroCategory: {
    ...Typography.bodyMedium,
    color: Colors.white + "CC",
  },
  detailsCard: {
    gap: Spacing.sm,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: Spacing.xs,
  },
  detailLabel: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    flex: 1,
  },
  detailValue: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
    flex: 2,
    textAlign: "right",
  },
  detailDivider: {
    height: 1,
    backgroundColor: Colors.border,
  },
  photoSection: {
    gap: Spacing.xs,
  },
  photo: {
    width: "100%",
    height: 200,
    borderRadius: Radius.xl,
    backgroundColor: Colors.surfaceElevated,
  },
  label: {
    ...Typography.label,
    color: Colors.textPrimary,
  },
  error: {
    ...Typography.caption,
    color: Colors.error,
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
  chips: {
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    gap: Spacing.xs,
  },
  chipActive: {
    borderWidth: 1.5,
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySoft,
  },
  chipPressed: Pressed.default,
  chipIcon: {
    fontSize: 16,
  },
  chipLabel: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
  chipLabelActive: {
    color: Colors.primary,
    fontWeight: "600",
  },
  noteInput: {
    height: 80,
    textAlignVertical: "top",
    paddingTop: Spacing.md,
  },
  row: {
    flexDirection: "row",
    gap: Spacing.base,
  },
  half: {
    flex: 1,
    gap: Spacing.xs,
  },
  dateCard: {
    padding: Spacing.sm,
  },
  datePickerPressed: Pressed.subtle,
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  dateValue: {
    ...Typography.bodySmall,
    color: Colors.textPrimary,
  },
  pickerDone: {
    alignSelf: "flex-end",
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.base,
  },
  pickerDoneText: {
    ...Typography.bodyMedium,
    color: Colors.primary,
  },
  actions: {
    flexDirection: "row",
    gap: Spacing.base,
    paddingVertical: Spacing.base,
  },
});
