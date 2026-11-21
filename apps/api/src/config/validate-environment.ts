export function validateEnvironment(
  environment: Record<string, unknown>,
): Record<string, unknown> {
  if (environment.NODE_ENV !== 'production') {
    const sender = emailAddress(value(environment.RESEND_FROM_EMAIL));
    if (sender && !isValidEmailAddress(sender)) {
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
  const directUrl = value(environment.DIRECT_URL);
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
  if (jwtSecret && jwtSecret === encryptionKey) {
    issues.push('JWT_SECRET and EMAIL_ENCRYPTION_KEY must be different secrets');
  }
  if (!isPostgresUrl(databaseUrl)) {
    issues.push('DATABASE_URL must point to PostgreSQL');
  }
  if (!isPostgresUrl(directUrl)) {
    issues.push('DIRECT_URL must point to the direct PostgreSQL connection used for migrations');
  }
  if (!isRedisUrl(redisUrl)) {
    issues.push('REDIS_URL must be a valid redis:// or rediss:// URL');
  }
  if (
    !value(environment.RESEND_API_KEY) ||
    !value(environment.RESEND_FROM_EMAIL)
  ) {
    issues.push('Resend API key and verified sender must be configured');
  } else {
    const sender = emailAddress(value(environment.RESEND_FROM_EMAIL));
    if (!isValidEmailAddress(sender)) {
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
    const parsedOrigin = new URL(webOrigin);
    if (parsedOrigin.protocol !== 'https:') {
      issues.push('WEB_ORIGIN must use HTTPS in production');
    }
    if (
      parsedOrigin.username ||
      parsedOrigin.password ||
      parsedOrigin.pathname !== '/' ||
      parsedOrigin.search ||
      parsedOrigin.hash
    ) {
      issues.push('WEB_ORIGIN must contain only the frontend origin, without a path or credentials');
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

function isPostgresUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'postgres:' || url.protocol === 'postgresql:') &&
      url.hostname.length > 0
    );
  } catch {
    return false;
  }
}

function isRedisUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'redis:' || url.protocol === 'rediss:') &&
      url.hostname.length > 0
    );
  } catch {
    return false;
  }
}

function emailAddress(sender: string): string {
  return (sender.match(/<([^<>]+)>/)?.[1] ?? sender).trim();
}

function isValidEmailAddress(address: string): boolean {
  const [localPart, domain, ...extraParts] = address.split('@');
  if (
    !localPart ||
    !domain ||
    extraParts.length > 0 ||
    localPart.length > 64 ||
    address.length > 254
  ) {
    return false;
  }
  const labels = domain.split('.');
  return (
    labels.length >= 2 &&
    labels.every((label) =>
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label),
    ) &&
    /^[a-z]{2,63}$/i.test(labels.at(-1) ?? '')
  );
}

function isResendTestDomain(sender: string): boolean {
  const domain = sender.split('@').at(-1)?.toLowerCase() ?? '';
  return domain === 'resend.dev' || domain.endsWith('.resend.dev');
}
