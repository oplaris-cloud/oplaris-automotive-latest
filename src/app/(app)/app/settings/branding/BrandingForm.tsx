"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Palette, Image as ImageIcon, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GarageLogo } from "@/components/ui/garage-logo";
import { hexToOklch } from "@/lib/brand/oklch";
import { cn } from "@/lib/utils";

import {
  removeGarageLogo,
  updateGarageBrand,
  uploadGarageLogo,
} from "./actions";

interface Initial {
  brandName: string;
  primaryHex: string;
  accentHex: string;
  /** Manager override for button text colour. Empty string = auto. */
  primaryForegroundHex: string;
  showName: boolean;
  font: string;
  logoUrl: string | null;
}

const HEX_RE = /^#[0-9a-fA-F]{3,8}$/;

/** Mirror of the server-side auto-pick for the live preview. Keeps
 *  the preview honest about what the saved page will render. */
function effectiveForegroundFor(
  primaryHex: string,
  overrideHex: string,
): string {
  if (overrideHex && HEX_RE.test(overrideHex)) return overrideHex;
  if (!HEX_RE.test(primaryHex)) return "#000000";
  const oklch = hexToOklch(primaryHex);
  if (!oklch) return "#000000";
  return oklch.l >= 0.65 ? "#111111" : "#FFFFFF";
}

