import { brandStyleBlock, getPublicGarageBrand } from "@/lib/brand/garage-brand";

/** V5.7 — Public layout injects the garage brand tokens into a scoped
 *  `<style>` block so every primitive on the kiosk + status pages
 *  (buttons, focus rings, badges, accent fills) re-themes per garage
 *  with no per-component wiring.
 *
 *  Why this exists: the `(app)` layout does the same thing for staff
 *  surfaces, but it's auth-gated. Public pages have no JWT, so they
 *  resolve the brand via the service-role helper instead. The block
 *  is purely additive — `globals.css` ships sensible Oplaris defaults
 *  that take over if the helper returns null. */
export default async function PublicLayout({
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
