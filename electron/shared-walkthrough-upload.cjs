// @ts-check

const poll = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** @param {unknown} error */
const describeFetchError = (error) => {
  const message = error instanceof Error ? error.message : String(error);
  const cause =
    error && typeof error === 'object' && 'cause' in error && error.cause ? error.cause : null;
  if (!cause || typeof cause !== 'object') {
    return message;
  }

  const causeCode = 'code' in cause && typeof cause.code === 'string' ? cause.code : '';
  const causeMessage = cause instanceof Error ? cause.message : String(cause);
  const causeDetail = [causeCode, causeMessage].filter(
    (detail, index, details) => detail && details.indexOf(detail) === index,
  );
  return causeDetail.length > 0 ? `${message}: ${causeDetail.join(' - ')}` : message;
};

/**
 * @param {{
 *   authenticate?: () => Promise<void>;
 *   fetchImpl?: typeof fetch;
 *   openClaimPage?: boolean;
 *   openExternal: (url: string) => Promise<void>;
 *   serviceUrl: string;
 *   snapshot: unknown;
 *   uploader?: {email?: string; name?: string};
 * }} options
 */
const uploadSharedWalkthrough = async ({
  authenticate = async () => {},
  fetchImpl = fetch,
  openClaimPage = true,
  openExternal,
  serviceUrl,
  snapshot,
  uploader,
}) => {
  const baseUrl = serviceUrl.replace(/\/+$/, '');
  await authenticate();

  /** @type {(phase: string, input: string, init?: RequestInit) => Promise<Response>} */
  const fetchShareService = async (phase, input, init) => {
    try {
      return await fetchImpl(input, init);
    } catch (error) {
      throw new Error(`Codiff share ${phase} failed: ${describeFetchError(error)}`, {
        cause: error,
      });
    }
  };

  const intentResponse = await fetchShareService(
    'upload intent request',
    `${baseUrl}/api/upload-intents`,
    {
      credentials: 'include',
      method: 'POST',
    },
  );
  if (!intentResponse.ok) {
    throw new Error(`Codiff share service rejected upload intent (${intentResponse.status}).`);
  }

  /** @type {{claimUrl: string; code: string; pollUrl: string; secret: string; status?: string}} */
  const intent = await intentResponse.json();
  const immediateUploadToken =
    intent.status === 'claimed' && typeof intent.secret === 'string' ? intent.secret : null;
  if (openClaimPage || !immediateUploadToken) {
    await openExternal(intent.claimUrl);
  }

  let uploadToken = immediateUploadToken;
  for (let attempt = 0; attempt < 120 && !uploadToken; attempt += 1) {
    const pollResponse = await fetchShareService('authorization poll', intent.pollUrl, {
      credentials: 'include',
    });
    if (pollResponse.ok) {
      const result = await pollResponse.json();
      if (result.status === 'claimed' && typeof result.uploadToken === 'string') {
        uploadToken = result.uploadToken;
        break;
      }
    } else if (pollResponse.status === 410) {
      throw new Error('Codiff share link expired before it was authorized.');
    }
    await poll(1000);
  }

  if (!uploadToken) {
    throw new Error('Codiff share upload was not authorized in time.');
  }

  const uploadResponse = await fetchShareService('upload request', `${baseUrl}/api/uploads`, {
    body: JSON.stringify(uploader ? { snapshot, uploader } : snapshot),
    credentials: 'include',
    headers: {
      authorization: `Bearer ${uploadToken}`,
      'content-type': 'application/json',
      'x-codiff-upload-code': intent.code,
    },
    method: 'POST',
  });
  const result = await uploadResponse.json().catch(() => null);
  if (!uploadResponse.ok || result?.status !== 'uploaded' || typeof result.url !== 'string') {
    throw new Error(result?.error || `Codiff share upload failed (${uploadResponse.status}).`);
  }

  return result.url;
};

module.exports = {
  uploadSharedWalkthrough,
};
