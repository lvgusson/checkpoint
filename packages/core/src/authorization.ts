// Declarative role-based access policy. Roles come from the verified JWT `app_metadata.role`;
// the Supabase `authenticated` claim is a database role and is never a product role.
export const Role = { Admin: 'admin', User: 'user' } as const;
export type Role = (typeof Role)[keyof typeof Role];
export const roles = Object.values(Role);

export const Permission = {
  GamesRead: 'games:read',
  GamesUpdate: 'games:update',
  CatalogUpdate: 'catalog:update',
  SettingsUpdate: 'settings:update',
  UsersManage: 'users:manage',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];
export const permissions = Object.values(Permission);

const policy: Record<Role, ReadonlySet<Permission>> = {
  [Role.Admin]: new Set(permissions),
  [Role.User]: new Set([Permission.GamesRead, Permission.GamesUpdate, Permission.SettingsUpdate]),
};

export const defaultRole: Role = Role.User;

/** Reads `app_metadata.role`; anything unknown falls back to the least-privileged role. */
export function roleFromAppMetadata(appMetadata: unknown): Role {
  const role = (appMetadata as { role?: unknown } | null | undefined)?.role;
  return roles.find((r) => r === role) ?? defaultRole;
}

export function can(role: Role | undefined, permission: Permission): boolean {
  return role !== undefined && (policy[role]?.has(permission) ?? false);
}
