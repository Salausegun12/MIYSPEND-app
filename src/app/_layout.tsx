import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { Colors } from "../constants/colors";
import { DatabaseProvider } from "../database/DatabaseProvider";

export default function RootLayout() {
  return (
    <DatabaseProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="add-expense"
          options={{
            presentation: "modal",
          }}
        />
      </Stack>
    </DatabaseProvider>
  );
}
