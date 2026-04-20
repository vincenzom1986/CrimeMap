'use strict';

// Each entry: { munId, city, name, keywords[] }
// Keywords are lowercase; matching is case-insensitive substring check.
// More specific keywords listed before generic parents to avoid false positives.
const MUNICIPALITY_KEYWORDS = [
  // ── MILAN (munId 1–9) ──────────────────────────────────────────────────
  {
    munId: 1, city: 'MI', name: 'Centro Storico',
    keywords: [
      'duomo', 'brera', 'navigli', 'porta romana', 'centro storico milano',
      'centro di milano', 'piazza duomo', 'via torino', 'corso magenta',
      'corso vittorio emanuele', 'via dante', 'castello sforzesco',
    ],
  },
  {
    munId: 2, city: 'MI', name: 'Stazione · Greco · Gorla',
    keywords: [
      'centrale', 'stazione centrale', 'loreto', 'turro', 'crescenzago',
      'greco', 'gorla', 'piazzale loreto', 'via padova',
    ],
  },
  {
    munId: 3, city: 'MI', name: 'Venezia · Città Studi',
    keywords: [
      'porta venezia', 'città studi', 'lambrate', 'argonne', 'politecnico',
      'viale corsica', 'corso buenos aires', 'piola', 'udine',
    ],
  },
  {
    munId: 4, city: 'MI', name: 'Vittoria · Forlanini',
    keywords: [
      'corvetto', 'rogoredo', 'linate', 'mecenate', 'forlanini',
      'porta vittoria', 'viale ungheria', 'aeroporto linate',
    ],
  },
  {
    munId: 5, city: 'MI', name: 'Vigentino · Gratosoglio',
    keywords: [
      'vigentino', 'gratosoglio', 'chiaravalle', 'ticinese', 'ripamonti',
      'porta lodovica', 'viale famagosta', 'chiesa rossa',
    ],
  },
  {
    munId: 6, city: 'MI', name: 'Barona · Lorenteggio',
    keywords: [
      'barona', 'lorenteggio', 'giambellino', 'famagosta', 'porta genova',
      'via lorenteggio', 'muggiano', 'bande nere',
    ],
  },
  {
    munId: 7, city: 'MI', name: 'San Siro · De Angeli',
    keywords: [
      'san siro', 'de angeli', 'baggio', 'forze armate', 'figino',
      'stadio san siro', 'fiera di milano', 'piazza piemonte', 'trenno',
    ],
  },
  {
    munId: 8, city: 'MI', name: 'Gallaratese · QT8',
    keywords: [
      'gallaratese', 'qt8', 'quarto oggiaro', 'certosa', 'portello',
      'bonola', 'cascina merlata', 'rho fiera',
    ],
  },
  {
    munId: 9, city: 'MI', name: 'Niguarda · Bicocca · Isola',
    keywords: [
      'niguarda', 'bicocca', 'isola', 'dergano', 'affori', 'maciachini',
      'bruzzano', 'ospedale niguarda', 'piazza isola', 'viale zara',
    ],
  },

  // ── REGGIO CALABRIA (munId 101–109) ───────────────────────────────────
  {
    munId: 101, city: 'RC', name: 'Centro Storico',
    keywords: [
      'lungomare', 'falcomatà', 'corso garibaldi', 'centro storico reggio',
      'centro di reggio calabria', 'piazza italia', 'via marina',
      'museo nazionale', 'piazza duomo reggio',
    ],
  },
  {
    munId: 102, city: 'RC', name: 'Sbarre · Modena',
    keywords: [
      'sbarre', 'modena', 'san sperato', 'sbarre centrali', 'via sbarre',
      'rione sbarre',
    ],
  },
  {
    munId: 103, city: 'RC', name: 'Archi · Gallico',
    keywords: [
      'archi', 'gallico', 'gallico marina', 'pentimele', 'zona nord reggio',
      'via archi', 'rione archi',
    ],
  },
  {
    munId: 104, city: 'RC', name: 'Pellaro · Bocale',
    keywords: [
      'pellaro', 'bocale', 'lume', 'san filippo sud', 'zona sud reggio',
      'marina di pellaro',
    ],
  },
  {
    munId: 105, city: 'RC', name: 'Gebbione · Ravagnese',
    keywords: [
      'gebbione', 'ravagnese', 'aeroporto reggio', 'tito minniti',
      'aeroporto dello stretto',
    ],
  },
  {
    munId: 106, city: 'RC', name: 'Santa Caterina · Gallina',
    keywords: [
      'santa caterina', 'gallina', 'cataforio', 'colle degli ulivi',
      'san giorgio extra',
    ],
  },
  {
    munId: 107, city: 'RC', name: 'Condera · Eremo',
    keywords: [
      'condera', 'eremo', 'spirito santo', 'san vito', 'collina reggio',
      'rione ferrovieri',
    ],
  },
  {
    munId: 108, city: 'RC', name: 'Tremulini · Trabocchetto',
    keywords: [
      'tremulini', 'trabocchetto', 'rione marconi', 'via reggio campi',
      'modena superiore',
    ],
  },
  {
    munId: 109, city: 'RC', name: 'Catona · Salice',
    keywords: [
      'catona', 'salice', 'villa san giuseppe', 'arghillà', 'zona nord est reggio',
      'rosalì',
    ],
  },
];

// City-level fallbacks — used when no specific zone matches
const CITY_FALLBACKS = [
  { city: 'MI', keywords: ['milano', 'milan', 'milanese'] },
  { city: 'RC', keywords: ['reggio calabria', 'reggio cal', ' rc '] },
];

/**
 * Given a Brandwatch mention object, return { munId, city, zoneName } or null.
 * Searches title + snippet + fullText + location.name (all lowercased).
 * Returns { munId: null, city, zoneName: null } for city-level fallback.
 */
function geocodeMention(mention) {
  const haystack = [
    mention.title || '',
    mention.snippet || '',
    mention.fullText || '',
    (mention.location && mention.location.name) || '',
  ].join(' ').toLowerCase();

  for (const entry of MUNICIPALITY_KEYWORDS) {
    for (const kw of entry.keywords) {
      if (haystack.includes(kw)) {
        return { munId: entry.munId, city: entry.city, zoneName: entry.name };
      }
    }
  }

  for (const fb of CITY_FALLBACKS) {
    for (const kw of fb.keywords) {
      if (haystack.includes(kw)) {
        return { munId: null, city: fb.city, zoneName: null };
      }
    }
  }

  return null;
}

module.exports = { geocodeMention, MUNICIPALITY_KEYWORDS };
