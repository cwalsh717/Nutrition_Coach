import { redirect } from "next/navigation";

// The list lives on the Plan page now — one surface, no ceremony. Old links
// (bookmarks, the coach's history) land on the same week they meant.
export default async function ListRedirect({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  const { w } = await searchParams;
  redirect(w ? `/week?w=${w}` : "/week");
}
