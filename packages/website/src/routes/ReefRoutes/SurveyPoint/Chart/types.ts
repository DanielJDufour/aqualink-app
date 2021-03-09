export type RangeValue = "three_months" | "one_year" | "max" | "custom";

export interface RangeButton {
  id: RangeValue;
  title: string;
  disabled?: boolean;
  tooltip: string;
}