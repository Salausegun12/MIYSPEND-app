import { View, Text, StyleSheet } from "react-native";
import { Screen } from "../../components/ui";
import { Colors } from "../../constants/colors";
import { Typography } from "../../constants/typography";
import { Spacing } from "../../constants/spacing";

export default function ReportsScreen() {
  return (
    <Screen>
      <View style={styles.container}>
        <Text style={styles.title}>Reports</Text>
        <Text style={styles.subtitle}>Your spending reports will appear here.</Text>
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
    color: Colors.textPrimary,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
    textAlign: "center",
  },
});
