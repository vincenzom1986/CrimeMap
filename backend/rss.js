'use strict';

const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');

const CACHE_TTL_MS = 12 * 60 * 1000; // 12 minutes

let _cache = null;
let _cacheExpiry = 0;

const RSS_FEEDS = [
  { url: 'https://www.corriere.it/rss/cronache.xml',        provider: 'Corriere' },
  { url: 'https://www.repubblica.it/rss/cronaca/rss2.0.xml', provider: 'Repubblica' },
  { url: 'https://www.ilgiorno.it/rss/cronaca',              provider: 'Il Giorno' },
  { url: 'https://milano.corriere.it/rss/',                  provider: 'Corriere Milano' },
];

const CRIME_KEYWORDS = [
  'furto','rapina','omicidio','spaccio','arrestato','fermato','aggression',
  'scippo','borseggio','violenza','truffa','ndrangheta','camorra','mafia',
  'accoltellato','sparatoria','estorsione','sequestro','vandalismo','tentato',
];

const MILAN_KEYWORDS = [
  'milano','milan','milanese','monza','sesto san giovanni','cinisello',
  'rho','corsico','abbiategrasso','magenta','binasco','paullo','melegnano',
  'cologno','segrate','vimodrone','pioltello','brianza','lombardia',
];

function hasCrimeKeyword(text) {
  const t = (text || '').toLowerCase();
  return CRIME_KEYWORDS.some(k => t.includes(k));
}

function hasMilanKeyword(text) {
  const t = (text || '').toLowerCase();
  return MILAN_KEYWORDS.some(k => t.includes(k));
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

async function fetchFeed(feed, parser, idCounter) {
  try {
    const res = await axios.get(feed.url, {
      timeout: 8000,
      headers: { 'User-Agent': 'CrimeMap/1.0' },
    });
    const parsed = parser.parse(res.data);
    const items = parsed?.rss?.channel?.item || parsed?.feed?.entry || [];
    const arr = Array.isArray(items) ? items : [items];

    return arr
      .filter(item => {
        const text = (item.title || '') + ' ' + (item.description || item.summary || '');
        return hasCrimeKeyword(text) && hasMilanKeyword(text);
      })
      .map(item => {
        const text = (item.title || '') + ' ' + (item.description || item.summary || '');
        const link = item.link || (item.link && item.link['@_href']) || '#';
        return {
          id: idCounter++,
          date: item.pubDate ? new Date(item.pubDate).toISOString()
               : item.published ? new Date(item.published).toISOString()
               : new Date().toISOString(),
          type: guessCrimeType(text),
          subtype: 'fonte news',
          modus: `rilevato da ${feed.provider}`,
          municipio: null,
          zona: 'Milano area',
          lat: null,
          lng: null,
          address: 'Milano',
          description: (item.title || '').slice(0, 200),
          severity: 3,
          city: 'MI',
          source: {
            title: item.title || '',
            outlet: feed.provider,
            date: item.pubDate ? new Date(item.pubDate).toISOString().slice(0, 10) : '',
            url: typeof link === 'string' ? link : '#',
            provider: feed.provider,
          },
          isLive: true,
          liveId: 'rss_' + require('crypto').createHash('md5').update(typeof link === 'string' ? link : item.title || String(idCounter)).digest('hex').slice(0, 24),
        };
      });
  } catch (err) {
    console.warn(`[RSS:${feed.provider}]`, err.message);
    return [];
  }
}

async function fetchExtraRss() {
  const now = Date.now();
  if (_cache && now < _cacheExpiry) return _cache;

  const parser = new XMLParser({ ignoreAttributes: false });
  let idCounter = 7000;

  const results = await Promise.allSettled(
    RSS_FEEDS.map(feed => fetchFeed(feed, parser, idCounter))
  );

  const crimes = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value);

  _cache = crimes;
  _cacheExpiry = now + CACHE_TTL_MS;
  return crimes;
}

module.exports = { fetchExtraRss };
