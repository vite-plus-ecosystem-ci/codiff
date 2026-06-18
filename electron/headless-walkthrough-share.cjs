// @ts-check

const { readFileSync } = require('node:fs');
const { userInfo } = require('node:os');
const { readConfig } = require('./config.cjs');
const { createCloudflareAccessClient } = require('./cloudflare-access.cjs');
const { readGitIdentity, readRepositoryState } = require('./git-state.cjs');
const { normalizeNarrativeWalkthrough } = require('./narrative-walkthrough.cjs');
const { uploadSharedWalkthrough } = require('./shared-walkthrough-upload.cjs');
const { resolveWalkthroughShareTarget } = require('./walkthrough-sharing.cjs');

/**
 * @typedef {import('../core/types.ts').ReviewSource} ReviewSource
 */

/**
 * @param {{
 *   agent?: 'claude' | 'codex' | 'pi';
 *   codiffVersion: string;
 *   openExternal: (url: string) => Promise<void>;
 *   repositoryPath: string;
 *   serviceUrlOverride?: string;
 *   source?: ReviewSource;
 *   walkthroughFile: string;
 * }} options
 */
const shareWalkthroughFile = async ({
  agent,
  codiffVersion,
  openExternal,
  repositoryPath,
  serviceUrlOverride,
  source = { type: 'working-tree' },
  walkthroughFile,
}) => {
  const config = readConfig();
  const [state, uploader] = await Promise.all([
    readRepositoryState(repositoryPath, source, {
      showWhitespace: config.settings.showWhitespace,
    }),
    readGitIdentity(repositoryPath),
  ]);

  let input;
  try {
    input = JSON.parse(readFileSync(walkthroughFile, 'utf8'));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read walkthrough file: ${detail}`);
  }

  const walkthrough = normalizeNarrativeWalkthrough(input, state.files, {
    agent,
    branch: state.branch,
    generatedAt: state.generatedAt,
    root: state.root,
    source: state.source,
  });

  let username = '';
  try {
    username = userInfo().username;
  } catch {}

  const target = resolveWalkthroughShareTarget({
    email: uploader.email,
    overrideUrl: serviceUrlOverride,
    username,
  });
  if (!target) {
    throw new Error('Walkthrough sharing is not available for this user.');
  }

  const accessClient = target.authenticated
    ? createCloudflareAccessClient({ serviceUrl: target.serviceUrl })
    : null;

  try {
    return await uploadSharedWalkthrough({
      authenticate: accessClient?.authenticate,
      fetchImpl: accessClient?.fetch,
      openClaimPage: false,
      openExternal,
      serviceUrl: target.serviceUrl,
      snapshot: {
        branch: state.branch,
        codiffVersion,
        exportedAt: new Date().toISOString(),
        files: state.files,
        kind: 'codiff-walkthrough-share',
        preferences: {
          codeFontFamily: config.settings.codeFontFamily,
          codeFontSize: config.settings.codeFontSize,
          diffStyle: config.settings.diffStyle,
          showWhitespace: config.settings.showWhitespace,
          theme: config.settings.theme,
          wordWrap: config.settings.wordWrap,
        },
        repository: {
          root: state.root,
          source: state.source,
        },
        reviewComments: state.reviewComments,
        version: 1,
        walkthrough,
      },
      uploader: target.internal ? uploader : undefined,
    });
  } finally {
    accessClient?.clear();
  }
};

module.exports = {
  shareWalkthroughFile,
};
