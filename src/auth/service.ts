import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { jwtExpiresIn, jwtSecret } from './config.js';
import { verifyPassword } from './password.js';
import type { AppRepository } from '../store/repository.js';
import type { AuthContext } from './types.js';

interface TokenClaims {
  sub: string;
  storeId: string;
  email: string;
  role: AuthContext['role'];
}

export class AuthService {
  constructor(private readonly repository: Pick<AppRepository, 'getAuthUserByEmail'>) {}

  async login(storeId: string, email: string, password: string): Promise<{ token: string; user: AuthContext } | undefined> {
    const matched = await this.repository.getAuthUserByEmail(storeId, email.toLowerCase());
    if (!matched) return undefined;
    if (!matched.active) return undefined;
    if (!verifyPassword(password, matched.passwordHash)) return undefined;

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
