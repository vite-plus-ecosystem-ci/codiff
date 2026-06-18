import { createRequire } from 'node:module';
import { expect, test, vi } from 'vite-plus/test';

const require = createRequire(import.meta.url);
const { createCloudflareAccessClient } = require('../cloudflare-access.cjs') as {
  createCloudflareAccessClient: (options: {
    fetchImpl?: typeof fetch;
    runCommand: (args: Array<string>, options?: { timeoutMs?: number }) => Promise<string>;
    serviceUrl: string;
  }) => {
    authenticate: () => Promise<void>;
    clear: () => void;
    fetch: typeof fetch;
  };
};

test('uses an existing Access token without opening a login flow', async () => {
  const runCommand = vi.fn(async () => 'existing.jwt.token');
  const fetchImpl = vi.fn(async () => Response.json({ ok: true }));
  const client = createCloudflareAccessClient({
    fetchImpl,
    runCommand,
    serviceUrl: 'https://codiff.example',
  });

  await client.authenticate();
  await client.fetch('https://codiff.example/api/upload-intents', { method: 'POST' });

  expect(runCommand).toHaveBeenCalledTimes(1);
  expect(runCommand).toHaveBeenCalledWith(['access', 'token', 'https://codiff.example'], {
    timeoutMs: 30_000,
  });
  const headers = new Headers(fetchImpl.mock.calls[0]?.[1]?.headers);
  expect(headers.get('cf-access-token')).toBe('existing.jwt.token');
});

test('opens system-browser authentication when no Access token exists', async () => {
  const runCommand = vi
    .fn()
    .mockRejectedValueOnce(new Error('token missing'))
    .mockResolvedValueOnce('')
    .mockResolvedValueOnce('new.jwt.token');
  const client = createCloudflareAccessClient({
    runCommand,
    serviceUrl: 'https://codiff.example/',
  });

  await client.authenticate();

  expect(runCommand.mock.calls.map(([args]) => args)).toEqual([
    ['access', 'token', 'https://codiff.example'],
    ['access', 'login', '--quiet', '--auto-close', 'https://codiff.example'],
    ['access', 'token', 'https://codiff.example'],
  ]);
});

test('does not send the Access token to another origin or after clearing it', async () => {
  const client = createCloudflareAccessClient({
    runCommand: async () => 'access.jwt.token',
    serviceUrl: 'https://codiff.example',
  });
  await client.authenticate();

  await expect(client.fetch('https://attacker.example/api')).rejects.toThrow('another origin');

  client.clear();
  await expect(client.fetch('https://codiff.example/api')).rejects.toThrow(
    'authentication is required',
  );
});
