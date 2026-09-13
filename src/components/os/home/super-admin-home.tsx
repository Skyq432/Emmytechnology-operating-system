// Super Admin's home is identical to Admin's except for the one extra
// "Assign Super Admin" affordance, which AdminHome already gates internally
// via canAssignSuperAdmin(role). Re-exported under its own name so the
// role-to-component dispatch table in page.tsx stays a clean 1:1 mapping.
export { AdminHome as SuperAdminHome } from '@/components/os/home/admin-home';
