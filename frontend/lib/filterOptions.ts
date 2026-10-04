// Filter option lists shared by the active Card and Map filter surfaces.
// They render very differently but must offer the same choices, so the options
// live here rather than being duplicated per component.

export const BED_OPTIONS: { label: string; value: number | null }[] = [
  { label: "Any",    value: null },
  { label: "Studio", value: 0 },
  { label: "1",      value: 1 },
  { label: "2",      value: 2 },
  { label: "3",      value: 3 },
  { label: "4",      value: 4 },
  { label: "5+",     value: 5 },
]

export type AvailabilityValue =
  | "now"
  | "june_2026"
  | "july_2026"
  | "august_2026"
  | "january_2027"
  | "august_2027"
  | "leased"
  | null

export const AVAIL_OPTIONS: { label: string; value: AvailabilityValue; dot?: string; dotBorder?: boolean }[] = [
  { label: "All",     value: null },
  { label: "Now",     value: "now",         dot: "#D2F55E" },
  { label: "Jun '26", value: "june_2026" },
  { label: "Jul '26", value: "july_2026" },
  { label: "Aug '26", value: "august_2026", dot: "#C7DDB5" },
  { label: "Jan '27", value: "january_2027" },
  { label: "Aug '27", value: "august_2027", dot: "#A9CFB1" },
  { label: "Leased",  value: "leased",      dot: "#f5f5f5", dotBorder: true },
]

export type PropertyTypeValue = "Apartment" | "House" | "Townhouse" | "Single Family Home" | null

export const PROPERTY_TYPE_OPTIONS: { label: string; value: PropertyTypeValue }[] = [
  { label: "All",           value: null },
  { label: "Apartment",     value: "Apartment" },
  { label: "House",         value: "House" },
  { label: "Townhouse",     value: "Townhouse" },
  { label: "Single Family", value: "Single Family Home" },
]
