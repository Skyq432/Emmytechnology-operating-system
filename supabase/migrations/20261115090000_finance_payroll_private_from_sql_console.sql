-- EmmyTech OS · Finance · keep individual pay out of the Sales Analyst SQL Console
--
-- The SQL Console (20261016180849) runs queries as sales_analytics_readonly, a role
-- with BYPASSRLS and default SELECT on every table in public. That would let the
-- Admin and Sales Analyst read salaries, salary advances and pay-run lines in the
-- console, although individual pay is for the Supreme Administrator only.
--
-- Take those three tables out of its reach. Run totals, expenses, accounts and
-- the rest of Finance stay readable there, matching view-only Finance access.
-- Payroll is still reached only through finance_payroll(), which returns names
-- and amounts to super_admin only.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'sales_analytics_readonly') then
    revoke all on table public.finance_pay_profiles from sales_analytics_readonly;
    revoke all on table public.finance_pay_run_lines from sales_analytics_readonly;
    revoke all on table public.finance_salary_advances from sales_analytics_readonly;
  end if;
end
$$;
