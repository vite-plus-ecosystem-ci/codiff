// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

const fate = vi.hoisted(() => ({
  useRequest: vi.fn(),
}));

vi.mock('react-fate', () => ({
  useRequest: fate.useRequest,
  useView: (_view: unknown, ref: unknown) => ref,
  view: () => (selection: unknown) => selection,
}));

import StatsPage from './StatsPage.tsx';

const days = Array.from({ length: 7 }, (_, index) => {
  const date = new Date(Date.UTC(2026, 5, 20 + index)).toISOString().slice(0, 10);
  return {
    date,
    id: `share-stats-day:${date}`,
    plans: index,
    walkthroughs: 6 - index,
  };
});

const stats = {
  days,
  id: 'share-stats',
  maxDailyShares: 6,
  totalPlans: 1234,
  totalWalkthroughs: 567,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  fate.useRequest.mockReset().mockReturnValue({ sharingStats: stats });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

test('matches the Codiff stats layout with public share series', async () => {
  await act(async () => root.render(<StatsPage />));

  expect(document.title).toBe('Usage · Codiff');
  expect(container.querySelector('h1')?.textContent).toBe('Codiff Usage');
  expect(container.textContent).toContain('1,234');
  expect(container.textContent).toContain('567');
  expect(
    container.querySelector('.codiff-web-stats-totals section:first-child span')?.textContent,
  ).toBe('Walkthrough Shares');
  expect(
    container.querySelector('.codiff-web-stats-totals section:nth-child(2) span')?.textContent,
  ).toBe('Plans');
  expect(container.textContent).not.toContain('MR Walkthroughs');
  expect(container.textContent).not.toContain('Public, unlisted shares on codiff.dev.');
  expect(container.querySelectorAll('.codiff-web-stats-point-plans')).toHaveLength(7);
  expect(container.querySelectorAll('.codiff-web-stats-point-walkthroughs')).toHaveLength(7);
  expect(container.querySelectorAll('.codiff-web-stats-line-plans')).toHaveLength(6);
  expect(container.querySelectorAll('.codiff-web-stats-line-walkthroughs')).toHaveLength(6);
  expect(container.querySelector('.codiff-web-stats-chart-card')).not.toBeNull();
  expect(fate.useRequest).toHaveBeenCalledWith({
    sharingStats: {
      view: expect.any(Object),
    },
  });
});
