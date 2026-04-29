"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/lib/toast";
import { checklistItemSchema } from "@/lib/validation/checklist-schemas";

import { setChecklistEnabled, updateChecklistItems } from "./actions";

type Role = "mechanic" | "mot_tester";

interface ChecklistData {
  role: Role;
  items: string[];
  enabled: boolean;
}

interface Props {
  mechanic: ChecklistData;
  motTester: ChecklistData;
}

const ROLE_LABELS: Record<Role, string> = {
  mechanic: "Mechanic",
  mot_tester: "MOT Tester",
};

/** P3.3 — Manager-only configuration UI for the per-role checklist.
 *
 *  Two-tab editor; each tab owns its own optimistic state so toggling a
 *  switch on one role doesn't reset the other's edited (but unsaved)
 *  items list. ux-audit references applied: forms-and-data-entry
 *  (visible labels + inline help), interactive-components (44px touch
 *  targets on every button), accessibility (aria-live on save toasts).
 */
export function ChecklistsClient({ mechanic, motTester }: Props) {
  return (
    <Tabs defaultValue="mechanic" className="mt-6">
      <TabsList>
        <TabsTrigger value="mechanic">{ROLE_LABELS.mechanic}</TabsTrigger>
        <TabsTrigger value="mot_tester">{ROLE_LABELS.mot_tester}</TabsTrigger>
      </TabsList>

      <TabsContent value="mechanic" className="mt-4">
        <ChecklistEditor data={mechanic} />
      </TabsContent>
      <TabsContent value="mot_tester" className="mt-4">
        <ChecklistEditor data={motTester} />
      </TabsContent>
    </Tabs>
  );
}

function ChecklistEditor({ data }: { data: ChecklistData }) {
  const [enabled, setEnabled] = useState(data.enabled);
  const [items, setItems] = useState<string[]>(data.items);
  const [draft, setDraft] = useState("");
  const [savePending, startSave] = useTransition();
  const [togglePending, startToggle] = useTransition();
  const [draftError, setDraftError] = useState<string | null>(null);

  const handleToggle = (next: boolean) => {
    setEnabled(next);
    startToggle(async () => {
      const result = await setChecklistEnabled({
        role: data.role,
        enabled: next,
      });
      if (!result.ok) {
        setEnabled(!next);
        toast.error(result.error ?? "Couldn't update toggle");
        return;
      }
      toast.success(
        next ? "Checklist enabled" : "Checklist disabled — modal won't show",
      );
    });
  };

  const persistItems = (next: string[]) => {
    setItems(next);
    startSave(async () => {
      const result = await updateChecklistItems({
        role: data.role,
        items: next,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Couldn't save items");
      }
    });
  };

  const handleAdd = () => {
    const parsed = checklistItemSchema.safeParse(draft);
    if (!parsed.success) {
      setDraftError(parsed.error.issues[0]?.message ?? "Invalid question");
      return;
    }
    setDraftError(null);
    persistItems([...items, parsed.data]);
    setDraft("");
  };

  const handleDelete = (idx: number) => {
    persistItems(items.filter((_, i) => i !== idx));
  };

  const move = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[idx], next[target]] = [next[target]!, next[idx]!];
    persistItems(next);
  };

  return (
    <Card>
      <CardContent className="space-y-6">
        <div className="flex items-start gap-3">
          <Checkbox
            id={`enabled-${data.role}`}
            checked={enabled}
            onCheckedChange={(next) => handleToggle(next === true)}
            disabled={togglePending}
            className="mt-1"
          />
          <div className="flex-1">
            <Label htmlFor={`enabled-${data.role}`} className="font-medium">
              Show the checklist when {ROLE_LABELS[data.role].toLowerCase()}s
              complete a job
            </Label>
            <p className="mt-1 text-sm text-muted-foreground">
              When on, the modal blocks Complete until every question is
              answered. Off skips the modal entirely.
            </p>
          </div>
        </div>

        <div>
          <Label className="text-sm font-medium">Questions</Label>
          {items.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No questions yet. Add a few below — they show in this order in
              the modal.
            </p>
          ) : (
            <ol className="mt-2 space-y-2">
              {items.map((q, idx) => (
                <li
                  key={`${idx}-${q}`}
                  className="flex items-center gap-2 rounded-lg border p-2"
                >
                  <span className="text-xs font-medium tabular-nums text-muted-foreground">
                    {idx + 1}.
                  </span>
                  <span className="flex-1 text-sm">{q}</span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0 || savePending}
                    aria-label={`Move "${q}" up`}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => move(idx, 1)}
                    disabled={idx === items.length - 1 || savePending}
                    aria-label={`Move "${q}" down`}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => handleDelete(idx)}
                    disabled={savePending}
                    aria-label={`Delete "${q}"`}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <div>
            <Label htmlFor={`draft-${data.role}`}>Add a question</Label>
            <Input
              id={`draft-${data.role}`}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (draftError) setDraftError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAdd();
                }
              }}
              placeholder="e.g. Have you returned the wheel locking nut?"
              maxLength={200}
              aria-invalid={draftError ? true : undefined}
              aria-describedby={draftError ? `draft-err-${data.role}` : undefined}
              className="mt-1"
            />
            {draftError ? (
              <p
                id={`draft-err-${data.role}`}
                role="alert"
                className="mt-1 text-xs text-destructive"
              >
                {draftError}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            onClick={handleAdd}
            disabled={savePending || !draft.trim()}
            className="self-end"
          >
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
