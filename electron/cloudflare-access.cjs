// @ts-check

const { spawn } = require('node:child_process');
const { homedir } = require('node:os');
const { join } = require('node:path');
const { findExecutableOnPath, isExecutableFile } = require('./agent-shared.cjs');

const CLOUDFLARED_NOT_FOUND_CODE = 'CLOUDFLARED_NOT_FOUND';
const CLOUDFLARED_NOT_FOUND_MESSAGE =
  'Cloudflare Access requires cloudflared. Install cloudflared and verify `cloudflared --version` works in Terminal. Codiff searches PATH, ~/.local/bin/cloudflared, /opt/homebrew/bin/cloudflared, and /usr/local/bin/cloudflared. If cloudflared is installed somewhere else, launch Codiff with `CODIFF_CLOUDFLARED_PATH=/absolute/path/to/cloudflared codiff -w`.';
const COMMAND_TIMEOUT_MS = 5 * 60 * 1000;

/** @param {string} [detail] */
const createCloudflaredNotFoundError = (detail) =>
  Object.assign(
    new Error(
      detail ? `${CLOUDFLARED_NOT_FOUND_MESSAGE} ${detail}` : CLOUDFLARED_NOT_FOUND_MESSAGE,
    ),
    { code: CLOUDFLARED_NOT_FOUND_CODE },
  );

const getCloudflaredCommand = () => {
  const configuredPath = process.env.CODIFF_CLOUDFLARED_PATH?.trim();
  if (configuredPath) {
    if (isExecutableFile(configuredPath)) {
      return configuredPath;
    }

    throw createCloudflaredNotFoundError(
      `CODIFF_CLOUDFLARED_PATH is set to ${JSON.stringify(configuredPath)}, but that file is not executable.`,
    );
  }

  const pathCommand = findExecutableOnPath('cloudflared');
  if (pathCommand) {
    return pathCommand;
  }

  for (const path of [
    join(homedir(), '.local/bin/cloudflared'),
    '/opt/homebrew/bin/cloudflared',
    '/usr/local/bin/cloudflared',
  ]) {
    if (isExecutableFile(path)) {
      return path;
    }
  }

  throw createCloudflaredNotFoundError();
};

/**
 * @param {Array<string>} args
 * @param {{timeoutMs?: number}} [options]
 */
const runCloudflared = (args, { timeoutMs = COMMAND_TIMEOUT_MS } = {}) =>
  new Promise((resolve, reject) => {
    let command;
    try {
      command = getCloudflaredCommand();
    } catch (error) {
      reject(error);
      return;
    }

    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timeout = setTimeout(() => {
      child.kill();
      settle(new Error('Cloudflare Access sign-in timed out.'));
    }, timeoutMs);

    /** @param {Error | null} error */
    const settle = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      if (error) {
        reject(error);
      } else {
        resolve(stdout.trim());
      }
    };

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', (error) => {
      settle(
        /** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT'
          ? createCloudflaredNotFoundError()
          : error,
      );
    });
    child.once('close', (code) => {
      if (code === 0) {
        settle(null);
        return;
      }

      const error = new Error('Cloudflare Access authentication failed.');
      Object.assign(error, { code: 'CLOUDFLARED_FAILED', detail: stderr.trim() });
      settle(error);
    });
  });

/** @param {unknown} error */
const isCloudflaredNotFoundError = (error) =>
  Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error.code === CLOUDFLARED_NOT_FOUND_CODE || error.code === 'ENOENT'),
  );

/**
 * @param {{
 *   fetchImpl?: typeof fetch;
 *   runCommand?: typeof runCloudflared;
 *   serviceUrl: string;
 * }} options
 */
const createCloudflareAccessClient = ({
  fetchImpl = fetch,
  runCommand = runCloudflared,
  serviceUrl,
}) => {
  const baseUrl = serviceUrl.replace(/\/+$/, '');
  const serviceOrigin = new URL(baseUrl).origin;
  /** @type {Promise<void> | null} */
  let authentication = null;
  let token = '';

  const readToken = async () => {
    const result = await runCommand(['access', 'token', baseUrl], { timeoutMs: 30_000 });
    if (!result.trim()) {
      throw new Error('Cloudflare Access did not return an authentication token.');
    }
    return result.trim();
  };

  const authenticate = async () => {
    if (token) {
      return;
    }
    if (authentication) {
      return authentication;
    }

    authentication = (async () => {
      try {
        token = await readToken();
        return;
      } catch (error) {
        if (isCloudflaredNotFoundError(error)) {
          throw error;
        }
      }

      try {
        await runCommand(['access', 'login', '--quiet', '--auto-close', baseUrl]);
        token = await readToken();
      } catch (error) {
        if (isCloudflaredNotFoundError(error)) {
          throw error;
        }
        throw new Error(
          'Cloudflare Access sign-in did not complete. Finish signing in in your browser, then try sharing again.',
        );
      }
    })().finally(() => {
      authentication = null;
    });

    return authentication;
  };

  /** @type {typeof fetch} */
  const authenticatedFetch = async (input, init) => {
    if (!token) {
      throw new Error('Cloudflare Access authentication is required before sharing.');
    }

    const requestUrl = new URL(
      typeof input === 'string' || input instanceof URL ? input : input.url,
    );
    if (requestUrl.origin !== serviceOrigin) {
      throw new Error('Cloudflare Access refused to send credentials to another origin.');
    }

    const headers = new Headers(
      init?.headers ||
        (typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined),
    );
    headers.set('cf-access-token', token);
    return fetchImpl(input, { ...init, headers });
  };

  return {
    authenticate,
    clear: () => {
      token = '';
    },
    fetch: authenticatedFetch,
  };
};

module.exports = {
  createCloudflareAccessClient,
  getCloudflaredCommand,
  runCloudflared,
};
