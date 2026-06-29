/**
 * @vitest-environment jsdom
 */

import { act } from 'react';
import { expect, test, vi } from 'vite-plus/test';
import { MergeRequestReviewApp } from '../SharedWalkthroughApp.tsx';
import type { NarrativeWalkthrough, RepositoryState } from '../types.ts';
import { createChangedFile } from './helpers/fixtures.ts';
import { renderReact, waitFor } from './helpers/react.tsx';

globalThis.ResizeObserver ??= class ResizeObserver {
  disconnect() {}
  observe() {}
  unobserve() {}
};

const state = {
  branch: 'feature/review',
  files: [createChangedFile('src/app.ts', { kind: 'pull-request' })],
  generatedAt: Date.parse('2026-06-26T00:00:00.000Z'),
  launchPath: 'cloudflare/voidzero/codiff-web',
  root: 'cloudflare/voidzero/codiff-web',
  source: {
    author: {
      avatarUrl: 'https://gitlab.cfdata.org/uploads/-/system/user/avatar/42/avatar.png',
      login: 'reviewer',
      name: 'Review Author',
      url: 'https://gitlab.cfdata.org/reviewer',
    },
    description: 'This explains the merge request.',
    headSha: 'abc123',
    host: 'gitlab.cfdata.org',
    number: 42,
    projectPath: 'cloudflare/voidzero/codiff-web',
    provider: 'gitlab',
    title: 'Review in Codiff',
    type: 'pull-request',
    url: 'https://gitlab.cfdata.org/cloudflare/voidzero/codiff-web/-/merge_requests/42',
  },
} satisfies RepositoryState;

const walkthrough = {
  agent: 'codex',
  chapters: [
    {
      blurb: 'Main path.',
      icon: 'path',
      id: 'main',
      stops: [
        {
          added: 1,
          deleted: 0,
          hunkIds: [],
          hunks: [],
          id: 'intro',
          importance: 'normal',
          prose: 'Start here.',
          title: 'Intro',
        },
      ],
      title: 'Main',
    },
  ],
  focus: 'Review this merge request.',
  generatedAt: '2026-06-26T00:00:00.000Z',
  kind: 'narrative',
  repo: { branch: 'feature/review', root: 'cloudflare/voidzero/codiff-web' },
  source: state.source,
  support: [],
  title: 'Review in Codiff',
  version: 4,
} satisfies NarrativeWalkthrough;

