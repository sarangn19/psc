import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { allowedOrigins, isOriginAllowed } from '../src/app';

const STAGING_ORIGIN = 'https://psc-frontend-5a2a2eqls-sarangn19-6275s-projects.vercel.app';
const UNAPPROVED_ORIGIN = 'https://psc-frontend-evil-xyz-sarangn19-6275s-projects.vercel.app';

describe('CORS allowedOrigins', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv.FRONTEND_URL = process.env.FRONTEND_URL;
    savedEnv.VERCEL_URL = process.env.VERCEL_URL;
    savedEnv.ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS;
    // Clear for deterministic tests
    delete process.env.FRONTEND_URL;
    delete process.env.VERCEL_URL;
    delete process.env.ALLOWED_ORIGINS;
  });

  afterEach(() => {
    process.env.FRONTEND_URL = savedEnv.FRONTEND_URL;
    process.env.VERCEL_URL = savedEnv.VERCEL_URL;
    process.env.ALLOWED_ORIGINS = savedEnv.ALLOWED_ORIGINS;
  });

  it('includes production origins', () => {
    const origins = allowedOrigins();
    expect(origins.has('https://www.cognix.space')).toBe(true);
    expect(origins.has('https://cognix.space')).toBe(true);
    expect(origins.has('https://psc-frontend-roxc.vercel.app')).toBe(true);
    expect(origins.has('https://psc-frontend-two.vercel.app')).toBe(true);
  });

  it('includes localhost development origins', () => {
    const origins = allowedOrigins();
    expect(origins.has('http://localhost:5173')).toBe(true);
    expect(origins.has('http://localhost:3000')).toBe(true);
  });

  it('includes the exact staging Preview origin', () => {
    const origins = allowedOrigins();
    expect(origins.has(STAGING_ORIGIN)).toBe(true);
  });

  it('includes FRONTEND_URL when set', () => {
    process.env.FRONTEND_URL = 'https://custom-frontend.example.com';
    const origins = allowedOrigins();
    expect(origins.has('https://custom-frontend.example.com')).toBe(true);
  });

  it('includes VERCEL_URL when it is a vercel.app origin', () => {
    process.env.VERCEL_URL = 'psc-frontend-abc123-sarangn19-6275s-projects.vercel.app';
    const origins = allowedOrigins();
    expect(origins.has('https://psc-frontend-abc123-sarangn19-6275s-projects.vercel.app')).toBe(true);
  });

  it('rejects a non-vercel VERCEL_URL', () => {
    process.env.VERCEL_URL = 'evil.example.com';
    const origins = allowedOrigins();
    expect(origins.has('https://evil.example.com')).toBe(false);
  });

  it('includes ALLOWED_ORIGINS entries (https only)', () => {
    process.env.ALLOWED_ORIGINS = 'https://extra1.example.com, https://extra2.example.com, http://insecure.example.com';
    const origins = allowedOrigins();
    expect(origins.has('https://extra1.example.com')).toBe(true);
    expect(origins.has('https://extra2.example.com')).toBe(true);
    expect(origins.has('http://insecure.example.com')).toBe(false);
  });

  it('does not allow an unapproved Vercel deployment origin by default', () => {
    const origins = allowedOrigins();
    expect(origins.has(UNAPPROVED_ORIGIN)).toBe(false);
  });
});

describe('isOriginAllowed', () => {
  it('allows requests with no Origin header', () => {
    const origins = new Set(['https://example.com']);
    expect(isOriginAllowed(undefined, origins)).toBe(true);
    expect(isOriginAllowed('', origins)).toBe(true);
  });

  it('allows an origin in the set', () => {
    const origins = new Set(['https://example.com']);
    expect(isOriginAllowed('https://example.com', origins)).toBe(true);
  });

  it('blocks an origin not in the set', () => {
    const origins = new Set(['https://example.com']);
    expect(isOriginAllowed('https://evil.com', origins)).toBe(false);
  });
});
