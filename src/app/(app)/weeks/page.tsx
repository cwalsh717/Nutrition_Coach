import { redirect } from "next/navigation";

// History stopped being a destination: past weeks are a collapsed section at
// the bottom of Plan, and each archive stays readable at /weeks/[id].
export default function WeeksRedirect() {
  redirect("/week");
}
