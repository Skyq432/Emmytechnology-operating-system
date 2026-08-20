import Image from "next/image";
import Link from "next/link";
import {
  Bell,
  Building2,
  ChartNoAxesCombined,
  ChevronRight,
  ClipboardCheck,
  DollarSign,
  Home,
  LayoutGrid,
  Megaphone,
  Search,
  Settings2,
  ShoppingCart,
  Star,
  UsersRound,
} from "lucide-react";

import styles from "./department-dashboard.module.css";

const departments = [
  {
    name: "CRM",
    slug: "crm",
    description: "Customers, leads, opportunities, funnel progress and follow-ups.",
    icon: UsersRound,
    tone: "blue",
  },
  {
    name: "Sales",
    slug: "sales",
    description: "Quotations, orders, payments, discounts and sales performance.",
    icon: ShoppingCart,
    tone: "yellow",
  },
  {
    name: "Operations",
    slug: "operations",
    description: "Inventory, fulfilment, delivery, repairs and procurement.",
    icon: Building2,
    tone: "blue",
  },
  {
    name: "Marketing",
    slug: "marketing",
    description: "Campaigns, ambassadors, referrals, SMS and WhatsApp activity.",
    icon: Megaphone,
    tone: "yellow",
  },
  {
    name: "Finance",
    slug: "finance",
    description: "Income, expenses, receivables, payables, payroll and budgets.",
    icon: DollarSign,
    tone: "blue",
  },
  {
    name: "Reports",
    slug: "reports",
    description: "Company performance, trends, insights and management reports.",
    icon: ChartNoAxesCombined,
    tone: "yellow",
  },
  {
    name: "Administration",
    slug: "administration",
    description: "Staff, roles, permissions, approvals and company controls.",
    icon: Settings2,
    tone: "blue",
  },
];

export default function DepartmentDashboard() {
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.logoPanel}>
          <Image
            src="/branding/emmytechnology-logo.png"
            alt="Emmy Technology"
            width={250}
            height={72}
            priority
            className={styles.logo}
          />
          <div className={styles.osLabel}>Company Operating System</div>
        </div>

        <nav className={styles.navigation}>
          <Link href="/" className={`${styles.navItem} ${styles.navActive}`}>
            <Home size={18} strokeWidth={2} />
            <span>Home</span>
          </Link>

          <Link href="/modules/activities" className={styles.navItem}>
            <ClipboardCheck size={18} strokeWidth={2} />
            <span>My Tasks</span>
            <span className={styles.navBadge}>8</span>
          </Link>

          <button className={styles.navItem} type="button">
            <Bell size={18} strokeWidth={2} />
            <span>Alerts</span>
            <span className={styles.navBadge}>3</span>
          </button>

          <button className={styles.navItem} type="button">
            <Star size={18} strokeWidth={2} />
            <span>Favorites</span>
          </button>
        </nav>

        <div className={styles.sidebarBottom}>
          <div className={styles.sidebarBottomLabel}>Workspace</div>
          <strong>EmmyTech OS</strong>
          <span>Core company modules</span>
        </div>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div className={styles.searchBox}>
            <Search size={18} strokeWidth={2} />
            <input aria-label="Search EmmyTech OS" placeholder="Search modules, records, reports..." />
          </div>

          <div className={styles.topbarActions}>
            <button className={styles.iconButton} type="button" aria-label="Notifications">
              <Bell size={18} />
            </button>
            <button className={styles.iconButton} type="button" aria-label="All modules">
              <LayoutGrid size={18} />
            </button>
            <div className={styles.userRole}>Administrator</div>
          </div>
        </header>

        <main className={styles.main}>
          <div className={styles.pageHeader}>
            <div>
              <div className={styles.kicker}>COMPANY WORKSPACE</div>
              <h1>Departments</h1>
              <p>Select a department to enter its workspace and tools.</p>
            </div>

            <div className={styles.departmentCount}>
              <span className={styles.countNumber}>7</span>
              <span className={styles.countText}>Core departments</span>
            </div>
          </div>

          <div className={styles.sectionHeader}>
            <h2>Company modules</h2>
            <span>Everything starts here</span>
          </div>

          <section className={styles.grid} aria-label="EmmyTech departments">
            {departments.map((department) => {
              const Icon = department.icon;
              const isYellow = department.tone === "yellow";

              return (
                <Link
                  href={`/modules/${department.slug}`}
                  key={department.slug}
                  className={`${styles.card} ${isYellow ? styles.cardYellow : styles.cardBlue}`}
                >
                  <div className={styles.cardTop}>
                    <div className={`${styles.iconWrap} ${isYellow ? styles.iconYellow : styles.iconBlue}`}>
                      <Icon size={21} strokeWidth={2} />
                    </div>
                    <div className={styles.arrowButton}>
                      <ChevronRight size={18} strokeWidth={2.2} />
                    </div>
                  </div>

                  <div className={styles.cardContent}>
                    <h3>{department.name}</h3>
                    <p>{department.description}</p>
                  </div>

                  <div className={styles.cardMeta}>Open workspace</div>
                </Link>
              );
            })}
          </section>
        </main>
      </section>
    </div>
  );
}
