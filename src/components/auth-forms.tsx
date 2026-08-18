"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SignupForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const { error } = await authClient.signUp.email({
      name: String(form.get("name")),
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    if (error) {
      setError(error.message ?? "Signup failed.");
      setBusy(false);
    } else {
      router.push("/onboarding");
      router.refresh();
    }
  }

  return (
    <AuthShell title="Create your account">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name" name="name" type="text" autoComplete="name" />
        <Field label="Email" name="email" type="email" autoComplete="email" />
        <Field label="Password" name="password" type="password" autoComplete="new-password" minLength={8} />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Creating…" : "Sign up"}
        </Button>
        <p className="text-sm text-muted-foreground text-center">
          Already have an account? <Link className="underline" href="/login">Log in</Link>
        </p>
      </form>
    </AuthShell>
  );
}

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const { error } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    if (error) {
      setError("Wrong email or password.");
      setBusy(false);
    } else {
      router.push("/week");
      router.refresh();
    }
  }

  return (
    <AuthShell title="Log in">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email" name="email" type="email" autoComplete="email" />
        <Field label="Password" name="password" type="password" autoComplete="current-password" />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Logging in…" : "Log in"}
        </Button>
        <p className="text-sm text-muted-foreground text-center">
          New here? <Link className="underline" href="/signup">Create an account</Link>
        </p>
        <p className="text-xs text-muted-foreground text-center">
          <Link className="underline" href="/about">See how Prep Coach works</Link>
        </p>
      </form>
    </AuthShell>
  );
}

function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <p className="font-display text-base italic text-primary">Prep Coach</p>
          <CardTitle className="text-2xl">{title}</CardTitle>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </main>
  );
}

function Field(props: {
  label: string;
  name: string;
  type: string;
  autoComplete?: string;
  minLength?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={props.name}>{props.label}</Label>
      <Input
        id={props.name}
        name={props.name}
        type={props.type}
        autoComplete={props.autoComplete}
        minLength={props.minLength}
        required
      />
    </div>
  );
}
