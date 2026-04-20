'use strict';

// Each entry: { munId, city, name, keywords[] }
// Keywords are lowercase; matching is case-insensitive substring check.
// More specific keywords listed before generic parents to avoid false positives.
const MUNICIPALITY_KEYWORDS = [
  // ── MILAN CITY (munId 1–9) ─────────────────────────────────────────────
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

  // ── MILAN HINTERLAND (munId 10–16) ────────────────────────────────────
  {
    munId: 10, city: 'MI', name: 'Sesto S.G. · Cinisello',
    keywords: [
      'sesto san giovanni', 'cinisello', 'cinisello balsamo', 'balsamo',
      'cormano', 'cusano milanino', 'sesto',
    ],
  },
  {
    munId: 11, city: 'MI', name: 'Monza · Brianza',
    keywords: [
      'monza', 'brianza', 'seregno', 'desio', 'lissone', 'vimercate',
      'carate brianza', 'giussano', 'meda', 'nova milanese',
    ],
  },
  {
    munId: 12, city: 'MI', name: 'Rho · Pero · Corsico',
    keywords: [
      'rho', 'pero', 'corsico', 'buccinasco', 'assago', 'settimo milanese',
      'cornaredo', 'pregnana milanese',
    ],
  },
  {
    munId: 13, city: 'MI', name: 'Abbiategrasso · Magenta',
    keywords: [
      'abbiategrasso', 'magenta', 'albairate', 'corbetta', 'cuggiono',
      'inveruno', 'ossona', 'robecco sul naviglio',
    ],
  },
  {
    munId: 14, city: 'MI', name: 'Binasco · Pieve Emanuele',
    keywords: [
      'binasco', 'pieve emanuele', 'locate di triulzi', 'locate triulzi',
      'lacchiarella', 'vernate', 'zibido san giacomo',
    ],
  },
  {
    munId: 15, city: 'MI', name: 'Paullo · Melegnano',
    keywords: [
      'paullo', 'melegnano', 'mediglia', 'lodi vecchio', 'cerro al lambro',
      'colturano', 'dresano', 'vizzolo predabissi',
    ],
  },
  {
    munId: 16, city: 'MI', name: 'Cologno · Segrate · Vimodrone',
    keywords: [
      'cologno monzese', 'cologno', 'segrate', 'vimodrone', 'pioltello',
      'rodano', 'peschiera borromeo', 'opera',
    ],
  },
];

// City-level fallback
const CITY_FALLBACKS = [
  { city: 'MI', keywords: ['milano', 'milan', 'milanese', 'lombardia', 'lombard'] },
];

/**
 * Given a Brandwatch/ANSA/NewsAPI mention, return { munId, city, zoneName } or null.
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
