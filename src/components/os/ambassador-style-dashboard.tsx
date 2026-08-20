import Link from "next/link";
import Image from "next/image";
import {
  Activity,
  Bell,
  Boxes,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  LayoutDashboard,
  Megaphone,
  PackageCheck,
  Search,
  Settings,
  ShoppingCart,
  Star,
  Users,
  UserRound,
  BarChart3,
} from "lucide-react";
import styles from "./ambassador-style-dashboard.module.css";

const departments = [
  {
    name: "CRM",
    slug: "crm",
    description: "Customers, leads, opportunities, follow-ups and pipeline movement.",
    icon: Users,
    color: "blue",
  },
  {
    name: "Marketing",
    slug: "marketing",
    description: "Campaigns, ambassadors, referrals, Spin Wheel, SMS and WhatsApp.",
    icon: Megaphone,
    color: "purple",
  },
  {
    name: "Sales",
    slug: "sales",
    description: "Quotations, orders, payments, discounts and sales performance.",
    icon: ShoppingCart,
    color: "orange",
  },
  {
    name: "Operations",
    slug: "operations",
    description: "Inventory, fulfilment, delivery, repairs, procurement and service flow.",
    icon: PackageCheck,
    color: "green",
  },
  {
    name: "Finance",
    slug: "finance",
    description: "Income, expenses, receivables, payables, payroll and budgets.",
    icon: CircleDollarSign,
    color: "blue",
  },
  {
    name: "Reports",
    slug: "reports",
    description: "Company-wide performance, trends, management reports and insights.",
    icon: BarChart3,
    color: "orange",
  },
  {
    name: "Administration",
    slug: "administration",
    description: "Staff, departments, permissions, approvals and company controls.",
    icon: Settings,
    color: "green",
  },
];

export default function AmbassadorStyleDashboard({
  administratorName,
}: {
  administratorName: string;
}) {
  const initials = administratorName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'AD';

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.logoArea}>
          <div className={styles.logoCard}>
            <Image
              src="/branding/emmytech-logo.png"
              alt="Emmy Technology"
              width={170}
              height={64}
              className={styles.logoImage}
              priority
            />
          </div>
        </div>

        <div className={styles.workspaceBadge}>
          <Boxes size={15} />
          <span>Company Workspace</span>
        </div>

        <nav className={styles.nav}>
          <Link href="/" className={`${styles.navLink} ${styles.active}`}>
            <LayoutDashboard size={19} />
            <span>Overview</span>
          </Link>
          <Link href="/modules/activities" className={styles.navLink}>
            <Activity size={19} />
            <span>My Tasks</span>
          </Link>
          <button className={styles.navLink}>
            <Bell size={19} />
            <span>Alerts</span>
          </button>
          <button className={styles.navLink}>
            <Star size={19} />
            <span>Favorites</span>
          </button>

          <div className={styles.divider} />

          <Link href="/modules/administration" className={styles.navLink}>
            <Settings size={19} />
            <span>Settings</span>
          </Link>
        </nav>

        <div className={styles.sidebarUser}>
          <div className={styles.sidebarAvatar}>{initials}</div>
          <div className={styles.sidebarUserText}>
            <strong>{administratorName}</strong>
            <span>EmmyTech OS</span>
          </div>
          <ChevronRight size={17} />
        </div>
      </aside>

      <div className={styles.workspace}>
        <header className={styles.topbar}>
          <div>
            <div className={styles.topEyebrow}>COMPANY WORKSPACE</div>
            <div className={styles.topTitle}>Command Centre</div>
          </div>

          <div className={styles.topActions}>
            <button className={styles.bellButton} aria-label="Notifications">
              <Bell size={20} />
            </button>
            <div className={styles.profileCard}>
              <div className={styles.profileAvatar}>
                <UserRound size={18} />
              </div>
              <div>
                <strong>{administratorName}</strong>
                <span>Admin</span>
              </div>
            </div>
          </div>
        </header>

        <main className={styles.content}>
          <div className={styles.breadcrumb}>
            <span>Dashboard</span>
            <ChevronRight size={15} />
            <strong>Overview</strong>
          </div>

          <section className={styles.pageHeading}>
            <div>
              <h1>Company Departments</h1>
              <p>Select a workspace to manage that part of Emmy Technology.</p>
            </div>
            <div className={styles.roleBadge}>
              <Activity size={15} />
              Administrator
            </div>
          </section>

          <section className={styles.controlBar}>
            <div className={styles.controlIcon}>
              <ClipboardCheck size={20} />
            </div>
            <div className={styles.controlText}>
              <strong>EmmyTech OS workspace</strong>
              <span>One operating system. Seven core departments.</span>
            </div>
            <div className={styles.searchBox}>
              <Search size={17} />
              <input placeholder="Search departments..." aria-label="Search departments" />
            </div>
          </section>

          <section className={styles.departmentGrid}>
            {departments.map((department) => {
              const Icon = department.icon;
              return (
                <Link
                  key={department.slug}
                  href={`/modules/${department.slug}`}
                  className={styles.departmentCard}
                >
                  <div className={styles.cardTop}>
                    <div className={`${styles.iconBox} ${styles[department.color]}`}>
                      <Icon size={23} />
                    </div>
                    <ChevronRight className={styles.cardArrow} size={19} />
                  </div>
                  <div className={styles.cardCopy}>
                    <h2>{department.name}</h2>
                    <p>{department.description}</p>
                  </div>
                  <div className={styles.cardAction}>Open workspace</div>
                </Link>
              );
            })}
          </section>
        </main>
      </div>
    </div>
  );
}