test('merge request reviews expose navigation, actions, and lazy walkthrough generation', async () => {
  const onGenerateWalkthrough = vi.fn();
  const onHome = vi.fn();
  const onClosePullRequest = vi.fn(async () => {});
  const onSubmitReview = vi.fn(async () => {});
  const view = await renderReact(
    <MergeRequestReviewApp
      externalUrl={state.source.url}
      onClosePullRequest={onClosePullRequest}
      onGenerateWalkthrough={onGenerateWalkthrough}
      onHome={onHome}
      onSubmitComment={vi.fn()}
      onSubmitGeneralComment={vi.fn()}
      onSubmitReview={onSubmitReview}
      onUpdateComment={vi.fn()}
      onUpdateGeneralComment={vi.fn()}
      state={state}
      title="Review in Codiff"
      walkthrough={null}
      walkthroughStatus="idle"
    />,
  );

  try {
    const home = view.container.querySelector<HTMLButtonElement>('[aria-label="Back to Codiff"]');
    const external = view.container.querySelector<HTMLAnchorElement>(
      '[aria-label="Open merge request in GitLab"]',
    );
    expect(home).not.toBeNull();
    expect(external?.href).toBe(state.source.url);

    await act(async () => home?.click());
    expect(onHome).toHaveBeenCalledOnce();

    const tabs = view.container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    expect(tabs[0]?.textContent).toBe('Tree');
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
    expect(view.container.querySelector('.codiff-web-source-description')).toBeNull();
    await waitFor(() => {
      const sourceDescription = view.container.querySelector('.codiff-source-description-item');
      expect(sourceDescription).not.toBeNull();
      expect(sourceDescription?.closest('.code-view')).not.toBeNull();
      expect(sourceDescription?.textContent).toContain('Review in Codiff');
      expect(sourceDescription?.textContent).toContain('This explains the merge request.');
    });
    const sourceDescriptionHeader = view.container.querySelector<HTMLElement>(
      '.codiff-source-description-header',
    );
    expect(sourceDescriptionHeader?.querySelector('.source-description-author-header')).toBeNull();
    expect(
      view.container.querySelector('.source-description-author-header')?.textContent,
    ).toContain('Review Author');
    expect(
      view.container.querySelector('.source-description-comment > .gravatar.medium'),
    ).not.toBeNull();

    const approve = view.container.querySelector<HTMLButtonElement>(
      '[aria-label="Approve review"]',
    );
    expect(approve?.closest('.codiff-source-description-header')).not.toBeNull();
    expect(approve?.closest('.review-action-bar')).toBeNull();
    expect(approve?.classList.contains('codiff-open-button')).toBe(true);
    await act(async () => approve?.click());
    expect(onSubmitReview).toHaveBeenCalledWith('APPROVE', []);

    const requestChanges = view.container.querySelector<HTMLButtonElement>(
      '[aria-label="Request changes"]',
    );
    expect(requestChanges?.closest('.codiff-source-description-header')).not.toBeNull();
    expect(requestChanges?.closest('.review-action-bar')).toBeNull();
    expect(requestChanges?.classList.contains('codiff-open-button')).toBe(true);
    await act(async () => requestChanges?.click());
    expect(onSubmitReview).toHaveBeenLastCalledWith('REQUEST_CHANGES', []);

    expect(view.container.querySelector('[aria-label="Close merge request"]')).toBeNull();

    await act(async () => tabs[1]?.click());
    expect(onGenerateWalkthrough).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(view.container.textContent).toContain('Generating walkthrough');
    });
    expect(view.container.querySelector('[aria-label="Approve review"]')).toBeNull();
    expect(view.container.querySelector('[aria-label="Request changes"]')).toBeNull();
  } finally {
    await view.cleanup();
  }
});

test('merge request reviews render a Resolve action for resolvable inline discussions', async () => {
  const onResolveDiscussion = vi.fn(async () => {});
  const view = await renderReact(
    <MergeRequestReviewApp
      externalUrl={state.source.url}
      onGenerateWalkthrough={vi.fn()}
      onHome={vi.fn()}
      onResolveDiscussion={onResolveDiscussion}
      onSubmitComment={vi.fn()}
      onSubmitGeneralComment={vi.fn()}
      onSubmitReview={vi.fn()}
      onUpdateComment={vi.fn()}
      onUpdateGeneralComment={vi.fn()}
      state={{
        ...state,
        reviewComments: [
          {
            author: {
              avatarUrl: 'https://gitlab.cfdata.org/uploads/claude.png',
              login: 'gsa_claude',
            },
            body: 'Please keep this explicit.',
            canResolveThread: true,
            filePath: 'src/app.ts',
            id: 'gitlab:11646762',
            lineNumber: 1,
            side: 'additions',
            threadId: 'discussion-1',
          },
        ],
      }}
      title="Review in Codiff"
      walkthrough={null}
      walkthroughStatus="idle"
    />,
  );

  try {
    await waitFor(() => {
      const resolve = Array.from(
        view.container.querySelectorAll<HTMLButtonElement>('.review-comment-thread-footer button'),
      ).find((button) => button.textContent === 'Resolve');
      expect(resolve).not.toBeNull();
    });

    expect(
      Array.from(
        view.container.querySelectorAll<HTMLButtonElement>('.review-comment-thread-footer button'),
      ).some((button) => button.textContent === 'Resolve'),
    ).toBe(true);

    const reply = Array.from(
      view.container.querySelectorAll<HTMLButtonElement>('.review-comment-thread-footer button'),
    ).find((button) => button.textContent === 'Reply');
    expect(reply).not.toBeNull();

    await act(async () => reply?.click());
    expect(
      Array.from(view.container.querySelectorAll<HTMLButtonElement>('button')).some(
        (button) => button.textContent === 'Ask',
      ),
    ).toBe(false);
    expect(
      Array.from(view.container.querySelectorAll<HTMLButtonElement>('button')).some(
        (button) => button.textContent === 'Comment',
      ),
    ).toBe(true);

    const resolveAfterReply = Array.from(
      view.container.querySelectorAll<HTMLButtonElement>('.review-comment-thread-footer button'),
    ).find((button) => button.textContent === 'Resolve');
    await act(async () => resolveAfterReply?.click());
    expect(onResolveDiscussion).toHaveBeenCalledWith('discussion-1', true);
  } finally {
    await view.cleanup();
  }
});

