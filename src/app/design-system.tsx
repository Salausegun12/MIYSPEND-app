import React from "react";
import { Text, View, StyleSheet } from "react-native";
import {
  Button,
  Input,
  Card,
  Screen,
  SectionHeader,
  AmountText,
  IconContainer,
  Divider,
  EmptyState,
} from "../components/ui";
import { Colors } from "../constants/colors";
import { Radius } from "../constants/radius";
import { Typography } from "../constants/typography";
import { Spacing } from "../constants/spacing";

export default function DesignSystemPreview() {
  return (
    <Screen scrollable>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>MiySpend Design System</Text>
        <Text style={styles.headerSubtitle}>Development preview</Text>
      </View>

      <SectionHeader title="Colors" />
      <View style={styles.colorGrid}>
        {[
          { label: "Primary", color: Colors.primary },
          { label: "Primary Light", color: Colors.primaryLight },
          { label: "Primary Soft", color: Colors.primarySoft },
          { label: "Background", color: Colors.background },
          { label: "Surface", color: Colors.surface },
          { label: "Border", color: Colors.border },
          { label: "Success", color: Colors.success },
          { label: "Warning", color: Colors.warning },
          { label: "Error", color: Colors.error },
        ].map((item) => (
          <View key={item.label} style={styles.colorItem}>
            <View
              style={[styles.colorSwatch, { backgroundColor: item.color }]}
            />
            <Text style={styles.colorLabel}>{item.label}</Text>
            <Text style={styles.colorValue}>{item.color}</Text>
          </View>
        ))}
      </View>

      <Divider />

      <SectionHeader title="Typography" />
      <View style={styles.typeSection}>
        <Text style={styles.typeDisplay}>Display — ₦48,750</Text>
        <Text style={styles.typeH1}>Heading 1</Text>
        <Text style={styles.typeH2}>Heading 2</Text>
        <Text style={styles.typeH3}>Heading 3</Text>
        <Text style={styles.typeBody}>Body text</Text>
        <Text style={styles.typeBodyMedium}>Body medium</Text>
        <Text style={styles.typeBodySmall}>Body small</Text>
        <Text style={styles.typeCaption}>Caption</Text>
        <Text style={styles.typeLabel}>Label</Text>
      </View>

      <Divider />

      <SectionHeader title="Amount Display" />
      <Card>
        <AmountText amount={4875000} />
        <View style={{ height: Spacing.sm }} />
        <AmountText amount={125000000} small />
      </Card>

      <Divider />

      <SectionHeader title="Buttons" />
      <View style={styles.buttonSection}>
        <Button title="Primary Button" onPress={() => {}} />
        <View style={{ height: Spacing.sm }} />
        <Button title="Secondary Button" variant="secondary" onPress={() => {}} />
        <View style={{ height: Spacing.sm }} />
        <Button title="Destructive Button" variant="destructive" onPress={() => {}} />
        <View style={{ height: Spacing.sm }} />
        <Button title="Disabled Button" onPress={() => {}} disabled />
      </View>

      <Divider />

      <SectionHeader title="Text Input" />
      <View style={styles.inputSection}>
        <Input label="Label" placeholder="Enter amount" />
        <View style={{ height: Spacing.sm }} />
        <Input label="With error" placeholder="Enter value" error="This field is required" />
        <View style={{ height: Spacing.sm }} />
        <Input label="Disabled" placeholder="Not editable" editable={false} />
      </View>

      <Divider />

      <SectionHeader title="Card" />
      <Card>
        <Text style={styles.cardTitle}>Card Title</Text>
        <Text style={styles.cardBody}>This is a reusable card component.</Text>
      </Card>

      <Divider />

      <SectionHeader title="Icon Container" />
      <View style={styles.iconRow}>
        <IconContainer>
          <Text style={styles.iconText}>W</Text>
        </IconContainer>
        <IconContainer backgroundColor={Colors.primarySoft}>
          <Text style={styles.iconText}>T</Text>
        </IconContainer>
        <IconContainer backgroundColor={Colors.warning}>
          <Text style={styles.iconText}>!</Text>
        </IconContainer>
      </View>

      <Divider />

      <SectionHeader title="Empty State" />
      <Card>
        <EmptyState
          title="No expenses yet"
          message="Start tracking your spending by adding your first expense."
        />
      </Card>

      <View style={{ height: Spacing.xxxl }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingVertical: Spacing.xl,
  },
  headerTitle: {
    ...Typography.h1,
    color: Colors.textPrimary,
  },
  headerSubtitle: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  colorItem: {
    alignItems: "center",
    width: 100,
  },
  colorSwatch: {
    width: 64,
    height: 64,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  colorLabel: {
    ...Typography.caption,
    color: Colors.textPrimary,
    marginTop: Spacing.xs,
    fontWeight: "500",
  },
  colorValue: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  typeSection: {
    gap: Spacing.sm,
  },
  typeDisplay: {
    ...Typography.display,
    color: Colors.textPrimary,
  },
  typeH1: {
    ...Typography.h1,
    color: Colors.textPrimary,
  },
  typeH2: {
    ...Typography.h2,
    color: Colors.textPrimary,
  },
  typeH3: {
    ...Typography.h3,
    color: Colors.textPrimary,
  },
  typeBody: {
    ...Typography.body,
    color: Colors.textPrimary,
  },
  typeBodyMedium: {
    ...Typography.bodyMedium,
    color: Colors.textPrimary,
  },
  typeBodySmall: {
    ...Typography.bodySmall,
    color: Colors.textPrimary,
  },
  typeCaption: {
    ...Typography.caption,
    color: Colors.textPrimary,
  },
  typeLabel: {
    ...Typography.label,
    color: Colors.textPrimary,
  },
  buttonSection: {
    gap: 0,
  },
  inputSection: {},
  cardTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  cardBody: {
    ...Typography.bodySmall,
    color: Colors.textSecondary,
  },
  iconRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  iconText: {
    ...Typography.bodyMedium,
    color: Colors.primary,
    fontWeight: "600",
  },
});
