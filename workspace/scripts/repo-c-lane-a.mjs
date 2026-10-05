export function buildRepoCLaneAHeaders({ executorSecret, tenantId }) {
  const secret = String(executorSecret || '').trim();
  const tenant = String(tenantId || '').trim();
  if (!secret) throw new Error('Repo C Lane A requires EXECUTOR_SECRET');
  if (!tenant) throw new Error('Repo C Lane A requires X-Tenant-Id');

  return {
    Authorization: `Bearer ${secret}`,
    'X-Tenant-Id': tenant,
    'Content-Type': 'application/json',
  };
}
