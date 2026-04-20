'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { fetchMentions, getProjectQueries } = require('./brandwatch');
const { geocodeMention } = require('./geocoder');
const { fetchAnsaCrimes } = require('./ansa');
const { fetchNewsApiCrimes } = require('./newsapi');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

// ── Query ID cache — resolved once at startup ──────────────────────────
const QUERY_IDS = { crimes: null, realEstate: null };

async function resolveQueryIds() {
  try {
    const queries = await getProjectQueries();
    for (const q of queries) {
      const name = (q.name || '').toLowerCase();
      if (name.includes('crimini') || name.includes('crime')) QUERY_IDS.crimes = q.id;
      if (name.includes('immobiliare') || name.includes('real estate')) QUERY_IDS.realEstate = q.id;
    }
    console.log('[startup] Resolved query IDs:', QUERY_IDS);
  } catch (err) {
    console.warn('[startup] Could not resolve query IDs — check credentials:', err.message);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

function guessCrimeType(text) {
  const t = (text || '').toLowerCase();
  if (t.includes('furto') || t.includes('ladro') || t.includes('ladri')) return 'furto';
  if (t.includes('rapina')) return 'rapina';
  if (t.includes('spaccio') || t.includes('droga')) return 'spaccio';
  if (t.includes('truffa') || t.includes('frode') || t.includes('phishing')) return 'truffa';
  if (t.includes('omicidio') || t.includes('ucciso') || t.includes('assassin')) return 'omicidio';
  if (t.includes('scippo') || t.includes('borseggio')) return 'borseggio';
  if (t.includes('ndrangheta') || t.includes('mafia') || t.includes('camorra')) return 'mafia';
  if (t.includes('vandalismo') || t.includes('incendio')) return 'vandalismo';
  if (t.includes('violenza sessuale') || t.includes('stupro')) return 'sessuale';
  return 'violenza';
}

function mentionToHost(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch (_) { return 'fonte sconosciuta'; }
}

// Fetch Brandwatch crimes and normalize to common schema
async function fetchBrandwatchCrimes() {
  if (!QUERY_IDS.crimes) return [];
  const mentions = await fetchMentions(QUERY_IDS.crimes, 7, 100);
  const severityMap = { negative: 4, neutral: 2, positive: 1 };
  let idCounter = 9000;

  return mentions
    .map(mention => {
      const geo = geocodeMention(mention);
      if (!geo || !geo.munId) return null;
      const text = ((mention.title || '') + ' ' + (mention.snippet || '')).toLowerCase();
      return {
        id: idCounter++,
        date: mention.date || new Date().toISOString(),
        type: guessCrimeType(text),
        subtype: 'fonte social/news',
        modus: 'rilevato da Brandwatch',
        municipio: geo.munId,
        zona: geo.zoneName || geo.city,
        lat: null,
        lng: null,
        address: geo.zoneName || geo.city,
        description: (mention.title || mention.snippet || '').slice(0, 200),
        severity: severityMap[mention.sentiment] || 2,
        city: geo.city,
        source: {
          title: mention.title || 'Brandwatch mention',
          outlet: mentionToHost(mention.url || ''),
          date: (mention.date || '').slice(0, 10),
          url: mention.url || '#',
          provider: 'Brandwatch',
        },
        isLive: true,
        liveId: 'bw_' + String(mention.id),
      };
    })
    .filter(Boolean);
}

// Geocode ANSA/NewsAPI crimes using keyword lookup
function geocodeLiveCrime(crime) {
  const geo = geocodeMention({
    title: crime.description,
    snippet: crime.description,
    fullText: crime.description,
    location: null,
  });
  if (geo && geo.munId) {
    crime.municipio = geo.munId;
    crime.zona = geo.zoneName || 'Milano area';
  }
  return crime;
}

// ── Routes ─────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    queryIds: QUERY_IDS,
    sources: { brandwatch: !!QUERY_IDS.crimes, ansa: true, newsapi: !!process.env.NEWSAPI_KEY },
    ts: new Date().toISOString(),
  });
});

