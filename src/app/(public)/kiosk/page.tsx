import type { Metadata } from "next";

import { getPublicGarageBrand } from "@/lib/brand/garage-brand";

import { KioskClient } from "./KioskClient";

export const metadata: Metadata = {
  title: "Kiosk",
  robots: { index: false, follow: false },
};

/** V5.7 — Server wrapper resolves the garage brand once per request and
 *  hands it to the interactive kiosk client. Keeps the kiosk UI 100%
 *  client-driven (no auth, fully offline-capable) while still showing
 *  the right business name + logo. */
export default async function KioskPage() {
  const brand = await getPublicGarageBrand();
  return (
    <KioskClient
      brand={brand ? { name: brand.name, logoUrl: brand.logoUrl } : null}
    />
  );
}
