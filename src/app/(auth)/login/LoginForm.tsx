"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { FormCard } from "@/components/ui/form-card";
import { FormActions } from "@/components/ui/form-actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState(loginAction, initialState);

  return (
    <FormCard variant="plain" className="mt-8">
    <form action={formAction} noValidate>
      <input type="hidden" name="next" value={next ?? ""} />

      <FormCard.Fields>
      <div>
        <Label htmlFor="email" required>Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          spellCheck={false}
          className="mt-1"
        />
      </div>

      <div>
        <Label htmlFor="password" required>Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1"
        />
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      </FormCard.Fields>

      <FormActions fullWidth>
        <SubmitButton />
      </FormActions>
    </form>
    </FormCard>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? "Signing in…" : "Sign in"}
    </Button>
  );
}
