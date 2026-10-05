import type { ComponentProps } from "react";
import { Ionicons } from "@expo/vector-icons";
import type { IncomeSource } from "../types/database";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

export const INCOME_SOURCE_ICONS: Record<IncomeSource, IoniconName> = {
  Salary: "briefcase-outline",
  Freelance: "laptop-outline",
  Business: "storefront-outline",
  Allowance: "wallet-outline",
  Commission: "trending-up-outline",
  Gift: "gift-outline",
  Refund: "return-down-back-outline",
  Other: "ellipsis-horizontal-outline",
};

export const INCOME_SOURCE_COLORS: Record<IncomeSource, string> = {
  Salary: "#006B5B",
  Freelance: "#2563EB",
  Business: "#7C3AED",
  Allowance: "#0891B2",
  Commission: "#16B364",
  Gift: "#DB2777",
  Refund: "#F59E0B",
  Other: "#66736E",
};
