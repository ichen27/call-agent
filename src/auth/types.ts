export type UserRole = 'STAFF' | 'MANAGER';

export interface AuthCredentialRecord {
  userId: string;
  storeId: string;
  email: string;
  role: UserRole;
  passwordHash: string;
  active: boolean;
}

export interface ConfiguredAuthUser {
  userId: string;
  storeId: string;
  email: string;
  role: UserRole;
  passwordHash: string;
  active: boolean;
}

export interface AuthContext {
  userId: string;
  storeId: string;
  email: string;
  role: UserRole;
}
