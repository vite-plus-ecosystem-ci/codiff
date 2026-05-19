import { createRequire } from 'node:module';
import { expect, test } from 'vite-plus/test';

const require = createRequire(import.meta.url);
const { DEFAULT_OPENAI_MODEL, isOpenAIModelAvailabilityError, normalizeOpenAIModel } =
  require('../codex.cjs') as {
    DEFAULT_OPENAI_MODEL: string;
    isOpenAIModelAvailabilityError: (value: string) => boolean;
    normalizeOpenAIModel: (value: unknown) => string;
  };

test('normalizes OpenAI model preferences to known models', () => {
  expect(normalizeOpenAIModel('gpt-5.3-codex')).toBe('gpt-5.3-codex');
  expect(normalizeOpenAIModel('gpt-4o')).toBe(DEFAULT_OPENAI_MODEL);
});

test('detects selected model availability failures', () => {
  expect(
    isOpenAIModelAvailabilityError('You do not have access to model gpt-5.3-codex-spark.'),
  ).toBe(true);
  expect(isOpenAIModelAvailabilityError('Rate limit reached, please try again later.')).toBe(false);
});
