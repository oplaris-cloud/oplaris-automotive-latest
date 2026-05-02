"use client";

import * as React from "react";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { SPOTLIGHT_OPEN_EVENT } from "./spotlight-events";

/**
 * Bug-6 — Top-bar "Global Search" button.
 *
 * Manager-only entry point that opens the same Spotlight modal Cmd+K
 * triggers. The hotkey badge inside the button auto-detects the
 * platform: macOS shows ⌘K, every other UA shows Ctrl K. Click +
 * keyboard reach the same modal — the button is the discovery aid
 * for staff who don't yet know the hotkey.
 *
 * Implementation: dispatches a `window` event the SpotlightModal
 * listens for, so the button doesn't need to know about the modal's
 * internal state.
 */
export function GlobalSearchButton({
  className,
}: {
  className?: string;
}) {
  const [hotkey, setHotkey] = React.useState<string | null>(null);

  // navigator is only available client-side; render the kbd badge
  // after mount so server-rendered HTML doesn't show a default that
  // mismatches the hydrated client.
  React.useEffect(() => {
    const isMac =
      typeof navigator !== "undefined" &&
      /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
    setHotkey(isMac ? "⌘K" : "Ctrl K");
  }, []);

  function open() {
    window.dispatchEvent(new CustomEvent(SPOTLIGHT_OPEN_EVENT));
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={open}
      className={cn("gap-2", className)}
      aria-label="Global Search"
    >
      <Search className="h-4 w-4" />
      <span className="hidden sm:inline">Global Search</span>
      {hotkey ? (
        <kbd className="ml-1 hidden rounded border bg-muted px-1 py-1 font-mono text-xs leading-none text-muted-foreground sm:inline">
          {hotkey}
        </kbd>
      ) : null}
    </Button>
  );
}
