'use strict';

const axios = require('axios');

const BW_BASE = 'https://api.brandwatch.com';

// In-memory token store
let _token = null;
let _tokenExpiresAt = 0;

// In-memory cache: cacheKey → { data, expiresAt }
const _cache = {};
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getAccessToken() {
  const now = Date.now();
  if (_token && now < _tokenExpiresAt - 30000) {
    return _token;
  }

  const params = new URLSearchParams({
    grant_type: 'api-password',
    client_id: process.env.BW_CLIENT_ID,
    username: process.env.BW_USERNAME,
    password: process.env.BW_PASSWORD,
  });

  const res = await axios.post(
    `${BW_BASE}/oauth/token`,
    params.toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  _token = res.data.access_token;
  // expires_in is in seconds; Brandwatch tokens typically last 12h
  _tokenExpiresAt = now + (res.data.expires_in || 43200) * 1000;
  return _token;
}

async function bwGet(path, params = {}) {
  const cacheKey = path + JSON.stringify(params);
  const now = Date.now();

  if (_cache[cacheKey] && now < _cache[cacheKey].expiresAt) {
    return _cache[cacheKey].data;
  }

  const token = await getAccessToken();
  const res = await axios.get(`${BW_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    params,
  });

  _cache[cacheKey] = { data: res.data, expiresAt: now + CACHE_TTL_MS };
  return res.data;
}

function dateWindow(daysBack = 7) {
  const end = new Date();
  const start = new Date(end.getTime() - daysBack * 86400 * 1000);
  return {
    startDate: start.toISOString().slice(0, 19),
    endDate: end.toISOString().slice(0, 19),
  };
}

async function fetchMentions(queryId, daysBack = 7, pageSize = 100) {
  const projectId = process.env.BW_PROJECT_ID;
  const { startDate, endDate } = dateWindow(daysBack);
  const data = await bwGet(`/projects/${projectId}/data/mentions`, {
    queryId,
    startDate,
    endDate,
    pageSize,
    page: 0,
    orderBy: 'date',
    orderDirection: 'desc',
  });
  return data.results || [];
}

async function fetchSentimentVolume(queryIds, daysBack = 7) {
  const projectId = process.env.BW_PROJECT_ID;
  const { startDate, endDate } = dateWindow(daysBack);
  const data = await bwGet(`/projects/${projectId}/data/volume/queries/compare`, {
    queryId: queryIds,
    startDate,
    endDate,
    groupBy: 'sentiment',
  });
  return data.results || [];
}

async function getProjectQueries() {
  const projectId = process.env.BW_PROJECT_ID;
  const data = await bwGet(`/projects/${projectId}/queries`);
  return data.results || [];
}

module.exports = { fetchMentions, fetchSentimentVolume, getProjectQueries, bwGet };
