import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { configuredUsers, jwtExpiresIn, jwtSecret } from './config.js';
import type { AuthContext, AuthUser } from './types.js';

interface TokenClaims {
  sub: string;
  storeId: string;
  email: string;
  role: AuthContext['role'];
}

export class AuthService {
  private readonly users: AuthUser[];

  constructor() {
    this.users = configuredUsers();
  }

  login(storeId: string, email: string, password: string): { token: string; user: AuthContext } | undefined {
    const matched = this.users.find((user) => user.storeId === storeId && user.email.toLowerCase() === email.toLowerCase());
    if (!matched) return undefined;
    if (matched.password !== password) return undefined;

    const user: AuthContext = {
      userId: matched.userId,
      storeId: matched.storeId,
      email: matched.email,
      role: matched.role
    };

    const claims: TokenClaims = {
      sub: user.userId,
      storeId: user.storeId,
      email: user.email,
      role: user.role
    };

    const expiresIn = jwtExpiresIn() as NonNullable<SignOptions['expiresIn']>;
    const token = jwt.sign(claims, jwtSecret(), { expiresIn });
    return { token, user };
  }

  verify(token: string): AuthContext | undefined {
    try {
      const decoded = jwt.verify(token, jwtSecret()) as TokenClaims;
      return {
        userId: decoded.sub,
        storeId: decoded.storeId,
        email: decoded.email,
        role: decoded.role
      };
    } catch {
      return undefined;
    }
  }
}
