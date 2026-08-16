"use client";

// Root error boundary: catches throws outside the signed-in shell (login,
// signup, onboarding). Sparser than (app)/error.tsx — no nav to lean on.

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const friendly =
    error.message && error.message.length < 200 && !/[{}<>]/.test(error.message)
      ? error.message
      : "Something went wrong. Nothing was changed.";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6 text-center">
      <h1 className="font-display text-2xl">That didn&apos;t go through</h1>
      <p className="text-sm text-muted-foreground">{friendly}</p>
      <div className="flex justify-center gap-3">
        <button onClick={reset} className="rounded-md border px-4 py-2 text-sm hover:bg-accent">
          Try again
        </button>
        <a href="/" className="rounded-md border px-4 py-2 text-sm hover:bg-accent">
          Start over
        </a>
      </div>
    </main>
  );
}
