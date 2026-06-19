import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vite-plus/test';

const require = createRequire(import.meta.url);
const {
  DEFAULT_OPENCODE_MODEL,
  FALLBACK_OPENCODE_MODEL,
  OPENCODE_MODELS,
  OPENCODE_NOT_FOUND_CODE,
  OPENCODE_TIMEOUT_MS,
  getOpenCodeCommand,
  isOpenCodeNotFoundError,
  normalizeOpenCodeModel,
  normalizeOpenCodeOutput,
  runOpenCode,
} = require('../opencode.cjs') as {
  DEFAULT_OPENCODE_MODEL: string;
  FALLBACK_OPENCODE_MODEL: string;
  OPENCODE_MODELS: ReadonlyArray<{ id: string; label: string }>;
  OPENCODE_NOT_FOUND_CODE: string;
  OPENCODE_TIMEOUT_MS: number;
  getOpenCodeCommand: () => string;
  isOpenCodeNotFoundError: (error: unknown) => boolean;
  normalizeOpenCodeModel: (value: unknown) => string;
  normalizeOpenCodeOutput: (output: string, schema: unknown) => string;
  runOpenCode: (
    repoRoot: string,
    prompt: string,
    schema: unknown,
    outputName?: string,
    timeoutMessage?: string,
    options?: { model?: string },
  ) => Promise<string>;
};

test('exposes the OpenCode configured default model', () => {
  expect(DEFAULT_OPENCODE_MODEL).toBe('opencode-default');
  expect(FALLBACK_OPENCODE_MODEL).toBe(DEFAULT_OPENCODE_MODEL);
  expect(OPENCODE_TIMEOUT_MS).toBe(300_000);
  expect(OPENCODE_MODELS).toEqual([
    { id: DEFAULT_OPENCODE_MODEL, label: 'OpenCode configured default' },
  ]);
  expect(normalizeOpenCodeModel(DEFAULT_OPENCODE_MODEL)).toBe(DEFAULT_OPENCODE_MODEL);
  expect(normalizeOpenCodeModel('openai/gpt-5')).toBe(DEFAULT_OPENCODE_MODEL);
});

test('detects OpenCode-not-found errors and invalid overrides', () => {
  expect(isOpenCodeNotFoundError({ code: OPENCODE_NOT_FOUND_CODE })).toBe(true);
  expect(isOpenCodeNotFoundError({ code: 'ENOENT' })).toBe(true);
  expect(isOpenCodeNotFoundError(new Error('other'))).toBe(false);

  const previousOpenCodePath = process.env.CODIFF_OPENCODE_PATH;
  process.env.CODIFF_OPENCODE_PATH = '/tmp/codiff-missing-opencode';
  try {
    expect(() => getOpenCodeCommand()).toThrow('CODIFF_OPENCODE_PATH');
  } finally {
    if (previousOpenCodePath == null) {
      delete process.env.CODIFF_OPENCODE_PATH;
    } else {
      process.env.CODIFF_OPENCODE_PATH = previousOpenCodePath;
    }
  }
});

test('normalizes OpenCode JSON text events', () => {
  const output = [
    JSON.stringify({ part: { id: 'step', text: 'Working...' }, type: 'text' }),
    JSON.stringify({ part: { id: 'answer', text: '{"reply":"Done."}' }, type: 'text' }),
  ].join('\n');

  expect(normalizeOpenCodeOutput(output, { required: ['reply'] })).toBe('{"reply":"Done."}');
});

test('runs OpenCode as an external read-only call', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codiff-opencode-'));
  const fakeOpenCodePath = join(directory, 'opencode');
  const argsPath = join(directory, 'args.txt');
  const envPath = join(directory, 'env.txt');
  const stdinPath = join(directory, 'stdin.txt');
  const previousOpenCodePath = process.env.CODIFF_OPENCODE_PATH;

  try {
    await writeFile(
      fakeOpenCodePath,
      `#!/usr/bin/env node
const { writeFileSync } = require('node:fs');
writeFileSync(${JSON.stringify(argsPath)}, process.argv.slice(2).join('\\n'));
writeFileSync(${JSON.stringify(envPath)}, process.env.OPENCODE_PERMISSION || '');
let stdin = '';
process.stdin.on('data', (chunk) => {
  stdin += chunk;
});
process.stdin.on('end', () => {
  writeFileSync(${JSON.stringify(stdinPath)}, stdin);
  process.stdout.write(JSON.stringify({
    type: 'text',
    part: { id: 'answer', text: '{"version":1}' },
  }) + '\\n');
});
`,
    );
    await chmod(fakeOpenCodePath, 0o755);
    process.env.CODIFF_OPENCODE_PATH = fakeOpenCodePath;

    await expect(
      runOpenCode(directory, 'prompt', { required: ['version'], type: 'object' }),
    ).resolves.toBe('{"version":1}');

    expect((await readFile(argsPath, 'utf8')).split('\n')).toEqual([
      'run',
      '--format',
      'json',
      '--pure',
      '--agent',
      'build',
      '--dir',
      directory,
    ]);
    expect(JSON.parse(await readFile(envPath, 'utf8'))).toEqual({ '*': 'deny' });
    const stdin = await readFile(stdinPath, 'utf8');
    expect(stdin).toContain('prompt');
    expect(stdin).toContain('Follow this JSON Schema exactly');
    expect(stdin).toContain('"required":["version"]');
  } finally {
    if (previousOpenCodePath == null) {
      delete process.env.CODIFF_OPENCODE_PATH;
    } else {
      process.env.CODIFF_OPENCODE_PATH = previousOpenCodePath;
    }
    await rm(directory, { force: true, recursive: true });
  }
});
