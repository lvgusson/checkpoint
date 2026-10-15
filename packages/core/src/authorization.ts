// Declarative role-based access policy. Roles come from the verified JWT `app_metadata.role`;
// the Supabase `authenticated` claim is a database role and is never a product role.
export const roles = ['admin', 'user'] as const;
export type Role = (typeof roles)[number];

export const permissions = [
  'games:read',
  'games:update',
  'catalog:update',
  'settings:update',
  'users:manage',
] as const;
export type Permission = (typeof permissions)[number];

const policy: Record<Role, readonly Permission[]> = {
  admin: permissions,
  user: ['games:read', 'games:update', 'settings:update'],
};

export const defaultRole: Role = 'user';

/** Reads `app_metadata.role`; anything unknown falls back to the least-privileged role. */
export function roleFromAppMetadata(appMetadata: unknown): Role {
  const role = (appMetadata as { role?: unknown } | null | undefined)?.role;
  return roles.find((r) => r === role) ?? defaultRole;
}

export function can(role: Role | undefined, permission: Permission): boolean {
  return role !== undefined && policy[role].includes(permission);
}
