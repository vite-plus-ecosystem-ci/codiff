import type { ReviewPreferences } from './types.ts';

export const defaultReviewPreferences: Readonly<ReviewPreferences> = Object.freeze({
  codeFontFamily: 'Fira Code',
  codeFontSize: 13,
  diffStyle: 'split',
  showWhitespace: false,
  theme: 'system',
  wordWrap: false,
});
