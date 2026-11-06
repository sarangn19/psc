import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateOptional } from '../src/routes/teacher';

describe('generateOptional diagnostic logging', () => {
  const originalEnv = { ...process.env };
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.AI_API_KEY = 'gemini-secret-key';
    process.env.AI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
    process.env.AI_PROVIDER = 'gemini';
    process.env.AI_MODEL = 'gemini-2.5-flash';
    process.env.AI_FALLBACK_API_KEY = 'groq-secret-key';
    process.env.AI_FALLBACK_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
    process.env.AI_FALLBACK_MODEL = 'llama-3.3-70b-versatile';
    process.env.AI_FALLBACK2_API_KEY = 'openrouter-secret-key';
    process.env.AI_FALLBACK2_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
    process.env.AI_FALLBACK2_MODEL = 'openai/gpt-oss-20b:free';
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

  it('logs Gemini 403 details', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403, text: async () => 'permission denied' });
    const result = await generateOptional('user-1', 'prompt');
    expect(result.status).toBe(502);
    const log = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(log).toContain('"provider":"gemini"');
    expect(log).toContain('"status":403');
    expect(log).toContain('permission denied');
  });

  it('logs Gemini 429 and attempts Groq', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'rate limited' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: 'groq ok' } }] }) });
    const result = await generateOptional('user-1', 'prompt');
    expect(result.body.text).toBe('groq ok');
    const log = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(log).toContain('"status":429');
  });

  it('logs Gemini timeout and attempts fallback', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('The operation was aborted due to timeout'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: 'fallback ok' } }] }) });
    const result = await generateOptional('user-1', 'prompt');
    expect(result.body.text).toBe('fallback ok');
    const log = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(log).toContain('ai_provider_network_error');
  });

  it('logs both Gemini failure and Groq success', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'gemini down' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: 'groq answer' } }] }) });
    const result = await generateOptional('user-1', 'prompt');
    expect(result.body.fallbackProvider).toBe('groq');
    const log = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(log).toContain('gemini down');
  });

  it('logs all three providers when OpenRouter succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'gemini down' })
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'groq down' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: 'openrouter answer' } }] }) });
    const result = await generateOptional('user-1', 'prompt');
    expect(result.body.fallbackProvider).toBe('openrouter');
  });

  it('logs all-providers-exhausted when all fail', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'gemini down' })
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'groq down' })
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'openrouter down' });
    const result = await generateOptional('user-1', 'prompt');
    expect(result.status).toBe(502);
    const log = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(log).toContain('ai_all_providers_exhausted');
  });

  it('logs empty response event', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '' }] } }] }) });
    const result = await generateOptional('user-1', 'prompt');
    expect(result.body.generated).not.toBe(true);
    const log = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(log).toContain('ai_provider_empty_response');
  });

  it('never logs secrets or student message', async () => {
    const secret = 'super-secret-student-message';
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403, text: async () => `error ${process.env.AI_API_KEY} ${secret}` });
    await generateOptional('user-1', secret);
    const log = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(log).not.toContain(process.env.AI_API_KEY!);
    expect(log).not.toContain('groq-secret-key');
    expect(log).not.toContain(secret);
  });
});