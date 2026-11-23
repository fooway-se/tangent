const ISSUE_STATUSES = new Set(['doing', 'testing']);

export class TangentApiError extends Error {
  constructor(message, status, code = 'api_error') {
    super(message);
    this.name = 'TangentApiError';
    this.status = status;
    this.code = code;
  }
}

function validateConfig({ baseUrl, token, workspaceId, fetchImpl = globalThis.fetch }) {
  if (typeof baseUrl !== 'string' || baseUrl.trim() === '') {
    throw new TypeError('TANGENT_URL is required.');
  }
  let parsedBase;
  try {
    parsedBase = new URL(baseUrl);
  } catch {
    throw new TypeError('TANGENT_URL must be a valid http or https URL.');
  }
  if (!['http:', 'https:'].includes(parsedBase.protocol)) {
    throw new TypeError('TANGENT_URL must use http or https.');
  }
  if (parsedBase.username !== '' || parsedBase.password !== '') {
    throw new TypeError('TANGENT_URL must not contain credentials.');
  }
  if (parsedBase.search !== '' || parsedBase.hash !== '') {
    throw new TypeError('TANGENT_URL must not contain a query or fragment.');
  }
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
    throw new TypeError('TANGENT_AGENT_TOKEN must be a 64-character lowercase hexadecimal token.');
  }
  if (workspaceId !== undefined && (!Number.isSafeInteger(workspaceId) || workspaceId <= 0)) {
    throw new TypeError('TANGENT_WORKSPACE_ID must be a positive integer.');
  }
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('This Node.js runtime must provide fetch.');
  }

  const installPath = parsedBase.pathname.replace(/\/+$/, '');
  const apiBase = new URL(`${installPath}/api/v1/`, parsedBase.origin);
  return { token, workspaceId, fetchImpl, apiBase };
}

export function validateTangentClientConfig(config) {
  validateConfig(config);
}

export function createTangentClient(config) {
  const { token, workspaceId, fetchImpl, apiBase } = validateConfig(config);

  async function request(method, route, body) {
    const headers = new Headers({
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    });
    if (workspaceId !== undefined) headers.set('X-Tangent-Workspace', String(workspaceId));
    const init = { method, headers, cache: 'no-store' };
    if (body !== undefined) {
      headers.set('Content-Type', 'application/json');
      init.body = JSON.stringify(body);
    }

    const response = await fetchImpl(new URL(route, apiBase), init);
    if (response.status === 204) return undefined;

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new TangentApiError(`Tangent returned an unreadable response (${response.status}).`, response.status);
    }
    if (!response.ok) {
      const error = payload?.error;
      const message = typeof error?.message === 'string' ? error.message : `Tangent request failed (${response.status}).`;
      const code = typeof error?.code === 'string' ? error.code : 'api_error';
      throw new TangentApiError(message, response.status, code);
    }
    return payload;
  }

  return {
    async listProjects() {
      return request('GET', 'agent/projects');
    },
    async listIssues(projectId) {
      return request('GET', `agent/projects/${positiveId(projectId, 'project_id')}/issues`);
    },
    async getIssue(issueId) {
      return request('GET', `agent/issues/${positiveId(issueId, 'issue_id')}`);
    },
    async addComment(issueId, body) {
      const id = positiveId(issueId, 'issue_id');
      if (typeof body !== 'string' || body.trim() === '' || [...body].length > 10_000) {
        throw new TypeError('body must contain between 1 and 10000 characters.');
      }
      return request('POST', `agent/issues/${id}/discussion`, { body });
    },
    async updateStatus(issueId, status) {
      const id = positiveId(issueId, 'issue_id');
      if (!ISSUE_STATUSES.has(status)) {
        throw new TypeError('status must be doing or testing.');
      }
      return request('PATCH', `agent/issues/${id}/status`, { status });
    },
  };
}

function positiveId(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer.`);
  }
  return value;
}
