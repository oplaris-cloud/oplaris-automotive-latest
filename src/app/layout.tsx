import type { Metadata } from "next";
import { JetBrains_Mono, Geist } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/app/theme-provider";
import { Toaster } from "@/components/ui/sonner";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Oplaris Automotive",
    template: "%s · Oplaris Automotive",
  },
  description: "Workshop management for independent UK garages.",
  // Block search indexing of internal app surfaces — final flags applied
  // per-route in later phases.
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en-GB"
      className={cn("h-full", "antialiased", jetbrainsMono.variable, "font-sans", geist.variable)}
      suppressHydrationWarning
    >
      <body className="min-h-full font-sans">
        {/* Skip-to-content for keyboard navigation (WCAG 2.4.1) */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        >
          Skip to main content
        </a>
        {/* P56.1.d — next-themes provider. `suppressHydrationWarning`
            on <html> is required because the provider writes the
            persisted theme class onto <html> in a pre-hydration
            blocking script, which would otherwise trip React's
            mismatch guard. */}
        <ThemeProvider>
          {children}
          <Toaster position="top-right" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
