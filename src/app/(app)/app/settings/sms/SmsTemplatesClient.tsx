"use client";

import { useMemo, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Stack } from "@/components/ui/stack";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import {
  SAMPLE_VARS,
  TEMPLATE_KEYS,
  TEMPLATE_LABEL,
  TEMPLATE_VARS,
  TEMPLATE_VAR_HINTS,
  previewSegments,
  type TemplateKey,
} from "@/lib/sms/template-schema";

import { updateSmsTemplate } from "./actions";

interface Props {
  templatesByKey: Record<
    TemplateKey,
    { body: string; updatedAt: string | null }
  >;
}

// P2.3 — three-card vertical stack. We deliberately don't tab between
// templates: cognitive-load-and-information.md says ≤5 ungrouped
// choices is fine without grouping, and a manager editing one will
// frequently want to compare wording across templates without losing
// context. Same-page presentation also makes the live preview comparable
// across templates at a glance.

export function SmsTemplatesClient({ templatesByKey }: Props) {
  return (
    <Stack gap="lg" className="mt-2">
      {TEMPLATE_KEYS.map((key) => (
        <TemplateEditor
          key={key}
          templateKey={key}
          initialBody={templatesByKey[key]?.body ?? ""}
          initialUpdatedAt={templatesByKey[key]?.updatedAt ?? null}
        />
      ))}
    </Stack>
  );
}

interface TemplateEditorProps {
  templateKey: TemplateKey;
  initialBody: string;
  initialUpdatedAt: string | null;
}

// One card = one template. The editor preserves the user's typed body
// across save attempts (forms-and-data-entry.md: "Don't clear the field
// on error") so a failing save doesn't punish the manager.
function TemplateEditor({
  templateKey,
  initialBody,
  initialUpdatedAt,
}: TemplateEditorProps) {
  const [body, setBody] = useState(initialBody);
  const [savedBody, setSavedBody] = useState(initialBody);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const meta = TEMPLATE_LABEL[templateKey];
  const allowedVars = TEMPLATE_VARS[templateKey];
  const sampleVars = SAMPLE_VARS[templateKey];

  // Memoise so the preview doesn't re-segment on every keystroke when
  // body is unchanged (it will still re-render in practice — this is
  // pure-CPU savings on long bodies).
  const segments = useMemo(
    () => previewSegments(body, sampleVars),
    [body, sampleVars],
  );

  const charCount = body.length;
  // GSM-7 limits: 160 chars for a single segment, 153/segment when
  // concatenated. Unicode (emoji, smart quotes) drops to 70/67 — we
  // approximate with the 160 boundary which is "single SMS or not".
  const isOverSegment = charCount > 160;
  const dirty = body !== savedBody;

  function insertVar(varName: string) {
    const ta = textareaRef.current;
    const placeholder = `{{${varName}}}`;
    if (!ta) {
      setBody((b) => b + placeholder);
      return;
    }
    const start = ta.selectionStart ?? body.length;
    const end = ta.selectionEnd ?? body.length;
    const next = body.slice(0, start) + placeholder + body.slice(end);
    setBody(next);
    // Restore the cursor after React paints. Without this the cursor
    // jumps to the end of the textarea — annoying mid-sentence.
    requestAnimationFrame(() => {
      ta.focus();
      const cursor = start + placeholder.length;
      ta.setSelectionRange(cursor, cursor);
    });
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateSmsTemplate({ key: templateKey, body });
      if (!result.ok) {
        // Inline error per forms-and-data-entry.md: state what went
        // wrong, keep the typed body intact, don't toast-only.
        setError(
          result.error ??
            result.fieldErrors?.body ??
            "Couldn't save template. Try again.",
        );
        return;
      }
      setSavedBody(body);
      setUpdatedAt(new Date().toISOString());
      toast.success("Template saved");
    });
  }

  function handleRevert() {
    setBody(savedBody);
    setError(null);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base">{meta.name}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {meta.firesWhen}
            </p>
          </div>
          {updatedAt ? (
            <span className="text-xs text-muted-foreground">
              Last edited{" "}
              {new Date(updatedAt).toLocaleString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 md:grid-cols-2">
          {/* ── Editor ──────────────────────────────────────────── */}
          <div>
            <Label htmlFor={`tpl-${templateKey}`} required>
              Message body
            </Label>
            <Textarea
              ref={textareaRef}
              id={`tpl-${templateKey}`}
              name={`tpl-${templateKey}`}
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="mt-1 font-mono text-sm"
              aria-describedby={`tpl-${templateKey}-charcount`}
            />
            <div
              id={`tpl-${templateKey}-charcount`}
              className="mt-1 flex items-center justify-between text-xs"
            >
              <span
                className={cn(
                  "text-muted-foreground",
                  isOverSegment && "text-warning",
                )}
              >
                {charCount} / 160 chars
                {isOverSegment ? " — splits into 2+ SMS segments" : ""}
              </span>
              {dirty ? (
                <span className="text-muted-foreground">Unsaved changes</span>
              ) : null}
            </div>

            {/* Available variables — click to insert at cursor. */}
            <div className="mt-4">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Available variables
              </Label>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {allowedVars.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => insertVar(v)}
                    className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-1 text-xs font-mono hover:bg-accent hover:text-accent-foreground"
                    title={TEMPLATE_VAR_HINTS[v] ?? "Insert variable"}
                  >
                    {`{{${v}}}`}
                  </button>
                ))}
              </div>
            </div>

            {error ? (
              <p
                role="alert"
                className="mt-3 text-sm text-destructive"
                aria-live="assertive"
              >
                {error}
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                onClick={handleSave}
                disabled={isPending || !dirty || body.trim().length === 0}
              >
                {isPending ? "Saving…" : "Save changes"}
              </Button>
              {dirty ? (
                <Button
                  variant="ghost"
                  onClick={handleRevert}
                  disabled={isPending}
                >
                  Revert
                </Button>
              ) : null}
            </div>
          </div>

          {/* ── Live preview ────────────────────────────────────── */}
          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Preview (with sample data)
            </Label>
            <div
              className="mt-1 rounded-lg border bg-muted/30 p-4 text-sm whitespace-pre-wrap break-words"
              aria-live="polite"
            >
              {body.trim().length === 0 ? (
                <span className="text-muted-foreground italic">
                  Empty message
                </span>
              ) : (
                segments.map((seg, i) =>
                  seg.type === "filled" ? (
                    <span
                      key={i}
                      className="rounded bg-primary/10 px-1 text-primary"
                      title={`{{${seg.varName}}} → ${seg.value}`}
                    >
                      {seg.value}
                    </span>
                  ) : seg.type === "unfilled" ? (
                    <span
                      key={i}
                      className="rounded bg-warning/15 px-1 text-warning-foreground italic"
                      title="No sample value for this variable"
                    >
                      {seg.value}
                    </span>
                  ) : (
                    <span key={i}>{seg.value}</span>
                  ),
                )
              )}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Highlighted values are filled in from sample data. Yellow
              placeholders mean a variable will be filled in for real, but
              isn&apos;t in the preview&apos;s sample.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
