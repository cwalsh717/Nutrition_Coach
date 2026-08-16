import { redirect } from "next/navigation";

// The middleware already bounces logged-out visitors to /login,
// so anyone landing here has a session cookie.
export default function Home() {
  redirect("/week");
}
