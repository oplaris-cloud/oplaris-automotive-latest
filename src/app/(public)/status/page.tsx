import type { Metadata } from "next";

import { getPublicGarageBrand } from "@/lib/brand/garage-brand";

import { StatusClient } from "./StatusClient";

export const metadata: Metadata = {
  title: "Vehicle Status",
  robots: { index: false, follow: false },
};

/** V5.7 — Server wrapper resolves the garage brand once per request and
 *  hands it to the (anonymous, polling) status client. The brand
 *  helper uses the service-role client because anonymous customers
 *  carry no JWT — RLS would otherwise hide every garage row. */
export default async function StatusPage() {
  const brand = await getPublicGarageBrand();
  return (
    <StatusClient
      brand={brand ? { name: brand.name, logoUrl: brand.logoUrl } : null}
    />
  );
}
