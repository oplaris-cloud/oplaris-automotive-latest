import { brandStyleBlock, getPublicGarageBrand } from "@/lib/brand/garage-brand";

/** V5.7 — Auth surfaces (login, logout) are pre-session — they need
 *  the same brand-token injection as the kiosk/status pages so the
 *  Sign-in button matches the rest of the customer's experience.
 *  Mirrors `(public)/layout.tsx`; both go through the service-role
 *  brand helper because no JWT is present yet. */
export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const brand = await getPublicGarageBrand();
  return (
    <>
      {brand ? (
        <style
          id="garage-brand-tokens"
          dangerouslySetInnerHTML={{ __html: brandStyleBlock(brand) }}
        />
      ) : null}
      {children}
    </>
  );
}