// Aggregates crimes from Brandwatch + ANSA + NewsAPI
app.get('/api/live-crimes', async (_req, res) => {
  try {
    const [bwResult, ansaResult, napiResult] = await Promise.allSettled([
      fetchBrandwatchCrimes(),
      fetchAnsaCrimes(),
      fetchNewsApiCrimes(),
    ]);

    const bwCrimes   = bwResult.status   === 'fulfilled' ? bwResult.value   : [];
    const ansaCrimes = ansaResult.status === 'fulfilled' ? ansaResult.value : [];
    const napiCrimes = napiResult.status === 'fulfilled' ? napiResult.value : [];

    if (ansaResult.status === 'rejected') console.warn('[ANSA]', ansaResult.reason?.message);
    if (napiResult.status === 'rejected') console.warn('[NewsAPI]', napiResult.reason?.message);

    // Geocode ANSA + NewsAPI crimes
    const geocodedAnsa = ansaCrimes.map(geocodeLiveCrime);
    const geocodedNapi = napiCrimes.map(geocodeLiveCrime);

    // Merge all, deduplicate by liveId
    const seen = new Set();
    const all = [...bwCrimes, ...geocodedAnsa, ...geocodedNapi].filter(c => {
      if (seen.has(c.liveId)) return false;
      seen.add(c.liveId);
      return true;
    });

    res.json({
      crimes: all,
      meta: {
        total: all.length,
        brandwatch: bwCrimes.length,
        ansa: geocodedAnsa.length,
        newsapi: geocodedNapi.length,
        ts: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[/api/live-crimes]', err.message);
    res.json({ crimes: [], meta: { error: err.message } });
  }
});

// Returns recent real estate mentions enriched with geo
app.get('/api/real-estate-news', async (_req, res) => {
  if (!QUERY_IDS.realEstate) {
    return res.json({ mentions: [], meta: { error: 'query_id_not_configured' } });
  }
  try {
    const mentions = await fetchMentions(QUERY_IDS.realEstate, 14, 50);
    const results = mentions.map(m => ({
      id: m.id,
      title: m.title,
      snippet: m.snippet,
      url: m.url,
      date: m.date,
      sentiment: m.sentiment,
      outlet: mentionToHost(m.url || ''),
      geo: geocodeMention(m),
    }));
    res.json({ mentions: results, meta: { count: results.length, ts: new Date().toISOString() } });
  } catch (err) {
    console.error('[/api/real-estate-news]', err.message);
    res.json({ mentions: [], meta: { error: err.message } });
  }
});

// Returns aggregated sentiment score per municipality
app.get('/api/sentiment', async (_req, res) => {
  if (!QUERY_IDS.crimes) {
    return res.json({ sentiment: {}, meta: { error: 'query_id_not_configured' } });
  }
  try {
    const mentions = await fetchMentions(QUERY_IDS.crimes, 30, 500);
    const acc = {};
    for (const mention of mentions) {
      const geo = geocodeMention(mention);
      if (!geo || !geo.munId) continue;
      if (!acc[geo.munId]) acc[geo.munId] = { pos: 0, neg: 0, neu: 0, total: 0 };
      if (mention.sentiment === 'positive') acc[geo.munId].pos++;
      else if (mention.sentiment === 'negative') acc[geo.munId].neg++;
      else acc[geo.munId].neu++;
      acc[geo.munId].total++;
    }
    const sentiment = {};
    for (const [munId, counts] of Object.entries(acc)) {
      if (counts.total === 0) continue;
      sentiment[munId] = {
        score: (counts.pos - counts.neg) / counts.total,
        positive: counts.pos,
        negative: counts.neg,
        neutral: counts.neu,
        total: counts.total,
      };
    }
    res.json({ sentiment, meta: { ts: new Date().toISOString() } });
  } catch (err) {
    console.error('[/api/sentiment]', err.message);
    res.json({ sentiment: {}, meta: { error: err.message } });
  }
});

// ── Start ──────────────────────────────────────────────────────────────
resolveQueryIds().then(() => {
  app.listen(PORT, () => {
    console.log(`CrimeMap backend running on http://localhost:${PORT}`);
    console.log('Routes: /api/health  /api/live-crimes  /api/real-estate-news  /api/sentiment');
    console.log('Sources: Brandwatch', QUERY_IDS.crimes ? '✓' : '✗', '| ANSA ✓ | NewsAPI', process.env.NEWSAPI_KEY ? '✓' : '✗ (set NEWSAPI_KEY)');
  });
});
