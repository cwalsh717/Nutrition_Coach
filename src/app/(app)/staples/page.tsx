import { redirect } from "next/navigation";

// Staples & Quick Eats merged into the Library, where they're Groceries and
// Takeout. Kept as a redirect so older links (the week page's "build it") land.
export default function StaplesPage() {
  redirect("/library");
}
