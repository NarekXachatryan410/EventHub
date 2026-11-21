import { validateEnvironment } from './validate-environment.js';

describe('validateEnvironment', () => {
  const productionConfig = {
    NODE_ENV: 'production',
    JWT_SECRET: 't3'.repeat(32),
    EMAIL_ENCRYPTION_KEY: 'e4'.repeat(32),
    DATABASE_URL: 'postgresql://db.example.test/eventhub',
    DIRECT_URL: 'postgresql://db-direct.example.test/eventhub',
    REDIS_URL: 'rediss://redis.example.test:6379',
    WEB_ORIGIN: 'https://events.example.test',
    RESEND_API_KEY: 're_test_key',
    RESEND_FROM_EMAIL: 'events@example.test',
    RESEND_WEBHOOK_SECRET: 'whsec_test_secret',
  };

  it('accepts a complete production environment', () => {
    expect(validateEnvironment(productionConfig)).toBe(productionConfig);
  });

  it('rejects placeholder secrets and insecure public origins in production', () => {
    expect(() =>
      validateEnvironment({
        ...productionConfig,
        JWT_SECRET: 'local-only-secret-replace-before-deployment',
        WEB_ORIGIN: 'http://events.example.test',
      }),
    ).toThrow(/JWT_SECRET.*WEB_ORIGIN/);
  });

  it('requires a Resend webhook signing secret in production', () => {
    expect(() =>
      validateEnvironment({ ...productionConfig, RESEND_WEBHOOK_SECRET: '' }),
    ).toThrow(/RESEND_WEBHOOK_SECRET/);
  });

  it('requires a direct PostgreSQL URL for production migration startup', () => {
    expect(() =>
      validateEnvironment({ ...productionConfig, DIRECT_URL: '' }),
    ).toThrow(/DIRECT_URL must point to the direct PostgreSQL connection/);
  });

  it('requires separate JWT and outbox encryption secrets', () => {
    expect(() =>
      validateEnvironment({
        ...productionConfig,
        EMAIL_ENCRYPTION_KEY: productionConfig.JWT_SECRET,
      }),
    ).toThrow(/JWT_SECRET and EMAIL_ENCRYPTION_KEY must be different/);
  });

  it('requires WEB_ORIGIN to be an origin rather than a URL with a path', () => {
    expect(() =>
      validateEnvironment({
        ...productionConfig,
        WEB_ORIGIN: 'https://events.example.test/dashboard',
      }),
    ).toThrow(/WEB_ORIGIN must contain only the frontend origin/);
  });

  it('rejects Resend testing senders in production', () => {
    expect(() =>
      validateEnvironment({
        ...productionConfig,
        RESEND_FROM_EMAIL: 'EventHub <onboarding@resend.dev>',
      }),
    ).toThrow(/RESEND_FROM_EMAIL.*domain verified in Resend/);
  });

  it('rejects malformed sender addresses in production', () => {
    expect(() =>
      validateEnvironment({
        ...productionConfig,
        RESEND_FROM_EMAIL: 'EventHub notifications',
      }),
    ).toThrow(/RESEND_FROM_EMAIL must be a valid email address/);
  });

  it('does not impose production-only secret requirements in development', () => {
    const development = { NODE_ENV: 'development' };
    expect(validateEnvironment(development)).toBe(development);
  });

  it('rejects a DNS verification record used as the development sender', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'development',
        RESEND_FROM_EMAIL:
          'EventHub <tickets@resend-domain-verification=abc.eventhubtest.com>',
      }),
    ).toThrow(/RESEND_FROM_EMAIL must be a sender email address.*not a DNS verification record/);
  });
});
