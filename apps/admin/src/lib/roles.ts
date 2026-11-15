import type { StaffRole } from '@3nayan/shared';

export type NavItem = { href: string; label: string; roles: StaffRole[] };

/** Spec §11: which staff roles can open each admin screen. */
export const NAV: NavItem[] = [
  { href: '/applications', label: 'Applications', roles: ['reviewer', 'super_admin'] },
  { href: '/trials', label: 'My trial calls', roles: ['reviewer', 'super_admin'] },
  { href: '/practitioners', label: 'Practitioners', roles: ['support', 'finance', 'super_admin'] },
  { href: '/attention', label: 'Needs attention', roles: ['finance', 'support', 'super_admin'] },
  { href: '/categories', label: 'Categories', roles: ['super_admin'] },
  { href: '/staff', label: 'Staff', roles: ['super_admin'] },
  { href: '/settings', label: 'Settings', roles: ['super_admin'] },
  { href: '/audit', label: 'Audit log', roles: ['super_admin'] },
];

export const navFor = (role: StaffRole) => NAV.filter((n) => n.roles.includes(role));
export const landingFor = (role: StaffRole) => navFor(role)[0]?.href ?? '/login';
