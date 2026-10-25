"use client";

import { BadgeCheck, Briefcase, FileText, Home, ShieldAlert, UserX } from "lucide-react";
import { useTranslations } from "next-intl";
import { ListRow } from "./ios/ListRow";

// Clay rose for warnings, sage for what helps, lavender and oat for everyday life.
export const RIGHTS = [
  { id: "notario", Icon: UserX, color: "var(--clay)" },
  { id: "guarantee", Icon: ShieldAlert, color: "var(--clay)" },
  { id: "forms", Icon: FileText, color: "var(--sage)" },
  { id: "checkLawyer", Icon: BadgeCheck, color: "var(--sage)" },
  { id: "tenant", Icon: Home, color: "var(--lavender)" },
  { id: "workplace", Icon: Briefcase, color: "var(--oat)" },
] as const;

export type RightId = (typeof RIGHTS)[number]["id"];

/** Know-your-rights row; pushes to the detail screen. */
export function RightsCard({ id }: { id: RightId }) {
  const t = useTranslations("rights");
  return <ListRow href={`/legal/rights/${id}`} title={t(`${id}.title`)} subtitle={t(`${id}.short`)} />;
}
