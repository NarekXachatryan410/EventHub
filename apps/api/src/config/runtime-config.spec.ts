import { parsePort, parseTrustProxy } from './runtime-config.js';

describe('parsePort', () => {
  it('uses the default port when PORT is unset', () => {
    expect(parsePort(undefined)).toBe(4000);
  });

  it('parses a valid PORT as a number', () => {
    expect(parsePort(' 8080 ')).toBe(8080);
  });

  it.each(['0', '65536', '1.5', '4000x', ''])(
    'rejects invalid PORT value %j',
    (value) => {
      expect(() => parsePort(value)).toThrow(
        'PORT must be an integer between 1 and 65535',
      );
    },
  );
});

describe('parseTrustProxy', () => {
  it('leaves proxy trust unset when TRUST_PROXY is empty', () => {
    expect(parseTrustProxy(undefined)).toBeUndefined();
    expect(parseTrustProxy('  ')).toBeUndefined();
  });

  it('parses boolean values', () => {
    expect(parseTrustProxy('true')).toBe(true);
    expect(parseTrustProxy('FALSE')).toBe(false);
  });

  it('parses a numeric hop count as a number', () => {
    expect(parseTrustProxy('1')).toBe(1);
    expect(parseTrustProxy('0')).toBe(0);
  });

  it('preserves explicitly configured proxy ranges', () => {
    expect(parseTrustProxy(' loopback, 10.0.0.0/8 ')).toBe(
      'loopback, 10.0.0.0/8',
    );
  });

  it.each(['-1', '1.5'])('rejects invalid numeric value %j', (value) => {
    expect(() => parseTrustProxy(value)).toThrow(
      'TRUST_PROXY must be a boolean, non-negative integer hop count, or proxy range',
    );
  });
});