export function BrandingForm({ initial }: { initial: Initial }): React.JSX.Element {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [okMessage, setOkMessage] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>(
    {},
  );

  const [brandName, setBrandName] = React.useState(initial.brandName);
  const [primaryHex, setPrimaryHex] = React.useState(initial.primaryHex);
  const [accentHex, setAccentHex] = React.useState(initial.accentHex);
  const [primaryForegroundHex, setPrimaryForegroundHex] = React.useState(
    initial.primaryForegroundHex,
  );
  const [showName, setShowName] = React.useState(initial.showName);
  const [font, setFont] = React.useState(initial.font);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setOkMessage(null);
    setFieldErrors({});

    if (!HEX_RE.test(primaryHex)) {
      setFieldErrors({ primaryHex: "Must be a valid hex like #D4232A" });
      return;
    }
    if (accentHex && !HEX_RE.test(accentHex)) {
      setFieldErrors({ accentHex: "Must be a valid hex like #F5A623" });
      return;
    }
    if (primaryForegroundHex && !HEX_RE.test(primaryForegroundHex)) {
      setFieldErrors({
        primaryForegroundHex: "Must be a valid hex like #FFFFFF (or clear to auto-pick)",
      });
      return;
    }

    startTransition(async () => {
      const result = await updateGarageBrand({
        brandName: brandName.trim(),
        primaryHex,
        accentHex: accentHex || undefined,
        primaryForegroundHex: primaryForegroundHex || undefined,
        showName,
        font: font.trim() || undefined,
      });
      if (!result.ok) {
        setError(result.error ?? "Failed to save");
        if (result.fieldErrors) setFieldErrors(result.fieldErrors);
        return;
      }
      setOkMessage("Brand updated. Refreshing…");
      router.refresh();
    });
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setOkMessage(null);

    const formData = new FormData();
    formData.append("logo", file);

    startTransition(async () => {
      const result = await uploadGarageLogo(formData);
      if (!result.ok) {
        setError(result.error ?? "Upload failed");
        return;
      }
      setOkMessage("Logo updated. Refreshing…");
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
    });
  };

  const handleLogoRemove = () => {
    if (!confirm("Remove the current logo?")) return;
    setError(null);
    setOkMessage(null);
    startTransition(async () => {
      const result = await removeGarageLogo();
      if (!result.ok) {
        setError(result.error ?? "Remove failed");
        return;
      }
      setOkMessage("Logo removed. Refreshing…");
      router.refresh();
    });
  };

  return (
    <div className="space-y-8">
      {/* Preview card — updates live as the hex inputs change, without
          a round-trip. The real style injection happens on page refresh
          after save. */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4 rounded-lg border bg-card p-4">
            <GarageLogo
              name={brandName || "Your Garage"}
              logoUrl={initial.logoUrl}
              size="lg"
              hideName={!showName}
            />
            <button
              type="button"
              className="shrink-0 rounded-lg px-4 py-2 text-sm font-semibold"
              style={{
                background: HEX_RE.test(primaryHex) ? primaryHex : "#ccc",
                color: effectiveForegroundFor(primaryHex, primaryForegroundHex),
              }}
            >
              Sample button
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Logo upload */}
      <section>
        <h2 className="text-base font-semibold">Logo</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          SVG recommended — renders crisp on kiosks, status page, and
          PDF job sheets. PNG / JPEG / WebP also accepted, up to 2 MB.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-4 py-2 text-sm hover:bg-muted/30">
            <ImageIcon className="h-4 w-4" />
            <span>{initial.logoUrl ? "Replace logo" : "Upload logo"}</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".svg,.png,.jpg,.jpeg,.webp,image/svg+xml,image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleLogoUpload}
              disabled={isPending}
            />
          </label>
          {initial.logoUrl ? (
            <Button
              type="button"
              variant="ghost"
              onClick={handleLogoRemove}
              disabled={isPending}
              className="gap-2 text-destructive"
            >
              <Trash2 className="h-4 w-4" /> Remove
            </Button>
          ) : null}
        </div>

        {/* Show-name toggle — when the logo is a wordmark already, the
            business name next to it is redundant. Off = logo expands to
            fill the sidebar/header slot. Saved only after Save brand. */}
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border bg-card p-3 text-sm">
          <button
            type="button"
            role="switch"
            aria-checked={showName}
            aria-label="Show business name next to logo"
            onClick={() => setShowName((v) => !v)}
            disabled={isPending}
            className={cn(
              "relative mt-1 inline-flex h-5 w-9 shrink-0 rounded-full transition-colors",
              showName ? "bg-primary" : "bg-muted-foreground/40",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
                showName ? "translate-x-[18px]" : "translate-x-0.5",
              )}
            />
          </button>
          <div className="flex-1">
            <div className="font-medium">Show business name next to logo</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Turn off when the logo is already a wordmark — it&rsquo;ll
              expand to fill the header space.
            </div>
          </div>
        </label>
      </section>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Identity</h2>

          <div>
            <Label htmlFor="brandName">Business name</Label>
            <Input
              id="brandName"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder="Dudley Auto Service"
              maxLength={120}
              required
            />
          </div>

          <div>
            <Label htmlFor="font">Font (optional)</Label>
            <Input
              id="font"
              value={font}
              onChange={(e) => setFont(e.target.value)}
              placeholder="Inter"
              maxLength={60}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Leave blank to use the default (Inter). Custom fonts are
              loaded as a Phase 3 follow-up.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Palette className="h-4 w-4" /> Colour
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="primaryHex">Primary colour</Label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Pick primary colour"
                  value={HEX_RE.test(primaryHex) ? primaryHex : "#3b82f6"}
                  onChange={(e) => setPrimaryHex(e.target.value)}
                  disabled={isPending}
                  className="h-10 w-14 cursor-pointer rounded-md border"
                />
                <Input
                  id="primaryHex"
                  value={primaryHex}
                  onChange={(e) => setPrimaryHex(e.target.value)}
                  placeholder="#D4232A"
                  className="font-mono"
                  aria-invalid={!!fieldErrors.primaryHex}
                />
              </div>
              {fieldErrors.primaryHex ? (
                <p className="mt-1 text-xs text-destructive">
                  {fieldErrors.primaryHex}
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  Used on primary buttons, links, and the focus ring.
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="accentHex">Accent colour (optional)</Label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Pick accent colour"
                  value={HEX_RE.test(accentHex) ? accentHex : "#f5a623"}
                  onChange={(e) => setAccentHex(e.target.value)}
                  disabled={isPending}
                  className="h-10 w-14 cursor-pointer rounded-md border"
                />
                <Input
                  id="accentHex"
                  value={accentHex}
                  onChange={(e) => setAccentHex(e.target.value)}
                  placeholder="(leave blank)"
                  className="font-mono"
                  aria-invalid={!!fieldErrors.accentHex}
                />
              </div>
              {fieldErrors.accentHex ? (
                <p className="mt-1 text-xs text-destructive">
                  {fieldErrors.accentHex}
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  Optional — used for secondary highlights.
                </p>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="primaryForegroundHex">
              Button text colour (optional override)
            </Label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="color"
                aria-label="Pick button text colour"
                value={
                  HEX_RE.test(primaryForegroundHex)
                    ? primaryForegroundHex
                    : "#ffffff"
                }
                onChange={(e) => setPrimaryForegroundHex(e.target.value)}
                disabled={isPending}
                className="h-10 w-14 cursor-pointer rounded-md border"
              />
              <Input
                id="primaryForegroundHex"
                value={primaryForegroundHex}
                onChange={(e) => setPrimaryForegroundHex(e.target.value)}
                placeholder="(auto)"
                className="font-mono"
                aria-invalid={!!fieldErrors.primaryForegroundHex}
              />
              {primaryForegroundHex ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPrimaryForegroundHex("")}
                  disabled={isPending}
                >
                  Auto
                </Button>
              ) : null}
            </div>
            {fieldErrors.primaryForegroundHex ? (
              <p className="mt-1 text-xs text-destructive">
                {fieldErrors.primaryForegroundHex}
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                Leave blank to let the app pick black or white automatically
                based on the primary colour&rsquo;s lightness.
              </p>
            )}
          </div>
        </section>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {okMessage ? (
          <p role="status" className="text-sm text-emerald-700">
            {okMessage}
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving…" : "Save brand"}
          </Button>
        </div>
      </form>
    </div>
  );
}
