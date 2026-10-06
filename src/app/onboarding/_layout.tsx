import { Stack } from "expo-router";
import { Colors } from "../../constants/colors";

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.surface },
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="weekly-reports" />
      <Stack.Screen name="sign-up" />
    </Stack>
  );
}
