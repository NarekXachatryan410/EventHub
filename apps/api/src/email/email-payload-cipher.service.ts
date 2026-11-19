import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EmailPayload } from './email.types.js';

@Injectable()
export class EmailPayloadCipher {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    this.key = createHash('sha256')
      .update(config.getOrThrow<string>('EMAIL_ENCRYPTION_KEY'))
      .digest();
  }

  encrypt(payload: EmailPayload): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(payload), 'utf8'),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
  }

  decrypt(value: string): EmailPayload {
    const payload = Buffer.from(value, 'base64');
    if (payload.length < 29) {
      throw new Error('Stored email payload is invalid');
    }

    const iv = payload.subarray(0, 12);
    const authTag = payload.subarray(12, 28);
    const ciphertext = payload.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
    return JSON.parse(plaintext) as EmailPayload;
  }
}