test('merge request reviews expose close action when provider allows it', async () => {
  const onClosePullRequest = vi.fn(async () => {});
  const view = await renderReact(
    <MergeRequestReviewApp
      externalUrl={state.source.url}
      onClosePullRequest={onClosePullRequest}
      onGenerateWalkthrough={vi.fn()}
      onHome={vi.fn()}
      onSubmitComment={vi.fn()}
      onSubmitGeneralComment={vi.fn()}
      onSubmitReview={vi.fn(async () => {})}
      onUpdateComment={vi.fn()}
      onUpdateGeneralComment={vi.fn()}
      state={{
        ...state,
        source: {
          ...state.source,
          reviewStatus: {
            approve: {
              disabled: true,
              reason: 'You cannot review your own merge request.',
            },
            close: {
              reason: 'Close merge request',
            },
            requestChanges: {
              disabled: true,
              reason: 'You cannot review your own merge request.',
            },
          },
        },
      }}
      title="Review in Codiff"
      walkthrough={null}
      walkthroughStatus="idle"
    />,
  );

  try {
    expect(view.container.querySelector('[aria-label="Approve review"]')).toBeNull();
    expect(view.container.querySelector('[aria-label="Request changes"]')).toBeNull();
    const close = view.container.querySelector<HTMLButtonElement>(
      '[aria-label="Close merge request"]',
    );
    expect(close?.closest('.codiff-source-description-header')).not.toBeNull();
    expect(close?.classList.contains('codiff-open-button')).toBe(true);
    await act(async () => close?.click());
    expect(onClosePullRequest).toHaveBeenCalledOnce();
  } finally {
    await view.cleanup();
  }
});

test('merge request reviews disable provider-blocked review actions', async () => {
  const onSubmitReview = vi.fn(async () => {});
  const view = await renderReact(
    <MergeRequestReviewApp
      externalUrl={state.source.url}
      onGenerateWalkthrough={vi.fn()}
      onHome={vi.fn()}
      onSubmitComment={vi.fn()}
      onSubmitGeneralComment={vi.fn()}
      onSubmitReview={onSubmitReview}
      onUpdateComment={vi.fn()}
      onUpdateGeneralComment={vi.fn()}
      state={{
        ...state,
        source: {
          ...state.source,
          reviewStatus: {
            approve: {
              disabled: true,
              reason: 'You have already approved this merge request.',
            },
          },
        },
      }}
      title="Review in Codiff"
      walkthrough={null}
      walkthroughStatus="idle"
    />,
  );

  try {
    const approve = view.container.querySelector<HTMLButtonElement>(
      '[aria-label="Approve review"]',
    );
    const requestChanges = view.container.querySelector<HTMLButtonElement>(
      '[aria-label="Request changes"]',
    );
    expect(approve).toBeNull();
    expect(requestChanges?.disabled).toBe(false);

    await act(async () => approve?.click());
    expect(onSubmitReview).not.toHaveBeenCalled();

    await act(async () => requestChanges?.click());
    expect(onSubmitReview).toHaveBeenCalledWith('REQUEST_CHANGES', []);
  } finally {
    await view.cleanup();
  }
});

