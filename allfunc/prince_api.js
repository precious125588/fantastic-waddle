/**
 * PRINCE API HELPER
 * Base: https://api.princetechn.com
 * Key:  prince
 * All endpoints wired here — import and use princeGet() / princePost()
 */

const axios = require('axios');

const BASE = 'https://api.princetechn.com';
const KEY  = 'prince';
const TIMEOUT = 25000;

/**
 * GET wrapper — adds apikey automatically
 * @param {string} endpoint  e.g. '/api/fun/jokes'
 * @param {object} params    extra query params
 */
async function princeGet(endpoint, params = {}) {
  try {
    const res = await axios.get(`${BASE}${endpoint}`, {
      params: { apikey: KEY, ...params },
      timeout: TIMEOUT,
      responseType: 'json',
    });
    return { ok: true, data: res.data };
  } catch (e) {
    return { ok: false, error: e.message, data: null };
  }
}

/**
 * GET wrapper that returns the result field directly (or null on failure)
 */
async function princeResult(endpoint, params = {}) {
  const r = await princeGet(endpoint, params);
  if (!r.ok || !r.data?.success) return null;
  return r.data.result ?? r.data.results ?? null;
}

/**
 * Convenience: fetch a random fun/text result (string)
 */
async function princeFun(category) {
  const r = await princeGet(`/api/fun/${category}`);
  if (!r.ok || !r.data?.success) return null;
  const res = r.data.result;
  if (typeof res === 'string') return res;
  if (res?.text)      return res.text;
  if (res?.message)   return res.message;
  if (res?.quote)     return res.quote;
  if (res?.advice)    return res.advice;
  if (res?.setup)     return `${res.setup}\n\n_${res.punchline || ''}_`;
  if (res?.joke)      return res.joke;
  if (res?.punchline) return res.punchline;
  if (Array.isArray(res)) return res[0]?.text || JSON.stringify(res[0]);
  return JSON.stringify(res).slice(0, 300);
}

module.exports = { princeGet, princeResult, princeFun, BASE, KEY };
