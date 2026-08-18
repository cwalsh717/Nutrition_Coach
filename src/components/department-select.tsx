"use client";

// The per-line department correction: a quiet select that moves the line and,
// through setItemDepartment, heals any same-named food or recipe ingredient so
// the fix sticks for future weeks. Reconciliation never writes departments, so
// a correction can never be reconciled away.

import { useTransition } from "react";
import { setItemDepartment } from "@/actions/shopping";
import { DEPARTMENTS } from "@/lib/constants";

export function DepartmentSelect({ itemId, department }: { itemId: string; department: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <select
      value={department}
      disabled={pending}
      aria-label="Move to another department"
      onChange={(e) => {
        const next = e.target.value;
        startTransition(async () => {
          await setItemDepartment(itemId, next);
        });
      }}
      className="h-7 max-w-28 truncate rounded-md border bg-transparent px-1 text-xs text-muted-foreground"
    >
      {DEPARTMENTS.map((d) => (
        <option key={d} value={d}>{d}</option>
      ))}
    </select>
  );
}