test('merge request reviews hide actions when all provider review actions are blocked', async () => {
  const view = await renderReact(
    <MergeRequestReviewApp
      externalUrl={state.source.url}
      onGenerateWalkthrough={vi.fn()}
      onHome={vi.fn()}
      onSubmitComment={vi.fn()}
      onSubmitGeneralComment={vi.fn()}
      onSubmitReview={vi.fn(async () => {})}
      onUpdateComment={vi.fn()}
      onUpdateGeneralComment={vi.fn()}
      state={{
        ...state,
        source: {
          ...state.source,
          reviewStatus: {
            approve: {
              disabled: true,
              reason: 'You cannot review your own merge request.',
            },
            requestChanges: {
              disabled: true,
              reason: 'You cannot review your own merge request.',
            },
          },
        },
      }}
      title="Review in Codiff"
      walkthrough={null}
      walkthroughStatus="idle"
    />,
  );

  try {
    expect(
      view.container.querySelector<HTMLButtonElement>('[aria-label="Approve review"]'),
    ).toBeNull();
    expect(
      view.container.querySelector<HTMLButtonElement>('[aria-label="Request changes"]'),
    ).toBeNull();
  } finally {
    await view.cleanup();
  }
});

test('merge request walkthrough retry renders pending state before generation resolves', async () => {
  let resolveGeneration!: () => void;
  const onGenerateWalkthrough = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        resolveGeneration = resolve;
      }),
  );
  const view = await renderReact(
    <MergeRequestReviewApp
      externalUrl={state.source.url}
      onGenerateWalkthrough={onGenerateWalkthrough}
      onHome={vi.fn()}
      onSubmitComment={vi.fn()}
      onSubmitGeneralComment={vi.fn()}
      onSubmitReview={vi.fn(async () => {})}
      onUpdateComment={vi.fn()}
      onUpdateGeneralComment={vi.fn()}
      state={state}
      title="Review in Codiff"
      walkthrough={null}
      walkthroughError="Think completed without a valid Codiff walkthrough object."
      walkthroughStatus="failed"
    />,
  );

  try {
    const tabs = view.container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    await act(async () => tabs[1]?.click());

    expect(view.container.textContent).toContain('Walkthrough unavailable');
    await act(async () =>
      view.container.querySelector<HTMLButtonElement>('.empty-panel-actions button')?.click(),
    );

    expect(view.container.textContent).toContain('Generating walkthrough');
    expect(onGenerateWalkthrough).toHaveBeenCalledOnce();

    await act(async () => resolveGeneration());
  } finally {
    await view.cleanup();
  }
});

test('merge request reviews reconcile refreshed GitLab comments', async () => {
  const props = {
    externalUrl: state.source.url,
    onGenerateWalkthrough: vi.fn(),
    onHome: vi.fn(),
    onSubmitComment: vi.fn(),
    onSubmitGeneralComment: vi.fn(),
    onSubmitReview: vi.fn(async () => {}),
    onUpdateComment: vi.fn(),
    onUpdateGeneralComment: vi.fn(),
    title: 'Review in Codiff',
    walkthrough: null,
    walkthroughStatus: 'idle' as const,
  };
  const view = await renderReact(<MergeRequestReviewApp {...props} state={state} />);

  try {
    expect(view.container.textContent).not.toContain('Synced from GitLab');

    await view.rerender(
      <MergeRequestReviewApp
        {...props}
        state={{
          ...state,
          reviewComments: [
            {
              author: { login: 'ada' },
              body: 'Synced from GitLab',
              filePath: 'src/app.ts',
              id: 'gitlab:99',
              lineNumber: 1,
              side: 'additions',
            },
          ],
        }}
      />,
    );

    await waitFor(() => {
      expect(view.container.textContent).toContain('Synced from GitLab');
    });
  } finally {
    await view.cleanup();
  }
});

