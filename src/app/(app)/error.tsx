"use client";

// The in-app error boundary: a refused action (frozen week, recipe in use)
// or an unexpected failure lands here instead of the framework error page.
// Guard messages are written as plain sentences, so show them verbatim;
// anything unrecognizable gets generic copy rather than a stack trace.

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Our own guards throw short human sentences. Framework/DB internals don't.
  const friendly =
    error.message && error.message.length < 200 && !/[{}<>]/.test(error.message)
      ? error.message
      : "Something went wrong saving that. Nothing was changed.";

  return (
    <div className="mx-auto max-w-lg py-10">
      <Card>
        <CardHeader>
          <CardTitle>That didn&apos;t go through</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p>{friendly}</p>
          <div className="flex gap-2">
            <Button onClick={reset} variant="outline">Try again</Button>
            <Button asChild>
              <Link href="/week">Back to the week</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
