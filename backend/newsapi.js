'use strict';

const axios = require('axios');

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

let _cache = null;
let _cacheExpiry = 0;

const QUERY = 'Milano (rapina OR furto OR omicidio OR spaccio OR arrestato OR aggressione OR scippo OR truffa OR ndrangheta OR vandalismo)';

function guessCrimeType(text) {
  const t = (text || '').toLowerCase();
  if (t.includes('furto') || t.includes('ladro')) return 'furto';
  if (t.includes('rapina')) return 'rapina';
  if (t.includes('spaccio') || t.includes('droga')) return 'spaccio';
  if (t.includes('truffa') || t.includes('frode')) return 'truffa';
  if (t.includes('omicidio') || t.includes('ucciso') || t.includes('accoltellato')) return 'omicidio';
  if (t.includes('scippo') || t.includes('borseggio')) return 'borseggio';
  if (t.includes('ndrangheta') || t.includes('mafia') || t.includes('camorra')) return 'mafia';
  if (t.includes('vandalismo') || t.includes('incendio')) return 'vandalismo';
  if (t.includes('violenza sessuale') || t.includes('stupro')) return 'sessuale';
  return 'violenza';
}

async function fetchNewsApiCrimes() {
  if (!process.env.NEWSAPI_KEY) return [];

  const now = Date.now();
  if (_cache && now < _cacheExpiry) return _cache;

  const from = new Date(now - 7 * 86400 * 1000).toISOString().slice(0, 10);

  const res = await axios.get('https://newsapi.org/v2/everything', {
    params: {
      q: QUERY,
      language: 'it',
      sortBy: 'publishedAt',
      pageSize: 100,
      from,
      apiKey: process.env.NEWSAPI_KEY,
    },
    timeout: 8000,
  });

  const articles = res.data.articles || [];
  let idCounter = 8500;

  const crimes = articles.map(a => {
    const text = (a.title || '') + ' ' + (a.description || '');
    return {
      id: idCounter++,
      date: a.publishedAt || new Date().toISOString(),
      type: guessCrimeType(text),
      subtype: 'fonte news',
      modus: 'rilevato da NewsAPI',
      municipio: null,
      zona: 'Milano area',
      lat: null,
      lng: null,
      address: 'Milano',
      description: (a.title || '').slice(0, 200),
      severity: 3,
      city: 'MI',
      source: {
        title: a.title || '',
        outlet: (a.source && a.source.name) || 'NewsAPI',
        date: (a.publishedAt || '').slice(0, 10),
        url: a.url || '#',
        provider: 'NewsAPI',
      },
      isLive: true,
      liveId: 'napi_' + Buffer.from(a.url || a.title || String(idCounter)).toString('base64').slice(0, 16),
    };
  });

  _cache = crimes;
  _cacheExpiry = now + CACHE_TTL_MS;
  return crimes;
}

module.exports = { fetchNewsApiCrimes };
