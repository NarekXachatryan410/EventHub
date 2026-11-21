const DEFAULT_PORT = 4000;

export function parsePort(value: string | undefined): number {
  if (value === undefined) return DEFAULT_PORT;

  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  const port = Number(trimmed);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  return port;
}

export type TrustProxySetting = boolean | number | string;

export function parseTrustProxy(
  value: string | undefined,
): TrustProxySetting | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  const normalized = trimmed.toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;

  if (/^[+-]?\d+(\.\d+)?$/.test(trimmed)) {
    if (!/^\d+$/.test(trimmed)) {
      throw new Error(
        'TRUST_PROXY must be a boolean, non-negative integer hop count, or proxy range',
      );
    }

    const hops = Number(trimmed);
    if (!Number.isSafeInteger(hops)) {
      throw new Error(
        'TRUST_PROXY hop count must be a non-negative safe integer',
      );
    }
    return hops;
  }

  return trimmed;
}
