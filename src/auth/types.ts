export type UserRole = 'STAFF' | 'MANAGER';

export interface AuthUser {
  userId: string;
  storeId: string;
  email: string;
  role: UserRole;
  password: string;
}

export interface AuthContext {
  userId: string;
  storeId: string;
  email: string;
  role: UserRole;
}
