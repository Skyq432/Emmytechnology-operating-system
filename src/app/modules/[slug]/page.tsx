import Link from "next/link";
import { ArrowLeft, MessageCircle } from "lucide-react";
import CrmWorkspace from "@/components/crm/crm-workspace";

const names: Record<string, string> = {
  crm: "CRM",
  sales: "Sales",
  operations: "Operations",
  marketing: "Marketing",
  finance: "Finance",
  reports: "Reports",
  administration: "Administration",
  activities: "Activities",
};

export default async function ModulePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  if (slug === "crm") {
    return <CrmWorkspace />;
  }

  const name = names[slug] ?? slug.replaceAll("-", " ");

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f7f9fc",
        padding: "48px",
        fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <Link
        href="/"
        style={{
          color: "#073995",
          textDecoration: "none",
          display: "inline-flex",
          gap: 8,
          alignItems: "center",
          fontWeight: 700,
        }}
      >
        <ArrowLeft size={18} />
        Back to EmmyTech OS
      </Link>

      <section
        style={{
          maxWidth: 920,
          marginTop: 32,
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: 22,
          padding: 40,
          boxShadow: "0 8px 24px rgba(15,23,42,0.05)",
        }}
      >
        <div style={{ color: "#073995", fontWeight: 850, fontSize: 11, letterSpacing: 1.7, textTransform: "uppercase" }}>
          EmmyTech OS
        </div>
        <h1 style={{ margin: "12px 0 8px", fontSize: 38, color: "#0f172a", letterSpacing: "-0.04em" }}>{name}</h1>
        <p style={{ margin: 0, color: "#64748b", fontSize: 16, lineHeight: 1.8 }}>
          We are currently working on this department workspace. If this is crucial to your department and you want it delivered faster, message us on 07026710999.
        </p>
        <a
          href="https://wa.me/2347026710999"
          style={{
            marginTop: 24,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            borderRadius: 12,
            background: "#073995",
            color: "#fff",
            padding: "12px 18px",
            fontWeight: 800,
            textDecoration: "none",
          }}
        >
          <MessageCircle size={18} />
          Message 07026710999
        </a>
      </section>
    </main>
  );
}
