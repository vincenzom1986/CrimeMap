'use strict';

const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');

const ANSA_RSS_URL = 'https://www.ansa.it/lombardia/notizie/lombardia_rss.xml';
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

let _cache = null;
let _cacheExpiry = 0;

const CRIME_KEYWORDS = [
  'furto','rapina','omicidio','spaccio','arrestato','fermato','aggression',
  'scippo','borseggio','violenza','truffa','ndrangheta','camorra','mafia',
  'tentato','accoltellato','sparatoria','estorsione','sequestro','vandalismo',
];

function hasCrimeKeyword(text) {
  const t = (text || '').toLowerCase();
  return CRIME_KEYWORDS.some(k => t.includes(k));
}

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

async function fetchAnsaCrimes() {
  const now = Date.now();
  if (_cache && now < _cacheExpiry) return _cache;

  const res = await axios.get(ANSA_RSS_URL, {
    timeout: 8000,
    headers: { 'User-Agent': 'CrimeMap/1.0' },
  });

  const parser = new XMLParser({ ignoreAttributes: false });
  const feed = parser.parse(res.data);
  const items = feed?.rss?.channel?.item || [];

  let idCounter = 8000;
  const crimes = (Array.isArray(items) ? items : [items])
    .filter(item => hasCrimeKeyword(item.title) || hasCrimeKeyword(item.description))
    .map(item => {
      const text = (item.title || '') + ' ' + (item.description || '');
      return {
        id: idCounter++,
        date: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
        type: guessCrimeType(text),
        subtype: 'fonte news',
        modus: 'rilevato da ANSA',
        municipio: null,
        zona: 'Milano area',
        lat: null,
        lng: null,
        address: 'Lombardia',
        description: (item.title || '').slice(0, 200),
        severity: 3,
        city: 'MI',
        source: {
          title: item.title || '',
          outlet: 'ANSA',
          date: item.pubDate ? new Date(item.pubDate).toISOString().slice(0, 10) : '',
          url: item.link || '#',
          provider: 'ANSA',
        },
        isLive: true,
        liveId: 'ansa_' + Buffer.from(item.link || item.title || String(idCounter)).toString('base64').slice(0, 16),
      };
    });

  _cache = crimes;
  _cacheExpiry = now + CACHE_TTL_MS;
  return crimes;
}

module.exports = { fetchAnsaCrimes };
