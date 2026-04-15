// P47 — fixed passback checklist shown to MOT testers when they hand a job
// back to the mechanics. The `requiresDetail` items surface a free-text
// follow-up so a single bulb/other entry can carry specifics.

export interface PassbackItemDef {
  value: string;
  label: string;
  requiresDetail?: boolean;
}

export const PASSBACK_ITEMS: PassbackItemDef[] = [
  { value: "droplink", label: "Droplink" },
  { value: "tyres", label: "Tyres" },
  { value: "washer_pump", label: "Washer pump" },
  { value: "brake_pads", label: "Brake pads" },
  { value: "brake_disks", label: "Brake disks" },
  { value: "suspensions", label: "Suspensions" },
  { value: "hand_brake", label: "Hand brake" },
  { value: "wipers", label: "Wipers" },
  { value: "mirrors", label: "Mirrors" },
  { value: "light_bulb", label: "Light bulb", requiresDetail: true },
  { value: "other", label: "Other", requiresDetail: true },
];

export const PASSBACK_ITEM_VALUES = PASSBACK_ITEMS.map((i) => i.value) as [
  string,
  ...string[],
];

export const PASSBACK_LABEL_BY_VALUE: Record<string, string> = Object.fromEntries(
  PASSBACK_ITEMS.map((i) => [i.value, i.label]),
);

export interface PassbackItem {
  item: string;
  detail?: string;
}

export function summarisePassback(items: PassbackItem[] | null | undefined): string {
  if (!items || items.length === 0) return "";
  return items
    .map((i) => {
      const label = PASSBACK_LABEL_BY_VALUE[i.item] ?? i.item;
      return i.detail ? `${label} (${i.detail})` : label;
    })
    .join(", ");
}
