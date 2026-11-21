import Redis from 'ioredis';
import { createBullRedisConnectionOptions } from './redis-connection.js';

describe('createBullRedisConnectionOptions', () => {
  it('keeps the local Redis default when REDIS_URL is unset', () => {
    expect(createBullRedisConnectionOptions(undefined)).toEqual({
      url: 'redis://localhost:6379',
    });
  });

  it('passes the complete Redis URL so TLS and authentication are retained', () => {
    const url = 'rediss://queue-user:p%40ss@redis.example.test:6380/2';

    expect(createBullRedisConnectionOptions(url)).toEqual({ url });

    const client = new Redis(url, { lazyConnect: true });
    try {
      expect(client.options).toMatchObject({
        host: 'redis.example.test',
        port: 6380,
        username: 'queue-user',
        password: 'p@ss',
        db: 2,
        tls: true,
      });
    } finally {
      client.disconnect();
    }
  });

  it.each(['https://redis.example.test', 'redis://', 'not a URL'])(
    'rejects unsupported or invalid Redis URL %j',
    (url) => {
      expect(() => createBullRedisConnectionOptions(url)).toThrow(
        'REDIS_URL must be a valid redis:// or rediss:// URL',
      );
    },
  );
});
