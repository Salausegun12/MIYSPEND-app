import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../constants/colors";
import { Radius } from "../../constants/radius";
import { Typography } from "../../constants/typography";
import { Spacing } from "../../constants/spacing";

export default function OnboardingWeeklyReportsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.illustration}>
          <View style={styles.illustBg}>
            <View style={styles.illustCircle}>
              <Ionicons name="calendar" size={60} color={Colors.primary} />
            </View>
            <View style={styles.floatingCard}>
              <Text style={styles.nairaIcon}>₦</Text>
            </View>
            <View style={[styles.floatingCard, styles.floatingCard2]}>
              <Ionicons name="bar-chart" size={18} color={Colors.primary} />
            </View>
          </View>
        </View>

        <View style={styles.info}>
          <Text style={styles.title}>Weekly Reports</Text>
          <Text style={styles.desc}>
            Get a clear breakdown of your spending with simple,
            easy-to-understand reports.
          </Text>
        </View>

        <View style={styles.footer}>
          <View style={styles.dots}>
            <View style={styles.dot} />
            <View style={[styles.dot, styles.dotActive]} />
            <View style={styles.dot} />
          </View>

          <Pressable
            style={styles.button}
            onPress={() => router.push("/onboarding/sign-up")}
          >
            <Text style={styles.buttonText}>Get Started</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  container: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    justifyContent: "space-between",
    paddingVertical: Spacing.xxl,
  },
  illustration: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  illustBg: {
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: Colors.primarySoft,
    justifyContent: "center",
    alignItems: "center",
  },
  illustCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: Colors.surface,
    justifyContent: "center",
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: Colors.textPrimary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
      },
      android: { elevation: 6 },
    }),
  },
  floatingCard: {
    position: "absolute",
    top: 30,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    justifyContent: "center",
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: Colors.textPrimary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
      },
      android: { elevation: 3 },
    }),
  },
  floatingCard2: {
    top: "auto",
    bottom: 30,
    right: "auto",
    left: 20,
  },
  nairaIcon: {
    ...Typography.h3,
    color: Colors.primary,
  },
  info: {
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.xl,
  },
  title: {
    ...Typography.h1,
    color: Colors.textPrimary,
    textAlign: "center",
  },
  desc: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: "center",
    maxWidth: 300,
  },
  footer: {
    gap: Spacing.lg,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.border,
  },
  dotActive: {
    backgroundColor: Colors.primary,
    width: 24,
  },
  button: {
    height: 52,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonText: {
    ...Typography.button,
    color: Colors.surface,
  },
});