test('merge request comments tab shows the merge request description header', async () => {
  const view = await renderReact(
    <MergeRequestReviewApp
      externalUrl={state.source.url}
      onGenerateWalkthrough={vi.fn()}
      onHome={vi.fn()}
      onSubmitComment={vi.fn()}
      onSubmitGeneralComment={vi.fn()}
      onSubmitReview={vi.fn(async () => {})}
      onUpdateComment={vi.fn()}
      onUpdateGeneralComment={vi.fn()}
      state={state}
      title="Review in Codiff"
      walkthrough={null}
      walkthroughStatus="idle"
    />,
  );

  try {
    const tabs = view.container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    await act(async () => tabs[2]?.click());

    const descriptionPanel = view.container.querySelector(
      '.merge-request-comments-view .codiff-source-description-panel',
    );
    expect(descriptionPanel).not.toBeNull();
    expect(descriptionPanel?.querySelector('.codiff-file-header')).not.toBeNull();
    expect(descriptionPanel?.textContent).toContain('Review in Codiff');
    expect(descriptionPanel?.textContent).toContain('This explains the merge request.');
  } finally {
    await view.cleanup();
  }
});

test('merge request walkthrough shows the merge request description before the first section', async () => {
  const originalScrollBy = HTMLElement.prototype.scrollBy;
  HTMLElement.prototype.scrollBy = vi.fn() as typeof HTMLElement.prototype.scrollBy;
  const view = await renderReact(
    <MergeRequestReviewApp
      externalUrl={state.source.url}
      onGenerateWalkthrough={vi.fn()}
      onHome={vi.fn()}
      onSubmitComment={vi.fn()}
      onSubmitGeneralComment={vi.fn()}
      onSubmitReview={vi.fn(async () => {})}
      onUpdateComment={vi.fn()}
      onUpdateGeneralComment={vi.fn()}
      state={state}
      title="Review in Codiff"
      walkthrough={walkthrough}
      walkthroughStatus="ready"
    />,
  );

  try {
    const tabs = view.container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    await act(async () => tabs[1]?.click());

    await waitFor(() => {
      const surface = view.container.querySelector('.wt-diff-surface');
      const descriptionPanel = surface?.querySelector('.codiff-source-description-item');
      expect(descriptionPanel).not.toBeNull();
      expect(descriptionPanel?.querySelector('.codiff-file-header')).not.toBeNull();
      expect(surface?.textContent?.indexOf('Review in Codiff')).toBeLessThan(
        surface?.textContent?.indexOf('Intro') ?? -1,
      );
    });
  } finally {
    HTMLElement.prototype.scrollBy = originalScrollBy;
    await view.cleanup();
  }
});

