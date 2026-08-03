import edition from './edition.js';

const PHASE = 'phase-0-skeleton';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

function buildStatus() {
  return {
    ok: true,
    edition_id: edition.editionId,
    phase: PHASE,
    content_version: edition.contentVersion
  };
}

export default {
  async fetch(request) {
    const { pathname } = new URL(request.url);

    if (request.method === 'GET' && (pathname === '/health' || pathname === '/api/version')) {
      return jsonResponse(buildStatus());
    }

    return jsonResponse({ ok: false, error: 'not_found' }, 404);
  }
};
