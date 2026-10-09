export interface Finding {
  severity: "critical" | "high" | "medium" | "low";
  file: string;
  title: string;
  detail: string;
  verify: string;
  fix: string;
}