test('merge request comments tab renders comment navigation entries', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-29T01:00:00.000Z'));
  const scrollIntoView = vi.fn();
  const scrollToCalls: Array<{ element: HTMLElement; options: ScrollToOptions }> = [];
  const scrollTo = vi.fn(function scrollTo(this: HTMLElement, options: ScrollToOptions) {
    scrollToCalls.push({ element: this, options });
  });
  const onUpdateGeneralComment = vi.fn(async () => {});
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
  const originalScrollTo = HTMLElement.prototype.scrollTo;
  HTMLElement.prototype.scrollIntoView = scrollIntoView;
  HTMLElement.prototype.scrollTo = scrollTo as typeof HTMLElement.prototype.scrollTo;
  const view = await renderReact(
    <MergeRequestReviewApp
      externalUrl={state.source.url}
      gitIdentity={{ email: 'ada@example.com', name: 'Ada Lovelace' }}
      onGenerateWalkthrough={vi.fn()}
      onHome={vi.fn()}
      onSubmitComment={vi.fn()}
      onSubmitGeneralComment={vi.fn()}
      onSubmitReview={vi.fn(async () => {})}
      onUpdateComment={vi.fn()}
      onUpdateGeneralComment={onUpdateGeneralComment}
      state={{
        ...state,
        generalComments: [
          {
            comments: [
              {
                author: { login: 'grace' },
                body: '<details>\n<summary>AI Code Reviewer details</summary>\n\n\nCan we keep this behavior documented?\n\n\n</details>',
                id: 'gitlab:100',
                submittedAt: '2026-06-26T01:00:00.000Z',
              },
              {
                author: { login: 'ada', name: 'Ada Lovelace' },
                body: 'Follow-up: this still needs a migration note.\n\n\nPlease keep the rollout note too.',
                canEdit: true,
                id: 'gitlab:101',
                submittedAt: '2026-06-28T01:00:00.000Z',
              },
            ],
            id: 'general-discussion',
          },
        ],
      }}
      title="Review in Codiff"
      walkthrough={null}
      walkthroughStatus="idle"
    />,
  );

  try {
    const commentsTab = view.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Comments (2)"]',
    );
    expect(commentsTab?.textContent).toBe('Comments2');
    expect(commentsTab?.querySelector('.sidebar-tab-count')?.textContent).toBe('2');
    await act(async () => commentsTab?.click());
    const commentEntries =
      view.container.querySelectorAll<HTMLButtonElement>('.sidebar-comment-entry');
    expect(commentEntries).toHaveLength(2);
    expect(view.container.querySelector('.sidebar-comment-list')?.textContent).not.toContain(
      'MR comments',
    );
    expect(commentEntries[0]?.textContent).toContain('AI Code Reviewer details');
    expect(commentEntries[1]?.textContent).toContain('Follow-up');
    expect(
      view.container.querySelector(
        '.general-comment-composer .general-comment-composer-header .review-comment-action',
      )?.textContent,
    ).toBe('Comment');
    expect(view.container.querySelector('.general-comment-composer-actions')).toBeNull();
    const commentTime = view.container.querySelector<HTMLTimeElement>(
      '.general-comment-header time',
    );
    expect(commentTime?.dateTime).toBe('2026-06-26T01:00:00.000Z');
    expect(commentTime?.textContent).toBe('3 days ago');
    const details = view.container.querySelector<HTMLDetailsElement>(
      '.merge-request-comments-view details',
    );
    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);
    expect(details?.querySelector('summary')?.textContent).toBe('AI Code Reviewer details');
    expect(
      [
        ...view.container.querySelectorAll<HTMLElement>(
          '.merge-request-comments-view [data-mdx-comment-block-type="paragraph"]',
        ),
      ].some((paragraph) => !paragraph.textContent?.trim() && paragraph.querySelector('br')),
    ).toBe(false);
    const editButtons = view.container.querySelectorAll<HTMLButtonElement>(
      '.general-comment-card .review-comment-action',
    );
    expect([...editButtons].filter((button) => button.textContent === 'Edit')).toHaveLength(1);
    await act(async () => editButtons[0]?.click());
    const save = [
      ...view.container.querySelectorAll<HTMLButtonElement>('.review-comment-action'),
    ].find((button) => button.textContent === 'Save');
    expect(save).not.toBeNull();
    await act(async () => save?.click());
    expect(onUpdateGeneralComment).toHaveBeenCalledWith(
      'gitlab:101',
      'Follow-up: this still needs a migration note.\n\n\nPlease keep the rollout note too.',
    );

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }));
    });
    expect(commentEntries[0]?.getAttribute('aria-current')).toBe('true');
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }));
    });
    expect(commentEntries[1]?.getAttribute('aria-current')).toBe('true');
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }));
    });
    expect(commentEntries[0]?.getAttribute('aria-current')).toBe('true');

    await act(async () => commentEntries[1]?.click());
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(scrollTo).toHaveBeenCalled();
    expect(scrollToCalls.at(-1)?.element).toBe(
      view.container.querySelector('.merge-request-comments-view'),
    );
    expect(scrollToCalls.at(-1)?.options).toMatchObject({ behavior: 'smooth' });
    expect(commentEntries[1]?.getAttribute('aria-current')).toBe('true');
    expect(document.getElementById('general-comment:gitlab:101')?.className).toContain('focused');
  } finally {
    await view.cleanup();
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    HTMLElement.prototype.scrollTo = originalScrollTo;
    vi.useRealTimers();
  }
});
