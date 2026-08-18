import { redirect } from "next/navigation";

// The Cook Book merged into the Library. Recipe editing still lives under
// /cookbook/[id] and /cookbook/new, so only the index moves.
export default function CookbookIndexPage() {
  redirect("/library");
}
