const DEFAULT_REDIS_URL = 'redis://localhost:6379';

export function createBullRedisConnectionOptions(
  configuredUrl: string | undefined,
): { url: string } {
  const url = configuredUrl ?? DEFAULT_REDIS_URL;
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error('REDIS_URL must be a valid redis:// or rediss:// URL');
  }

  if (
    (parsedUrl.protocol !== 'redis:' && parsedUrl.protocol !== 'rediss:') ||
    !parsedUrl.hostname
  ) {
    throw new Error('REDIS_URL must be a valid redis:// or rediss:// URL');
  }

  return { url };
}
