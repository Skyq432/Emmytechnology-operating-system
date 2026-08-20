import AmbassadorStyleDashboard from "@/components/os/ambassador-style-dashboard";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("users")
    .select("name, role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") redirect("/auth/login");

  return (
    <AmbassadorStyleDashboard
      administratorName={profile.name || user.email || "Administrator"}
    />
  );
}
