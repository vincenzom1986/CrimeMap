'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { fetchMentions, getProjectQueries } = require('./brandwatch');
const { geocodeMention } = require('./geocoder');

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
      if (name.includes('crimini') || name.includes('crime')) {
        QUERY_IDS.crimes = q.id;
      }
      if (name.includes('immobiliare') || name.includes('real estate')) {
        QUERY_IDS.realEstate = q.id;
      }
    }
    console.log('[startup] Resolved query IDs:', QUERY_IDS);
  } catch (err) {
    console.warn('[startup] Could not resolve query IDs — check credentials:', err.message);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

function guessCrimeType(text) {
  if (text.includes('furto') || text.includes('ladro') || text.includes('ladri')) return 'furto';
  if (text.includes('rapina')) return 'rapina';
  if (text.includes('spaccio') || text.includes('droga')) return 'spaccio';
  if (text.includes('truffa') || text.includes('frode') || text.includes('phishing')) return 'truffa';
  if (text.includes('omicidio') || text.includes('ucciso') || text.includes('assassin')) return 'omicidio';
  if (text.includes('scippo') || text.includes('borseggio')) return 'borseggio';
  if (text.includes('ndrangheta') || text.includes('mafia') || text.includes('camorra')) return 'mafia';
  if (text.includes('vandalismo') || text.includes('incendio')) return 'vandalismo';
  if (text.includes('violenza sessuale') || text.includes('stupro')) return 'violenza sessuale';
  return 'violenza';
}

function mentionToHost(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch (_) { return 'fonte sconosciuta'; }
}

// ── Routes ─────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, queryIds: QUERY_IDS, ts: new Date().toISOString() });
});

// Returns crime mentions geocoded to municipality
app.get('/api/live-crimes', async (_req, res) => {
  if (!QUERY_IDS.crimes) {
    return res.json({
      crimes: [],
      meta: { source: 'brandwatch', error: 'query_id_not_configured' },
    });
  }

  try {
    const mentions = await fetchMentions(QUERY_IDS.crimes, 7, 100);
    const severityMap = { negative: 4, neutral: 2, positive: 1 };
    let idCounter = 9000;

    const crimes = mentions
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
          lat: null,   // resolved client-side from ALL_COMUNI
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
          },
          isLive: true,
          bwMentionId: String(mention.id),
        };
      })
      .filter(Boolean);

    res.json({
      crimes,
      meta: { source: 'brandwatch', count: crimes.length, ts: new Date().toISOString() },
    });
  } catch (err) {
    console.error('[/api/live-crimes]', err.message);
    res.json({ crimes: [], meta: { source: 'brandwatch', error: err.message } });
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

    // Accumulate sentiment counts per munId
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

    // Normalize to score in range -1..+1
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
  });
});
