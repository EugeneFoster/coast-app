export default async function EmployeesPage() {
  return (
    <div className="p-8">
      <h1 className="font-display text-3xl font-medium text-ink">Employees</h1>
      <p className="mt-2 text-sm text-graph">
        This section is disabled in the free deployment profile to keep the
        Worker within Cloudflare free-tier size limits.
      </p>
    </div>
  );
}
