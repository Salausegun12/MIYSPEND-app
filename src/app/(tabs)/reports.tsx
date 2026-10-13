import React, { useState, useCallback, useMemo } from "react";
import { LinearGradient } from "expo-linear-gradient";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSQLiteContext } from "expo-sqlite";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/ui/Button";
import { AnimatedEntry } from "../../components/ui/AnimatedEntry";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { IconContainer } from "../../components/ui/IconContainer";
import { BarChart } from "../../components/charts/BarChart";
import { PieChart } from "../../components/charts/PieChart";
import { HBarChart } from "../../components/charts/HBarChart";
import { Colors } from "../../constants/colors";
import { Radius } from "../../constants/radius";
import { Shadows } from "../../constants/shadows";
import { Typography } from "../../constants/typography";
import { Spacing } from "../../constants/spacing";
import { Pressed } from "../../constants/motion";
import {
  getTodayString,
  getWeekStart,
  getWeekStartForDate,
  getWeekEndForDate,
  shiftWeek,
  formatWeekRange,
  getDayOfWeek,
  formatShortDate,
  getWeekDays,
} from "../../utils/date";
import { formatKoboAmount, formatSignedKoboAmount } from "../../utils/money";
import {
  getExpensesByDateRange,
  getOldestExpenseDate,
  getTotalExpenses,
} from "../../database/expenses";
import {
  getIncomeByDateRange,
  getTotalIncome,
} from "../../database/income";
import {
  INCOME_SOURCE_COLORS,
  INCOME_SOURCE_ICONS,
} from "../../constants/income";
import {
  getReportAvailability,
  getReportPeriods,
  type ReportAvailabilitySummary,
  type ReportPeriod,
  type ReportPeriodId,
} from "../../utils/reportPeriods";
import { createSpendingReportHtml } from "../../utils/reportExport";
import { getBudgetsWithSpending } from "../../database/budget";
import {
  getContributionsInPeriod,
  getGoalsWithBalances,
} from "../../database/savingsGoals";
import {
  downloadSpendingReport,
  ReportDownloadError,
} from "../../utils/reportDownload";
import { computeInsights } from "../../database/insights";
import { buildInsightsScript } from "../../services/voice/readAloud";
import { useVoicePlayback } from "../../services/voice/useVoicePlayback";
import type {
  ExpenseWithCategory,
  IncomeSource,
  Insight,
  InsightTone,
} from "../../types/database";

interface CategorySpending {
  category_id: number;
  category_name: string;
  category_icon: string;
  category_color: string;
  total: number;
}

interface SourceIncome {
  source: IncomeSource;
  total: number;
  count: number;
}

interface DailySpending {
  date: string;
  dayName: string;
  shortDate: string;
  total: number;
}

interface ReportOption {
  period: ReportPeriod;
  expenses: ExpenseWithCategory[];
  total: number;
  availability: ReportAvailabilitySummary;
}

