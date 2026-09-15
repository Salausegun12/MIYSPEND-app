import { View, Text, StyleSheet } from "react-native";
import { Link } from "expo-router";
import { Colors } from "../constants/colors";
import { Typography } from "../constants/typography";
import { Spacing } from "../constants/spacing";

export default function Index() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>MiySpend</Text>
      <Text style={styles.subtitle}>Project foundation ready.</Text>
      <Link href="/design-system" style={styles.link}>
        Open Design System Preview
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
  },
  title: {
    ...Typography.h1,
    color: Colors.primary,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },
  link: {
    ...Typography.bodyMedium,
    color: Colors.primary,
    marginTop: Spacing.xl,
  },
});
