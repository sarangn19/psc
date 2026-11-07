import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateOptional } from '../src/routes/teacher';

describe('generateOptional diagnostic logging', () => {
  const originalEnv = { ...process.env };
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.AI_FALLBACK_API_KEY = 'groq-secret-key';
    process.env.AI_FALLBACK_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
    process.env.AI_FALLBACK_MODEL = 'openai/gpt-oss-20b';
    process.env.AI_MAX_TOKENS = '180';
    process.env.AI_TIMEOUT_MS = '15000';
    process.env.AI_RPM = '100';

    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    consoleSpy.mockRestore();
    process.env = { ...originalEnv };
  });

  it('logs Groq 403 details', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403, text: async () => 'permission denied' });
    const result = await generateOptional('user-1', 'prompt');
    expect(result.status).toBe(502);
    const log = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(log).toContain('"provider":"groq"');
    expect(log).toContain('"status":403');
  });

  it('logs Groq 429 failure', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'rate limited' });
    const result = await generateOptional('user-1', 'prompt');
    expect(result.status).toBe(502);
    const log = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(log).toContain('"status":429');
  });

  it('logs Groq timeout', async () => {
    fetchMock.mockRejectedValueOnce(new Error('The operation was aborted due to timeout'));
    const result = await generateOptional('user-1', 'prompt');
    expect(result.status).toBe(502);
    const log = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(log).toContain('ai_provider_network_error');
  });

  it('logs all-providers-exhausted when Groq fails', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'groq down' });
    const result = await generateOptional('user-1', 'prompt');
    expect(result.status).toBe(502);
    const log = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(log).toContain('ai_all_providers_exhausted');
  });

  it('logs empty response event', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: '' } }] }) });
    const result = await generateOptional('user-1', 'prompt');
    expect(result.body.generated).not.toBe(true);
    const log = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(log).toContain('ai_provider_empty_response');
  });

  it('never logs secrets or student message', async () => {
    const secret = 'super-secret-student-message';
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403, text: async () => `error ${process.env.AI_FALLBACK_API_KEY} ${secret}` });
    await generateOptional('user-1', secret);
    const log = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(log).not.toContain(process.env.AI_FALLBACK_API_KEY!);
    expect(log).not.toContain(secret);
  });
});
