"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }
  return (
    <Button variant="outline" onClick={logout}>
      Log out
    </Button>
  );
}
