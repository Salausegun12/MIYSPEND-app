import React, { useEffect, useState } from "react";
import { Stack, useRouter, useSegments, Href } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { useSQLiteContext } from "expo-sqlite";
import * as SplashScreen from "expo-splash-screen";
import { Colors } from "../constants/colors";
import { DatabaseProvider } from "../database/DatabaseProvider";
import { isOnboardingComplete } from "../utils/user";

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
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="add-expense" options={{ presentation: "modal" }} />
      <Stack.Screen name="add-income" options={{ presentation: "modal" }} />
      <Stack.Screen name="expense-detail" options={{ presentation: "modal" }} />
      <Stack.Screen name="income-history" options={{ presentation: "modal" }} />
      <Stack.Screen name="income-detail" options={{ presentation: "modal" }} />
      <Stack.Screen name="onboarding" />
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
