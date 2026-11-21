import { jest } from '@jest/globals';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from './jwt-auth.guard.js';

describe('JwtAuthGuard request origin protection', () => {
  const user = { id: 'user-id', role: UserRole.EVENT_MANAGER, isActive: true };
  const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: user.id, role: user.role }) };
  const prisma = { user: { findUnique: jest.fn().mockResolvedValue(user) } };
  const config = { getOrThrow: jest.fn().mockReturnValue('https://events.example.test') };

  function createGuard(method: string, origin?: string) {
    const request = {
      method,
      cookies: { eventhub_auth: 'session-token' },
      get: jest.fn().mockReturnValue(origin),
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    };
    return {
      guard: new JwtAuthGuard(jwt as never, prisma as never, config as never),
      context: context as never,
      request,
    };
  }

  beforeEach(() => {
    jwt.verifyAsync.mockClear();
    prisma.user.findUnique.mockClear();
  });

  it('rejects state-changing requests with a foreign Origin before authorization', async () => {
    const { guard, context } = createGuard('POST', 'https://attacker.example');
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it('accepts state-changing requests from the configured frontend origin', async () => {
    const { guard, context } = createGuard('PATCH', 'https://events.example.test');
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(jwt.verifyAsync).toHaveBeenCalledWith('session-token');
  });

  it('keeps safe read requests independent of Origin', async () => {
    const { guard, context } = createGuard('GET');
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('rejects an expired session token', async () => {
    jwt.verifyAsync.mockRejectedValueOnce(new Error('jwt expired'));
    const { guard, context } = createGuard('GET');
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
