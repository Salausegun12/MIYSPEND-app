import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useRouter, useFocusEffect, Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSQLiteContext } from "expo-sqlite";
import { Input } from "../components/ui/Input";
import { Card } from "../components/ui/Card";
import { AnimatedEntry } from "../components/ui/AnimatedEntry";
import { IconContainer } from "../components/ui/IconContainer";
import { EmptyState } from "../components/ui/EmptyState";
import { Colors } from "../constants/colors";
import { Radius } from "../constants/radius";
import { Typography } from "../constants/typography";
import { Spacing } from "../constants/spacing";
import { Pressed } from "../constants/motion";
import { searchTransactions } from "../database/search";
import { getAllCategories } from "../database/categories";
import {
  nairaToKobo,
  parseNairaAmount,
  formatKoboAmount,
} from "../utils/money";
import { formatHistoryDate } from "../utils/date";
import {
  INCOME_SOURCE_COLORS,
  INCOME_SOURCE_ICONS,
} from "../constants/income";
import type {
  Category,
  IncomeSource,
  PaymentMethod,
  TransactionSearchResult,
  TransactionType,
} from "../types/database";
import { PAYMENT_METHODS } from "../types/database";

type TypeFilter = "all" | TransactionType;

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateStringToDate(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00");
}

function formatDisplayDate(dateStr: string): string {
  return dateStringToDate(dateStr).toLocaleDateString("en-NG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const TYPE_CHIPS: { key: TypeFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "income", label: "Income" },
  { key: "expense", label: "Expense" },
];

export default function SearchScreen() {
  const router = useRouter();
  const db = useSQLiteContext();

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [results, setResults] = useState<TransactionSearchResult[]>([]);
  const [searching, setSearching] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const cats = await getAllCategories(db);
        if (!cancelled) setCategories(cats);
      } catch (e) {
        console.warn("Failed to load categories:", e);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [db]);

  // Re-run the search whenever the screen regains focus (records may have
  // changed) or a filter changes. The query is debounced 250ms.
  useFocusEffect(
    useCallback(() => {
      setRefreshKey((key) => key + 1);
    }, [])
  );

  useEffect(() => {
    let cancelled = false;
    setSearching(true);

    const timer = setTimeout(async () => {
      const min = parseNairaAmount(minAmount);
      const max = parseNairaAmount(maxAmount);
      try {
        const found = await searchTransactions(db, {
          query: query.trim() || undefined,
          types: typeFilter === "all" ? undefined : [typeFilter],
          categoryId: categoryId ?? undefined,
          paymentMethod: paymentMethod ?? undefined,
          dateFrom: dateFrom ?? undefined,
          dateTo: dateTo ?? undefined,
          minAmount: isNaN(min) ? undefined : nairaToKobo(min),
          maxAmount: isNaN(max) ? undefined : nairaToKobo(max),
        });
        if (!cancelled) setResults(found);
      } catch (e) {
        console.warn("Search failed:", e);
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    db,
    query,
    typeFilter,
    categoryId,
    paymentMethod,
    dateFrom,
    dateTo,
    minAmount,
    maxAmount,
    refreshKey,
  ]);

  const hasActiveFilters =
    query.trim() !== "" ||
    typeFilter !== "all" ||
    categoryId !== null ||
    paymentMethod !== null ||
    dateFrom !== null ||
    dateTo !== null ||
    minAmount.trim() !== "" ||
    maxAmount.trim() !== "";

  const clearFilters = () => {
    setQuery("");
    setTypeFilter("all");
    setCategoryId(null);
    setPaymentMethod(null);
    setDateFrom(null);
    setDateTo(null);
    setMinAmount("");
    setMaxAmount("");
  };

  const onFromChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === "android") setShowFromPicker(false);
    if (event.type === "set" && selected) setDateFrom(toDateString(selected));
  };

  const onToChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === "android") setShowToPicker(false);
    if (event.type === "set" && selected) setDateTo(toDateString(selected));
  };

  const openResult = (result: TransactionSearchResult) => {
    if (result.type === "expense") {
      router.push(`/expense-detail?id=${result.id}` as Href);
    } else {
      router.push(`/income-detail?id=${result.id}` as Href);
    }
  };

  const renderResult = (result: TransactionSearchResult, index: number) => {
    if (result.type === "expense") {
      return (
        <React.Fragment key={`e${result.id}`}>
          {index > 0 && <View style={styles.divider} />}
          <Pressable
            onPress={() => openResult(result)}
            style={({ pressed }) => [
              styles.resultRow,
              pressed && styles.resultRowPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`View ${result.description} expense`}
          >
            <IconContainer
              size={40}
              backgroundColor={result.category_color + "20"}
            >
              <Text style={styles.expenseIcon}>{result.category_icon}</Text>
            </IconContainer>
            <View style={styles.resultInfo}>
              <Text style={styles.resultTitle} numberOfLines={1}>
                {result.description}
              </Text>
              <Text style={styles.resultMeta} numberOfLines={1}>
                {result.category_name}
                {result.payment_method ? ` · ${result.payment_method}` : ""}
                {" · "}
                {formatHistoryDate(result.date.substring(0, 10))}
              </Text>
            </View>
            <Text style={styles.resultAmount}>
              {formatKoboAmount(result.amount)}
            </Text>
          </Pressable>
        </React.Fragment>
      );
    }

    const source = result.source as IncomeSource;
    const color = INCOME_SOURCE_COLORS[source] ?? Colors.primary;
    return (
      <React.Fragment key={`i${result.id}`}>
        {index > 0 && <View style={styles.divider} />}
        <Pressable
          onPress={() => openResult(result)}
          style={({ pressed }) => [
            styles.resultRow,
            pressed && styles.resultRowPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`View ${result.source} income`}
        >
          <IconContainer size={40} backgroundColor={color + "20"}>
            <Ionicons
              name={INCOME_SOURCE_ICONS[source] ?? "wallet-outline"}
              size={18}
              color={color}
            />
          </IconContainer>
          <View style={styles.resultInfo}>
            <Text style={styles.resultTitle} numberOfLines={1}>
              {result.description}
            </Text>
            <Text style={styles.resultMeta} numberOfLines={1}>
              Income
              {result.payment_method ? ` · ${result.payment_method}` : ""}
              {" · "}
              {formatHistoryDate(result.date.substring(0, 10))}
            </Text>
          </View>
          <Text style={[styles.resultAmount, styles.incomeAmount]}>
            {formatKoboAmount(result.amount)}
          </Text>
        </Pressable>
      </React.Fragment>
    );
  };

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
              accessibilityLabel="Close search"
              hitSlop={8}
            >
              <Ionicons name="close" size={24} color={Colors.textPrimary} />
            </Pressable>
            <Text style={styles.headerTitle}>Search</Text>
            {hasActiveFilters ? (
              <Pressable
                onPress={clearFilters}
                style={({ pressed }) => [styles.clearButton, pressed && Pressed.default]}
                accessibilityRole="button"
                accessibilityLabel="Clear all filters"
              >
                <Text style={styles.clearText}>Clear</Text>
              </Pressable>
            ) : (
              <View style={styles.clearButton} />
            )}
          </View>
        </AnimatedEntry>

        <View style={styles.searchContainer}>
          <Input
            placeholder="Search description, source, category, payment method"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search transactions"
          />
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Type</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              {TYPE_CHIPS.map((chip) => {
                const active = typeFilter === chip.key;
                return (
                  <Pressable
                    key={chip.key}
                    onPress={() => setTypeFilter(chip.key)}
                    style={({ pressed }) => [
                      styles.typeChip,
                      active && styles.typeChipActive,
                      pressed && styles.chipPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Search ${chip.label}`}
                  >
                    <Text
                      style={[
                        styles.chipLabel,
                        active && styles.chipLabelActive,
                      ]}
                    >
                      {chip.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Category</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              <Pressable
                onPress={() => setCategoryId(null)}
                style={({ pressed }) => [
                  styles.chip,
                  categoryId === null && styles.chipActive,
                  pressed && styles.chipPressed,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: categoryId === null }}
              >
                <Text
                  style={[
                    styles.chipLabel,
                    categoryId === null && styles.chipLabelActive,
                  ]}
                >
                  All categories
                </Text>
              </Pressable>
              {categories.map((cat) => {
                const active = categoryId === cat.id;
                return (
                  <Pressable
                    key={cat.id}
                    disabled={typeFilter === "income"}
                    onPress={() => setCategoryId(active ? null : cat.id)}
                    style={({ pressed }) => [
                      styles.chip,
                      active && {
                        borderColor: cat.color,
                        backgroundColor: cat.color + "15",
                      },
                      typeFilter === "income" && styles.chipDisabled,
                      pressed && styles.chipPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active, disabled: typeFilter === "income" }}
                  >
                    <Text style={styles.chipIcon}>{cat.icon}</Text>
                    <Text
                      style={[
                        styles.chipLabel,
                        active && { color: cat.color, fontFamily: "Poppins_600SemiBold" },
                      ]}
                    >
                      {cat.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Payment Method</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              <Pressable
                onPress={() => setPaymentMethod(null)}
                style={({ pressed }) => [
                  styles.chip,
                  paymentMethod === null && styles.chipActive,
                  pressed && styles.chipPressed,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: paymentMethod === null }}
              >
                <Text
                  style={[
                    styles.chipLabel,
                    paymentMethod === null && styles.chipLabelActive,
                  ]}
                >
                  Any
                </Text>
              </Pressable>
              {PAYMENT_METHODS.map((method: PaymentMethod) => {
                const active = paymentMethod === method;
                return (
                  <Pressable
                    key={method}
                    onPress={() => setPaymentMethod(active ? null : method)}
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
                      {method}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Date Range</Text>
            <View style={styles.row}>
              <View style={styles.half}>
                <Pressable
                  onPress={() => setShowFromPicker(true)}
                  style={({ pressed }) => [
                    pressed && styles.datePickerPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`From ${dateFrom ? formatDisplayDate(dateFrom) : "any date"}`}
                >
                  <Card style={styles.dateCard}>
                    <View style={styles.dateRow}>
                      <Ionicons
                        name="calendar-outline"
                        size={18}
                        color={Colors.primary}
                      />
                      <Text style={styles.dateValue}>
                        {dateFrom ? formatDisplayDate(dateFrom) : "From"}
                      </Text>
                      {dateFrom ? (
                        <Ionicons
                          name="close-circle"
                          size={16}
                          color={Colors.textSecondary}
                        />
                      ) : null}
                    </View>
                  </Card>
                </Pressable>
              </View>
              <View style={styles.half}>
                <Pressable
                  onPress={() => setShowToPicker(true)}
                  style={({ pressed }) => [
                    pressed && styles.datePickerPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`To ${dateTo ? formatDisplayDate(dateTo) : "any date"}`}
                >
                  <Card style={styles.dateCard}>
                    <View style={styles.dateRow}>
                      <Ionicons
                        name="calendar-outline"
                        size={18}
                        color={Colors.primary}
                      />
                      <Text style={styles.dateValue}>
                        {dateTo ? formatDisplayDate(dateTo) : "To"}
                      </Text>
                      {dateTo ? (
                        <Ionicons
                          name="close-circle"
                          size={16}
                          color={Colors.textSecondary}
                        />
                      ) : null}
                    </View>
                  </Card>
                </Pressable>
              </View>
            </View>
            {dateFrom && dateTo && dateFrom > dateTo ? (
              <Text style={styles.rangeHint}>Start date is after end date.</Text>
            ) : null}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Amount Range (₦)</Text>
            <View style={styles.row}>
              <View style={styles.half}>
                <Input
                  placeholder="Min"
                  keyboardType="decimal-pad"
                  value={minAmount}
                  onChangeText={setMinAmount}
                  accessibilityLabel="Minimum amount"
                />
              </View>
              <View style={styles.half}>
                <Input
                  placeholder="Max"
                  keyboardType="decimal-pad"
                  value={maxAmount}
                  onChangeText={setMaxAmount}
                  accessibilityLabel="Maximum amount"
                />
              </View>
            </View>
          </View>

          {showFromPicker && (
            <DateTimePicker
              value={dateStringToDate(dateFrom ?? "2026-01-01")}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={onFromChange}
            />
          )}
          {showToPicker && (
            <DateTimePicker
              value={dateStringToDate(dateTo ?? "2026-01-01")}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={onToChange}
            />
          )}
          {Platform.OS === "ios" && showFromPicker && (
            <Pressable
              onPress={() => setShowFromPicker(false)}
              style={styles.pickerDone}
              accessibilityRole="button"
            >
              <Text style={styles.pickerDoneText}>Done</Text>
            </Pressable>
          )}
          {Platform.OS === "ios" && showToPicker && (
            <Pressable
              onPress={() => setShowToPicker(false)}
              style={styles.pickerDone}
              accessibilityRole="button"
            >
              <Text style={styles.pickerDoneText}>Done</Text>
            </Pressable>
          )}

          <View style={styles.resultsHeader}>
            <Text style={styles.resultsCount}>
              {searching
                ? "Searching..."
                : `${results.length} ${
                    results.length === 1 ? "result" : "results"
                  }`}
            </Text>
            {!searching && results.length > 0 ? (
              <Text style={styles.resultsHint}>Newest first</Text>
            ) : null}
          </View>

          {searching ? (
            <View style={styles.searching}>
              <ActivityIndicator size="small" color={Colors.primary} />
            </View>
          ) : results.length === 0 ? (
            <EmptyState
              title="No matching transactions"
              message="Try a different search term or clear some filters."
              icon={
                <Ionicons
                  name="search-outline"
                  size={48}
                  color={Colors.primary}
                />
              }
            />
          ) : (
            <Card style={styles.resultsCard}>
              {results.map(renderResult)}
            </Card>
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
    flex: 1,
  },
  clearButton: {
    minWidth: 44,
    alignItems: "flex-end",
    paddingVertical: Spacing.xs,
  },
  clearText: {
    ...Typography.bodySmall,
    color: Colors.primary,
    fontFamily: "Poppins_600SemiBold",
  },
  searchContainer: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.sm,
  },
  content: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.base,
  },
  section: {
    gap: Spacing.xs,
  },
  sectionLabel: {
    ...Typography.label,
    color: Colors.textSecondary,
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
  chipDisabled: {
    opacity: 0.4,
  },
  chipPressed: Pressed.default,
  chipIcon: {
    fontSize: 16,
    fontFamily: "Poppins_400Regular",
  },
  chipLabel: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
  chipLabelActive: {
    color: Colors.primary,
    fontFamily: "Poppins_600SemiBold",
  },
  typeChip: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    minWidth: 86,
  },
  typeChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
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
    flex: 1,
    ...Typography.bodySmall,
    color: Colors.textPrimary,
  },
  rangeHint: {
    ...Typography.caption,
    color: Colors.error,
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
  resultsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  resultsCount: {
    ...Typography.label,
    color: Colors.textSecondary,
  },
  resultsHint: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  searching: {
    paddingVertical: Spacing.xl,
    alignItems: "center",
  },
  resultsCard: {
    padding: Spacing.sm,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  resultRowPressed: Pressed.default,
  expenseIcon: {
    fontSize: 18,
    fontFamily: "Poppins_400Regular",
  },
  resultInfo: {
    flex: 1,
    gap: 2,
  },
  resultTitle: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
  },
  resultMeta: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  resultAmount: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
    fontFamily: "Poppins_600SemiBold",
  },
  incomeAmount: {
    color: Colors.success,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.xs,
  },
});