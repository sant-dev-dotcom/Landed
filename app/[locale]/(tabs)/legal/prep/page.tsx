import { LegalDashboard } from "@/components/LegalDashboard";

// Appointment prep is presented as a sheet over the Legal dashboard.
export default function PrepPage() {
  return <LegalDashboard initialSheet="prep" />;
}
