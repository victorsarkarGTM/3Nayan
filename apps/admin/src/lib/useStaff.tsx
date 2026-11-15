'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { StaffRole } from '@3nayan/shared';

export type StaffInfo = { userId: string; email: string; role: StaffRole };
const StaffContext = createContext<StaffInfo | null>(null);

export const StaffProvider = ({ value, children }: { value: StaffInfo; children: ReactNode }) => (
  <StaffContext.Provider value={value}>{children}</StaffContext.Provider>
);

export function useStaff(): StaffInfo {
  const s = useContext(StaffContext);
  if (!s) throw new Error('useStaff must be used inside the staff layout');
  return s;
}

/** Renders children only for the given roles (UI convenience — the server enforces roles too). */
export function RoleGate({ roles, children, fallback = null }: { roles: StaffRole[]; children: ReactNode; fallback?: ReactNode }) {
  const { role } = useStaff();
  return <>{roles.includes(role) ? children : fallback}</>;
}