export default function ReportsScreen() {
  const db = useSQLiteContext();

  const [loading, setLoading] = useState(true);
  const [selectedMonday, setSelectedMonday] = useState(() => {
    return getWeekStartForDate(getTodayString());
  });

  const [weekTotal, setWeekTotal] = useState(0);
  const [prevWeekTotal, setPrevWeekTotal] = useState(0);
  const [weekIncome, setWeekIncome] = useState(0);
  const [prevWeekIncome, setPrevWeekIncome] = useState(0);
  const [dailySpending, setDailySpending] = useState<DailySpending[]>([]);
  const [categorySpending, setCategorySpending] = useState<CategorySpending[]>(
    []
  );
  const [sourceIncome, setSourceIncome] = useState<SourceIncome[]>([]);
  const [highestDay, setHighestDay] = useState<DailySpending | null>(null);
  const [highestCategory, setHighestCategory] =
    useState<CategorySpending | null>(null);
  const [highestSource, setHighestSource] = useState<SourceIncome | null>(null);
  const [averageDaily, setAverageDaily] = useState(0);
  const [averageDailyIncome, setAverageDailyIncome] = useState(0);
  const [reportOptions, setReportOptions] = useState<ReportOption[]>([]);
  const [selectedReportId, setSelectedReportId] =
    useState<ReportPeriodId>("current-week");
  const [reportLoading, setReportLoading] = useState(true);
  const [reportLoadError, setReportLoadError] = useState<string | null>(null);
  const [recordedDataStart, setRecordedDataStart] = useState<string | null>(
    null
  );
  const [downloadingReportId, setDownloadingReportId] =
    useState<ReportPeriodId | null>(null);
  const [reportFeedback, setReportFeedback] = useState<string | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(true);

  const handleSpeechUnavailable = useCallback((message: string) => {
    setReportFeedback(message);
  }, []);
  const insightsPlayback = useVoicePlayback({
    onUnavailable: handleSpeechUnavailable,
  });

  const weekSunday = useMemo(
    () => getWeekEndForDate(selectedMonday),
    [selectedMonday]
  );
  const prevMonday = useMemo(() => shiftWeek(selectedMonday, -1), [selectedMonday]);
  const prevSunday = useMemo(() => getWeekEndForDate(prevMonday), [prevMonday]);

  const isCurrentWeek = useMemo(() => {
    return selectedMonday === getWeekStart();
  }, [selectedMonday]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function load() {
        try {
          const weekDays = getWeekDays(selectedMonday);
          const start = `${selectedMonday} 00:00:00`;
          const end = `${weekSunday} 23:59:59`;
          const prevStart = `${prevMonday} 00:00:00`;
          const prevEnd = `${prevSunday} 23:59:59`;

          const [weekExpenses, weekTot, prevTot, weekIncs, prevIncs] =
            await Promise.all([
              getExpensesByDateRange(db, start, end),
              getTotalExpenses(db, start, end),
              getTotalExpenses(db, prevStart, prevEnd),
              // income_date is a plain YYYY-MM-DD column, so it is bounded with
              // plain dates rather than the expense-style datetime bounds.
              getIncomeByDateRange(db, selectedMonday, weekSunday),
              getTotalIncome(db, prevMonday, prevSunday),
            ]);

          if (cancelled) return;

          const daily: DailySpending[] = weekDays.map((dayDate) => {
            const dayKey = dayDate.substring(0, 10);
            const dayTotal = weekExpenses
              .filter((e) => e.date.startsWith(dayKey))
              .reduce((sum, e) => sum + e.amount, 0);
            return {
              date: dayDate,
              dayName: getDayOfWeek(dayDate),
              shortDate: formatShortDate(dayDate),
              total: dayTotal,
            };
          });

          const catMap = new Map<number, CategorySpending>();
          for (const exp of weekExpenses) {
            const existing = catMap.get(exp.category_id);
            if (existing) {
              existing.total += exp.amount;
            } else {
              catMap.set(exp.category_id, {
                category_id: exp.category_id,
                category_name: exp.category_name,
                category_icon: exp.category_icon,
                category_color: exp.category_color,
                total: exp.amount,
              });
            }
          }
          const cats = Array.from(catMap.values()).sort(
            (a, b) => b.total - a.total
          );

          const sourceMap = new Map<string, SourceIncome>();
          for (const inc of weekIncs) {
            const key = inc.source;
            const existing = sourceMap.get(key);
            if (existing) {
              existing.total += inc.amount;
              existing.count += 1;
            } else {
              sourceMap.set(key, {
                source: key as IncomeSource,
                total: inc.amount,
                count: 1,
              });
            }
          }
          const sources = Array.from(sourceMap.values()).sort(
            (a, b) => b.total - a.total
          );

          const hDay = daily.reduce(
            (max, d) => (d.total > max.total ? d : max),
            daily[0]
          );
          const hCat = cats[0] ?? null;
          const hSrc = sources[0] ?? null;
          // Keep the existing Monday-Sunday week length so income and expense
          // averages stay directly comparable.
          const avg = Math.round(weekTot / 7);
          const avgIncome = Math.round(weekIncs.reduce((s, i) => s + i.amount, 0) / 7);

          setWeekTotal(weekTot);
          setPrevWeekTotal(prevTot);
          setWeekIncome(weekIncs.reduce((s, i) => s + i.amount, 0));
          setPrevWeekIncome(prevIncs);
          setDailySpending(daily);
          setCategorySpending(cats);
          setSourceIncome(sources);
          setHighestDay(hDay);
          setHighestCategory(hCat);
          setHighestSource(hSrc);
          setAverageDaily(avg);
          setAverageDailyIncome(avgIncome);
        } catch (e) {
          console.warn("Failed to load report data:", e);
        } finally {
          if (!cancelled) setLoading(false);
        }
      }

      load();

      return () => {
        cancelled = true;
      };
    }, [db, selectedMonday, weekSunday, prevMonday, prevSunday])
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function loadReports() {
        setReportLoading(true);
        setReportLoadError(null);
        setReportFeedback(null);

        try {
          const periods = getReportPeriods();
          const oldestDate = await getOldestExpenseDate(db);
          const options = await Promise.all(
            periods.map(async (period) => {
              const expenses = await getExpensesByDateRange(
                db,
                period.startDateTime,
                period.dataEndDateTime
              );
              const total = expenses.reduce(
                (sum, expense) => sum + expense.amount,
                0
              );

              return {
                period,
                expenses,
                total,
                availability: getReportAvailability(
                  period,
                  oldestDate,
                  expenses.length
                ),
              };
            })
          );

          if (cancelled) return;
          setReportOptions(options);
          setRecordedDataStart(oldestDate);
        } catch (error) {
          console.warn("Failed to load report periods:", error);
          if (!cancelled) {
            setReportOptions([]);
            setReportLoadError(
              "Report availability could not be checked. Please try again."
            );
          }
        } finally {
          if (!cancelled) setReportLoading(false);
        }
      }

      loadReports();

      return () => {
        cancelled = true;
      };
    }, [db])
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function loadInsights() {
        setInsightsLoading(true);
        try {
          const result = await computeInsights(db);
          if (!cancelled) setInsights(result);
        } catch (error) {
          console.warn("Failed to load insights:", error);
          if (!cancelled) setInsights([]);
        } finally {
          if (!cancelled) setInsightsLoading(false);
        }
      }

      loadInsights();

      return () => {
        cancelled = true;
      };
    }, [db])
  );

  const insightToneColor = (tone: InsightTone): string => {
    if (tone === "positive") return Colors.success;
    if (tone === "warning") return Colors.warning;
    return Colors.primary;
  };

  const weekDiff = weekTotal - prevWeekTotal;
  const incomeDiff = weekIncome - prevWeekIncome;
  const weekNet = weekIncome - weekTotal;
  // Income-only weeks must still render the report, so income counts as data.
  const hasData = weekTotal > 0 || weekIncome > 0;
  const hasPrevData = prevWeekTotal > 0;
  const hasPrevIncome = prevWeekIncome > 0;
  const highlightItems = useMemo(() => {
    const items: {
      id: string;
      label: string;
      valueText: string;
      value: number;
      color: string;
    }[] = [];
    if (highestSource) {
      items.push({
        id: "source",
        label: "Highest Income Source",
        valueText: highestSource.source,
        value: highestSource.total,
        color: INCOME_SOURCE_COLORS[highestSource.source] ?? Colors.primary,
      });
    }
    if (highestCategory) {
      items.push({
        id: "category",
        label: "Highest Category",
        valueText: highestCategory.category_name,
        value: highestCategory.total,
        color: highestCategory.category_color,
      });
    }
    if (highestDay && highestDay.total > 0) {
      items.push({
        id: "day",
        label: "Highest Day",
        valueText: `${highestDay.dayName}, ${highestDay.shortDate}`,
        value: highestDay.total,
        color: Colors.primary,
      });
    }
    return items;
  }, [highestSource, highestCategory, highestDay]);
  const selectedReport = useMemo(
    () =>
      reportOptions.find((option) => option.period.id === selectedReportId) ??
      null,
    [reportOptions, selectedReportId]
  );

  const handleSelectReport = useCallback((id: ReportPeriodId) => {
    setSelectedReportId(id);
    setReportFeedback(null);
  }, []);

  const handleDownloadReport = useCallback(async () => {
    if (!selectedReport) return;

    if (selectedReport.availability.availability === "unavailable") {
      setReportFeedback(selectedReport.availability.message);
      return;
    }

    setDownloadingReportId(selectedReport.period.id);
    setReportFeedback(null);

    try {
      const period = selectedReport.period;
      const [incomes, budgets, goals, contributions] = await Promise.all([
        getIncomeByDateRange(db, period.startDate, period.endDate),
        getBudgetsWithSpending(db, {
          start: period.startDateTime,
          end: period.dataEndDateTime,
        }),
        getGoalsWithBalances(db),
        getContributionsInPeriod(db, period.startDate, period.endDate),
      ]);
      const html = createSpendingReportHtml(period, selectedReport.expenses, recordedDataStart, {
        incomes,
        budgets,
        goals,
        contributionsTotal: contributions.total,
        contributionsCount: contributions.count,
      });
      await downloadSpendingReport(
        html,
        `miyspend-${selectedReport.period.id}-${getTodayString()}.pdf`
      );
      setReportFeedback(
        selectedReport.availability.availability === "partial"
          ? "Partial PDF report downloaded. It contains only the recorded data available for this period."
          : "PDF report downloaded successfully."
      );
    } catch (error) {
      console.warn("Failed to download spending report:", error);
      setReportFeedback(
        error instanceof ReportDownloadError
          ? error.message
          : "Unable to download this report. Please try again."
      );
    } finally {
      setDownloadingReportId(null);
    }
  }, [db, recordedDataStart, selectedReport]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Reports</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <AnimatedEntry delay={20}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Reports</Text>
        </View>
      </AnimatedEntry>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <AnimatedEntry style={styles.weekNav} delay={40}>
          <Pressable
            onPress={() => setSelectedMonday(shiftWeek(selectedMonday, -1))}
            style={({ pressed }) => [
              styles.navArrow,
              pressed && styles.navArrowPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Previous week"
          >
            <Ionicons name="chevron-back" size={24} color={Colors.primary} />
          </Pressable>
          <View style={styles.weekInfoPill}>
            <View style={styles.weekInfo}>
              <Text style={styles.weekLabel}>
                {isCurrentWeek ? "This Week" : "Week of"}
              </Text>
              <Text style={styles.weekRange}>
                {formatWeekRange(selectedMonday, weekSunday)}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={() => setSelectedMonday(shiftWeek(selectedMonday, 1))}
            style={({ pressed }) => [
              styles.navArrow,
              pressed && styles.navArrowPressed,
            ]}
            disabled={isCurrentWeek}
            accessibilityRole="button"
            accessibilityLabel="Next week"
            accessibilityState={{ disabled: isCurrentWeek }}
          >
            <Ionicons
              name="chevron-forward"
              size={24}
              color={isCurrentWeek ? Colors.disabled : Colors.primary}
            />
          </Pressable>
        </AnimatedEntry>
        {!hasData ? (
          <EmptyState
            title="Nothing recorded this week"
            message="Income and expenses you record for this week will appear here."
            icon={
              <Ionicons
                name="bar-chart-outline"
                size={48}
                color={Colors.primary}
              />
            }
          />
        ) : (
          <>
            <View style={styles.summaryRow}>
              <LinearGradient
                colors={Colors.gradient.mint}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.summaryCardGradient}
              >
                <Text style={styles.summaryLabelOnColor}>Total Income</Text>
                <Text style={styles.summaryAmountOnColor}>
                  {formatKoboAmount(weekIncome)}
                </Text>
              </LinearGradient>
              <LinearGradient
                colors={Colors.gradient.sunset}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.summaryCardGradient}
              >
                <Text style={styles.summaryLabelOnColor}>Total Expenses</Text>
                <Text style={styles.summaryAmountOnColor}>
                  {formatKoboAmount(weekTotal)}
                </Text>
              </LinearGradient>
            </View>

            <View style={styles.summaryRow}>
              <LinearGradient
                colors={Colors.gradient.violet}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.summaryCardGradient}
              >
                <Text style={styles.summaryLabelOnColor}>Net</Text>
                <Text
                  style={[
                    styles.summaryAmountOnColor,
                    weekNet < 0 && styles.summaryAmountOnColorNeg,
                  ]}
                >
                  {formatSignedKoboAmount(weekNet)}
                </Text>
              </LinearGradient>
              <Card style={[styles.summaryCard, styles.summaryCardSky]}>
                <Text style={styles.summaryLabelSky}>Daily Avg Income</Text>
                <Text style={styles.summaryAmountSky}>
                  {formatKoboAmount(averageDailyIncome)}
                </Text>
              </Card>
            </View>

            <View style={styles.summaryRow}>
              <Card style={[styles.summaryCard, styles.summaryCardCoral]}>
                <Text style={styles.summaryLabelCoral}>Daily Avg Expenses</Text>
                <Text style={styles.summaryAmountCoral}>
                  {formatKoboAmount(averageDaily)}
                </Text>
              </Card>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Daily Spending</Text>
              <Card style={styles.chartCard}>
                <BarChart
                  data={dailySpending.map((day) => ({
                    id: day.date,
                    label: day.dayName,
                    subLabel: day.shortDate,
                    value: day.total,
                  }))}
                  activeId={getTodayString()}
                  formatValue={formatKoboAmount}
                  plotHeight={124}
                  color={Colors.accent.rose}
                  colorSoft="#FDA4AF"
                />
              </Card>
            </View>

            {sourceIncome.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Income by Source</Text>
                <Card style={styles.chartCard}>
                  <PieChart
                    data={sourceIncome.map((src) => ({
                      id: src.source,
                      label: src.source,
                      value: src.total,
                      color:
                        INCOME_SOURCE_COLORS[src.source] ?? Colors.primary,
                      icon:
                        INCOME_SOURCE_ICONS[src.source] ?? "wallet-outline",
                    }))}
                    total={weekIncome}
                    centerLabel="Total Income"
                    formatValue={formatKoboAmount}
                    size={148}
                    stroke={22}
                  />
                </Card>
              </View>
            )}

            {highestCategory && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Spending by Category</Text>
                <Card style={styles.categoryCard}>
                  {categorySpending.map((cat) => {
                    const pct =
                      weekTotal > 0
                        ? Math.round((cat.total / weekTotal) * 100)
                        : 0;
                    return (
                      <View key={cat.category_id} style={styles.catRow}>
                        <IconContainer
                          size={36}
                          backgroundColor={cat.category_color + "20"}
                        >
                          <Text style={styles.catIcon}>
                            {cat.category_icon}
                          </Text>
                        </IconContainer>
                        <View style={styles.catInfo}>
                          <View style={styles.catHeader}>
                            <Text style={styles.catName}>
                              {cat.category_name}
                            </Text>
                            <Text style={styles.catPct}>{pct}%</Text>
                          </View>
                          <View style={styles.catBarBg}>
                            <View
                              style={[
                                styles.catBarFill,
                                {
                                  width: `${pct}%`,
                                  backgroundColor: cat.category_color,
                                },
                              ]}
                            />
                          </View>
                        </View>
                        <Text style={styles.catAmount}>
                          {formatKoboAmount(cat.total)}
                        </Text>
                      </View>
                    );
                  })}
                </Card>
              </View>
            )}

            {highlightItems.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Highlights</Text>
                <Card style={styles.chartCard}>
                  <HBarChart
                    items={highlightItems}
                    formatValue={formatKoboAmount}
                  />
                </Card>
              </View>
            )}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Compare with Previous Week
              </Text>
              <Card style={styles.compareCard}>
                <View style={styles.compareRow}>
                  <View style={styles.compareItem}>
                    <Text style={styles.compareLabel}>Previous Expenses</Text>
                    <Text style={styles.compareAmount}>
                      {formatKoboAmount(prevWeekTotal)}
                    </Text>
                  </View>
                  <View style={styles.compareDivider} />
                  <View style={styles.compareItem}>
                    <Text style={styles.compareLabel}>Difference</Text>
                    <Text
                      style={[
                        styles.compareDiff,
                        weekDiff > 0
                          ? styles.diffIncrease
                          : weekDiff < 0
                            ? styles.diffDecrease
                            : styles.diffNeutral,
                      ]}
                    >
                      {formatSignedKoboAmount(weekDiff)}
                    </Text>
                    {!hasPrevData && weekTotal > 0 ? (
                      <Text style={styles.compareNote}>
                        No expenses recorded last week
                      </Text>
                    ) : weekDiff > 0 ? (
                      <Text style={styles.compareNote}>
                        Spending increased
                      </Text>
                    ) : weekDiff < 0 ? (
                      <Text style={styles.compareNote}>
                        Spending decreased
                      </Text>
                    ) : (
                      <Text style={styles.compareNote}>
                        Same as last week
                      </Text>
                    )}
                  </View>
                </View>

                <View style={styles.highlightDivider} />

                <View style={styles.compareRow}>
                  <View style={styles.compareItem}>
                    <Text style={styles.compareLabel}>Previous Income</Text>
                    <Text style={styles.compareAmount}>
                      {formatKoboAmount(prevWeekIncome)}
                    </Text>
                  </View>
                  <View style={styles.compareDivider} />
                  <View style={styles.compareItem}>
                    <Text style={styles.compareLabel}>Difference</Text>
                    <Text
                      style={[
                        styles.compareDiff,
                        styles.incomeAmount,
                        incomeDiff === 0 ? styles.diffNeutral : undefined,
                      ]}
                    >
                      {formatSignedKoboAmount(incomeDiff)}
                    </Text>
                    {!hasPrevIncome && weekIncome > 0 ? (
                      <Text style={styles.compareNote}>
                        No income recorded last week
                      </Text>
                    ) : incomeDiff > 0 ? (
                      <Text style={styles.compareNote}>Income increased</Text>
                    ) : incomeDiff < 0 ? (
                      <Text style={styles.compareNote}>Income decreased</Text>
                    ) : (
                      <Text style={styles.compareNote}>
                        Same as last week
                      </Text>
                    )}
                  </View>
                </View>
              </Card>
            </View>
          </>
        )}

        <AnimatedEntry style={styles.insightsSection} delay={80}>
          <View style={styles.insightsHeader}>
            <IconContainer size={44} backgroundColor={Colors.accent.goldSoft}>
              <Ionicons name="bulb-outline" size={22} color={Colors.accent.gold} />
            </IconContainer>
            <View style={styles.insightsHeaderText}>
              <Text style={styles.sectionTitle}>Insights</Text>
              <Text style={styles.insightsSubtitle}>
                Based on your recorded transactions this month
              </Text>
            </View>
            <Pressable
              onPress={() => {
                if (insightsPlayback.speaking) {
                  void insightsPlayback.stop();
                } else {
                  void insightsPlayback.play(buildInsightsScript(insights).text);
                }
              }}
              style={({ pressed }) => [
                styles.insightsListen,
                pressed && Pressed.default,
              ]}
              accessibilityRole="button"
              accessibilityLabel={
                insightsPlayback.speaking
                  ? "Stop reading insights aloud"
                  : "Read insights aloud"
              }
            >
              <Ionicons
                name={insightsPlayback.speaking ? "stop" : "volume-high-outline"}
                size={16}
                color={Colors.primary}
              />
              <Text style={styles.insightsListenText}>
                {insightsPlayback.speaking ? "Stop" : "Listen"}
              </Text>
            </Pressable>
          </View>

          {insightsLoading ? (
            <Card style={styles.insightsCard}>
              <View style={styles.insightsLoading}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.insightsLoadingText}>
                  Analysing your transactions...
                </Text>
              </View>
            </Card>
          ) : insights.length === 0 ? (
            <Card style={styles.insightsCard}>
              <Text style={styles.insightsEmpty}>
                Record at least one income or expense this month to start seeing
                insights.
              </Text>
            </Card>
          ) : (
            <Card style={styles.insightsCard}>
              {insights.map((insight, index) => {
                const toneColor = insightToneColor(insight.tone);
                return (
                  <React.Fragment key={insight.id}>
                    {index > 0 && <View style={styles.highlightDivider} />}
                    <View style={styles.insightRow}>
                      <IconContainer
                        size={36}
                        backgroundColor={toneColor + "20"}
                      >
                        <Ionicons
                          name={insight.icon as keyof typeof Ionicons.glyphMap}
                          size={18}
                          color={toneColor}
                        />
                      </IconContainer>
                      <Text style={styles.insightMessage}>{insight.message}</Text>
                    </View>
                  </React.Fragment>
                );
              })}
            </Card>
          )}
          <Text style={styles.netNote}>
            Insights are calculated offline from transactions you recorded.
            They never guess your bank balance.
          </Text>
        </AnimatedEntry>

        <AnimatedEntry style={styles.downloadSection} delay={120}>
          <View style={styles.downloadHeader}>
            <IconContainer
              size={44}
              backgroundColor={Colors.accent.violetSoft}
            >
              <Ionicons
                name="download-outline"
                size={22}
                color={Colors.accent.violet}
              />
            </IconContainer>
            <View style={styles.downloadHeaderText}>
              <Text style={styles.sectionTitle}>Download spending report</Text>
              <Text style={styles.downloadDescription}>
                Choose a period to save a PDF report for your records.
              </Text>
            </View>
          </View>

          {reportLoading ? (
            <View style={styles.reportLoading}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.reportLoadingText}>
                Checking available reports...
              </Text>
            </View>
          ) : reportLoadError ? (
            <Text style={styles.reportLoadError}>{reportLoadError}</Text>
          ) : (
            <>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.periodScroller}
              >
                {reportOptions.map((option) => {
                  const isSelected = option.period.id === selectedReportId;
                  const availability = option.availability.availability;
                  const statusColor =
                    availability === "available"
                      ? Colors.success
                      : availability === "partial"
                        ? Colors.warning
                        : Colors.error;
                  const statusLabel =
                    availability === "available"
                      ? "Available"
                      : availability === "partial"
                        ? "Partial"
                        : "Unavailable";

                  return (
                    <Pressable
                      key={option.period.id}
                      onPress={() => handleSelectReport(option.period.id)}
                      style={({ pressed }) => [
                        styles.periodChip,
                        isSelected && styles.periodChipSelected,
                        pressed && styles.periodChipPressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={`${option.period.label}, ${statusLabel}`}
                    >
                      <Text
                        style={[
                          styles.periodChipLabel,
                          isSelected && styles.periodChipLabelSelected,
                        ]}
                      >
                        {option.period.chipLabel}
                      </Text>
                      <Text style={[styles.periodChipStatus, { color: statusColor }]}>
                        {statusLabel}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {selectedReport ? (
                <Card style={styles.reportCard}>
                  <View style={styles.reportCardHeader}>
                    <View style={styles.reportCardTitleGroup}>
                      <Text style={styles.reportTitle}>
                        {selectedReport.period.label}
                      </Text>
                      <Text style={styles.reportRange}>
                        {selectedReport.period.rangeLabel}
                        {selectedReport.period.isCurrentWeek ? " · so far" : ""}
                      </Text>
                    </View>
                    <Ionicons
                      name={
                        selectedReport.availability.availability === "available"
                          ? "checkmark-circle"
                          : selectedReport.availability.availability === "partial"
                            ? "alert-circle"
                            : "close-circle"
                      }
                      size={26}
                      color={
                        selectedReport.availability.availability === "available"
                          ? Colors.success
                          : selectedReport.availability.availability === "partial"
                            ? Colors.warning
                            : Colors.error
                      }
                    />
                  </View>

                  <View
                    style={[
                      styles.reportStatus,
                      selectedReport.availability.availability === "available" &&
                        styles.reportStatusAvailable,
                      selectedReport.availability.availability === "partial" &&
                        styles.reportStatusPartial,
                      selectedReport.availability.availability === "unavailable" &&
                        styles.reportStatusUnavailable,
                    ]}
                  >
                    <Text style={styles.reportStatusText}>
                      {selectedReport.availability.message}
                    </Text>
                  </View>

                  {selectedReport.total > 0 && (
                    <Text style={styles.reportTotal}>
                      {formatKoboAmount(selectedReport.total)} across{" "}
                      {selectedReport.expenses.length}{" "}
                      {selectedReport.expenses.length === 1
                        ? "transaction"
                        : "transactions"}
                    </Text>
                  )}

                  <Button
                    title={
                      selectedReport.availability.availability === "unavailable"
                        ? "Report unavailable"
                        : selectedReport.availability.availability === "partial"
                          ? "Download partial PDF"
                          : "Download PDF report"
                    }
                    onPress={handleDownloadReport}
                    disabled={
                      selectedReport.availability.availability === "unavailable" ||
                      downloadingReportId !== null
                    }
                    loading={downloadingReportId === selectedReport.period.id}
                    style={styles.reportButton}
                  />

                  {reportFeedback && (
                    <Text style={styles.reportFeedback}>{reportFeedback}</Text>
                  )}
                </Card>
              ) : null}
            </>
          )}
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
  flex: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.base,
    paddingBottom: Spacing.sm,
  },
  headerTitle: {
    ...Typography.h1,
    color: Colors.textPrimary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.lg,
  },
  downloadSection: {
    gap: Spacing.md,
  },
  downloadHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  downloadHeaderText: {
    flex: 1,
    gap: Spacing.xs,
  },
  downloadDescription: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
  reportLoading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
  },
  reportLoadingText: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
  reportLoadError: {
    ...Typography.bodySmall,
    color: Colors.error,
  },
  periodScroller: {
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
    paddingRight: Spacing.base,
  },
  periodChip: {
    minWidth: 86,
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
  },
  periodChipSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySoft,
  },
  periodChipPressed: Pressed.default,
  periodChipLabel: {
    ...Typography.caption,
    color: Colors.textPrimary,
    textAlign: "center",
  },
  periodChipLabelSelected: {
    color: Colors.primary,
    fontWeight: "600",
  },
  periodChipStatus: {
    ...Typography.caption,
    fontSize: 10,
    lineHeight: 12,
    textAlign: "center",
  },
  reportCard: {
    padding: Spacing.base,
    gap: Spacing.md,
  },
  reportCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
  },
  reportCardTitleGroup: {
    flex: 1,
    gap: Spacing.xs,
  },
  reportTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
  },
  reportRange: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  reportStatus: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  reportStatusAvailable: {
    borderColor: Colors.success + "55",
    backgroundColor: Colors.success + "12",
  },
  reportStatusPartial: {
    borderColor: Colors.warning + "55",
    backgroundColor: Colors.warning + "12",
  },
  reportStatusUnavailable: {
    borderColor: Colors.error + "55",
    backgroundColor: Colors.error + "12",
  },
  reportStatusText: {
    ...Typography.bodySmall,
    color: Colors.textPrimary,
  },
  reportTotal: {
    ...Typography.label,
    color: Colors.textSecondary,
  },
  reportButton: {
    marginTop: Spacing.xs,
  },
  reportFeedback: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  insightsSection: {
    gap: Spacing.sm,
  },
  insightsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  insightsHeaderText: {
    flex: 1,
    gap: Spacing.xs,
  },
  insightsListen: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.primarySoft,
    borderRadius: Radius.xl,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
  insightsListenText: {
    ...Typography.caption,
    color: Colors.primary,
  },
  insightsSubtitle: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
  insightsCard: {
    padding: Spacing.sm,
    gap: Spacing.sm,
  },
  insightsLoading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  insightsLoadingText: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
  insightsEmpty: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    textAlign: "center",
    paddingVertical: Spacing.sm,
  },
  insightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  insightMessage: {
    flex: 1,
    ...Typography.bodySmall,
    color: Colors.textPrimary,
  },
  weekNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  navArrow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    ...Shadows.sm,
  },
  navArrowPressed: {
    opacity: 0.55,
    transform: [{ scale: 0.92 }],
  },
  weekInfoPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.primary + "40",
    borderRadius: Radius.xl,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    ...Shadows.sm,
  },
  weekInfo: {
    alignItems: "center",
    gap: 2,
  },
  weekLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  weekRange: {
    ...Typography.bodyMedium,
    color: Colors.primary,
    fontWeight: "700",
  },
  summaryRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  summaryCard: {
    flex: 1,
  },
  summaryCardGradient: {
    flex: 1,
    gap: Spacing.xs,
    borderRadius: Radius.xl,
    padding: Spacing.base,
    ...Shadows.md,
  },
  summaryLabelOnColor: {
    ...Typography.caption,
    color: "rgba(255,255,255,0.78)",
    marginBottom: Spacing.xs,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  summaryAmountOnColor: {
    ...Typography.amountSmall,
    color: Colors.white,
  },
  summaryAmountOnColorNeg: {
    color: "#FFE1E6",
  },
  summaryCardSky: {
    backgroundColor: Colors.accent.skySoft,
    borderColor: "#BEE7FB",
  },
  summaryLabelSky: {
    ...Typography.caption,
    color: Colors.accent.sky,
    marginBottom: Spacing.xs,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  summaryAmountSky: {
    ...Typography.amountSmall,
    color: "#0369A1",
  },
  summaryCardCoral: {
    backgroundColor: Colors.accent.coralSoft,
    borderColor: "#FFE0CC",
  },
  summaryLabelCoral: {
    ...Typography.caption,
    color: Colors.accent.coral,
    marginBottom: Spacing.xs,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  summaryAmountCoral: {
    ...Typography.amountSmall,
    color: "#C2410C",
  },
  section: {
    gap: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.h3,
    fontSize: 16,
    lineHeight: 22,
    color: Colors.textPrimary,
    fontWeight: "700",
  },
  chartCard: {
    padding: Spacing.md,
    gap: Spacing.md,
    overflow: "hidden",
  },
  categoryCard: {
    padding: Spacing.sm,
    gap: Spacing.md,
    overflow: "hidden",
  },
  catRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.xs,
  },
  catIcon: {
    fontSize: 18,
  },
  catInfo: {
    flex: 1,
    gap: 6,
  },
  catHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  catName: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
    fontWeight: "600",
  },
  catPct: {
    ...Typography.caption,
    color: Colors.textSecondary,
    fontWeight: "600",
  },
  catBarBg: {
    height: 8,
    backgroundColor: Colors.borderLight,
    borderRadius: 4,
    overflow: "hidden",
  },
  catBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  catAmount: {
    ...Typography.bodySmall,
    color: Colors.textPrimary,
    fontWeight: "700",
    minWidth: 72,
    textAlign: "right",
  },
  incomeAmount: {
    color: Colors.success,
  },
  netNote: {
    ...Typography.caption,
    color: Colors.textTertiary,
    paddingHorizontal: Spacing.xs,
  },
  highlightDivider: {
    height: 1,
    backgroundColor: Colors.borderLight,
    marginHorizontal: Spacing.sm,
  },
  compareCard: {
    padding: Spacing.base,
    gap: Spacing.md,
  },
  compareRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  compareItem: {
    flex: 1,
    gap: Spacing.xs,
  },
  compareDivider: {
    width: 1,
    backgroundColor: Colors.borderLight,
    alignSelf: "stretch",
    marginHorizontal: Spacing.base,
  },
  compareLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  compareAmount: {
    ...Typography.amountSmall,
    color: Colors.textPrimary,
  },
  compareDiff: {
    ...Typography.amountSmall,
  },
  diffIncrease: {
    color: Colors.error,
  },
  diffDecrease: {
    color: Colors.success,
  },
  diffNeutral: {
    color: Colors.textPrimary,
  },
  compareNote: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
});

