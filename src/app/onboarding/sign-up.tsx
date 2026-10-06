import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSQLiteContext } from "expo-sqlite";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { Colors } from "../../constants/colors";
import { Typography } from "../../constants/typography";
import { Spacing } from "../../constants/spacing";
import { AnimatedEntry } from "../../components/ui/AnimatedEntry";
import { saveUserProfile } from "../../utils/user";

export default function OnboardingSignUpScreen() {
  const router = useRouter();
  const db = useSQLiteContext();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{
    name?: string;
    phone?: string;
    email?: string;
  }>({});

  function validate(): boolean {
    const next: typeof errors = {};
    if (!name.trim()) {
      next.name = "Please enter your name";
    }
    if (!phone.trim()) {
      next.phone = "Please enter your phone number";
    }
    if (!email.trim() || !email.includes("@")) {
      next.email = "Please enter a valid email";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleGetStarted() {
    if (!validate()) return;
    if (loading) return;

    setLoading(true);
    try {
      await saveUserProfile(db, name.trim(), phone.trim(), email.trim());
      router.replace("/(tabs)");
    } catch (e) {
      console.warn("Failed to save profile:", e);
      Alert.alert("Error", "Failed to save your profile. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <AnimatedEntry style={styles.header} delay={40}>
            <LinearGradient
              colors={Colors.gradient.primary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.iconCircle}
            >
              <Ionicons name="wallet" size={36} color={Colors.surface} />
            </LinearGradient>
            <Text style={styles.title}>Create Your Profile</Text>
            <Text style={styles.desc}>
              Tell us a bit about yourself so we can personalize your
              experience. This stays on your device.
            </Text>
          </AnimatedEntry>

          <AnimatedEntry style={styles.form} delay={120}>
            <Input
              label="Full Name"
              placeholder="e.g. Segun"
              value={name}
              onChangeText={(t) => {
                setName(t);
                setErrors((prev) => ({ ...prev, name: undefined }));
              }}
              error={errors.name}
              autoCapitalize="words"
            />
            <Input
              label="Phone Number"
              placeholder="e.g. 08012345678"
              value={phone}
              onChangeText={(t) => {
                setPhone(t);
                setErrors((prev) => ({ ...prev, phone: undefined }));
              }}
              error={errors.phone}
              keyboardType="phone-pad"
            />
            <Input
              label="Email Address"
              placeholder="e.g. segun@email.com"
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                setErrors((prev) => ({ ...prev, email: undefined }));
              }}
              error={errors.email}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </AnimatedEntry>

          <AnimatedEntry style={styles.footer} delay={200}>
            <Button
              title="Get Started"
              onPress={handleGetStarted}
              loading={loading}
              disabled={loading}
            />
          </AnimatedEntry>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxl,
    gap: Spacing.xl,
  },
  header: {
    alignItems: "center",
    paddingTop: Spacing.xxl,
    gap: Spacing.md,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primary,
    justifyContent: "center",
    alignItems: "center",
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
    maxWidth: 280,
  },
  form: {
    gap: Spacing.base,
  },
  footer: {
    paddingTop: Spacing.base,
  },
});
