import React, { useEffect, useState } from "react";
import { Stack, useRouter, useSegments, Href } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { useSQLiteContext } from "expo-sqlite";
import * as SplashScreen from "expo-splash-screen";
import { Colors } from "../constants/colors";
import { DatabaseProvider } from "../database/DatabaseProvider";
import { isOnboardingComplete } from "../utils/user";
import { processDueRecurringTransactions } from "../database/recurring";

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const router = useRouter();
  const segments = useSegments();
  const db = useSQLiteContext();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const complete = await isOnboardingComplete(db);
        if (cancelled) return;

        const inOnboarding = segments[0] === "onboarding";

        if (!complete && !inOnboarding) {
          router.replace("/onboarding" as Href);
        } else if (complete && inOnboarding) {
          router.replace("/(tabs)" as Href);
        }

        // Materialise any recurring transactions that came due since the last
        // launch. Purely local; never touches banks or the network.
        processDueRecurringTransactions(db).catch((e) => {
          console.warn("Failed to process recurring transactions:", e);
        });
      } catch (e) {
        console.warn("Onboarding check failed:", e);
      } finally {
        if (!cancelled) {
          setReady(true);
          await SplashScreen.hideAsync();
        }
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [db, segments, router]);

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
      <Stack.Screen
        name="add-expense"
        options={{ presentation: "modal", animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="add-income"
        options={{ presentation: "modal", animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="expense-detail"
        options={{ presentation: "modal", animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="income-history"
        options={{ presentation: "modal", animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="income-detail"
        options={{ presentation: "modal", animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="budget"
        options={{ presentation: "modal", animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="budget-form"
        options={{ presentation: "modal", animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="goal-detail"
        options={{ presentation: "modal", animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="goal-form"
        options={{ presentation: "modal", animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="recurring"
        options={{ presentation: "modal", animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="recurring-form"
        options={{ presentation: "modal", animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="search"
        options={{ presentation: "modal", animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="export"
        options={{ presentation: "modal", animation: "slide_from_bottom" }}
      />
      <Stack.Screen name="onboarding" options={{ animation: "fade" }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <DatabaseProvider>
      <StatusBar style="dark" />
      <RootNavigator />
    </DatabaseProvider>
  );
}
