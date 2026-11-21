export function validateEnvironment(
  environment: Record<string, unknown>,
): Record<string, unknown> {
  if (environment.NODE_ENV !== 'production') {
    const sender = emailAddress(value(environment.RESEND_FROM_EMAIL));
    if (sender && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender)) {
      throw new Error(
        'Invalid environment configuration: RESEND_FROM_EMAIL must be a sender email address (for example, EventHub <tickets@your-verified-domain.com>), not a DNS verification record',
      );
    }
    return environment;
  }

  const issues: string[] = [];
  const jwtSecret = value(environment.JWT_SECRET);
  const encryptionKey = value(environment.EMAIL_ENCRYPTION_KEY);
  const databaseUrl = value(environment.DATABASE_URL);
  const redisUrl = value(environment.REDIS_URL);
  const webOrigin = value(environment.WEB_ORIGIN);

  if (
    jwtSecret.length < 32 ||
    /replace|local-only|change-me/i.test(jwtSecret)
  ) {
    issues.push(
      'JWT_SECRET must be a deployment-specific secret of at least 32 characters',
    );
  }
  if (
    encryptionKey.length < 32 ||
    /replace|local-only|change-me/i.test(encryptionKey)
  ) {
    issues.push(
      'EMAIL_ENCRYPTION_KEY must be a separate deployment-specific secret of at least 32 characters',
    );
  }
  if (!/^postgres(ql)?:\/\//i.test(databaseUrl)) {
    issues.push('DATABASE_URL must point to PostgreSQL');
  }
  if (!redisUrl) issues.push('REDIS_URL must be configured');
  if (
    !value(environment.RESEND_API_KEY) ||
    !value(environment.RESEND_FROM_EMAIL)
  ) {
    issues.push('Resend API key and verified sender must be configured');
  } else {
    const sender = emailAddress(value(environment.RESEND_FROM_EMAIL));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender)) {
      issues.push('RESEND_FROM_EMAIL must be a valid email address');
    } else if (isResendTestDomain(sender)) {
      issues.push(
        'RESEND_FROM_EMAIL must use a domain verified in Resend; the resend.dev testing sender cannot send attendee emails',
      );
    }
  }
  if (!value(environment.RESEND_WEBHOOK_SECRET)) {
    issues.push(
      'RESEND_WEBHOOK_SECRET must be configured to track email delivery',
    );
  }
  try {
    if (new URL(webOrigin).protocol !== 'https:') {
      issues.push('WEB_ORIGIN must use HTTPS in production');
    }
  } catch {
    issues.push('WEB_ORIGIN must be a valid HTTPS URL');
  }

  if (issues.length) {
    throw new Error(`Invalid production configuration: ${issues.join('; ')}`);
  }
  return environment;
}

function value(input: unknown): string {
  return typeof input === 'string' ? input.trim() : '';
}

function emailAddress(sender: string): string {
  return (sender.match(/<([^<>]+)>/)?.[1] ?? sender).trim();
}

function isResendTestDomain(sender: string): boolean {
  const domain = sender.split('@').at(-1)?.toLowerCase() ?? '';
  return domain === 'resend.dev' || domain.endsWith('.resend.dev');
}
