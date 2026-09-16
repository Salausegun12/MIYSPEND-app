import { View, Text, StyleSheet } from "react-native";
import { useRouter, Href } from "expo-router";
import { Screen, Button } from "../../components/ui";
import { Colors } from "../../constants/colors";
import { Typography } from "../../constants/typography";
import { Spacing } from "../../constants/spacing";

export default function HomeScreen() {
  const router = useRouter();

  return (
    <Screen>
      <View style={styles.container}>
        <Text style={styles.title}>MiySpend</Text>
        <Text style={styles.subtitle}>Your spending dashboard will appear here.</Text>
        <View style={styles.buttonWrapper}>
          <Button
            title="+ Add Expense"
            onPress={() => router.push("/add-expense" as Href)}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    ...Typography.h1,
    color: Colors.primary,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
    textAlign: "center",
  },
  buttonWrapper: {
    marginTop: Spacing.xl,
    width: "100%",
  },
});
