interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * Manifold Markets MCP.
 *
 * Keyless play-money prediction market with tens of thousands of user-created
 * markets on any topic (politics, tech, sports, crypto, AI, culture). Search
 * markets by topic, get full market detail with multiple-choice answer
 * probabilities, and surface the most-active open markets as an
 * attention/demand signal. Complements the polymarket and kalshi packs as a
 * third major prediction-market venue. Keyless.
 */


const BASE = 'https://api.manifold.markets/v0';
const UA = 'pipeworx/1.0 (+https://pipeworx.io)';

const tools: McpToolExport['tools'] = [
  {
    name: 'search_markets',
    description:
      'Search Manifold Markets prediction markets by topic or question text. Returns markets with current probability (for binary), trading volume, liquidity, bettor count, and resolution status. Manifold is a play-money venue with tens of thousands of user-created markets on any topic. Keyless.',
    inputSchema: {
      type: 'object',
      properties: {
        term: {
          type: 'string',
          description: 'Topic or question text to search for, e.g. "2026 election", "AGI", "Bitcoin 100k".',
        },
        filter: {
          type: 'string',
          description: 'Market state filter: all | open | closed | resolved. Default "open".',
        },
        sort: {
          type: 'string',
          description: 'Sort order: score | newest | liquidity | most-popular. Default "score".',
        },
        contract_type: {
          type: 'string',
          description: 'Market type filter: ALL | BINARY | MULTIPLE_CHOICE. Default "ALL".',
        },
        limit: { type: 'number', description: 'Max markets to return (default 10, max 25).' },
      },
      required: ['term'],
    },
  },
  {
    name: 'get_market',
    description:
      'Get full detail for a single Manifold market by its URL slug or id. Provide exactly one of slug/id. For multiple-choice markets, returns each answer with its probability (top 12). Includes plain-text description, creator, volume, liquidity, and resolution. Keyless.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description:
            'Market URL slug — the part after manifold.markets/{user}/, e.g. "who-will-win-the-2026-california-gu".',
        },
        id: { type: 'string', description: 'Market id, e.g. "KmbNYfuOrUnI1w1GSHdb".' },
      },
    },
  },
  {
    name: 'top_markets',
    description:
      'Most-active open Manifold markets right now — a live attention/demand signal for what the prediction-market crowd is trading. Optionally narrow to a topic. Returns compact market records sorted by popularity. Keyless.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max markets to return (default 15, max 25).' },
        term: { type: 'string', description: 'Optional topic to narrow to, e.g. "politics", "AI".' },
      },
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    switch (name) {
      case 'search_markets':
        return searchMarkets(args);
      case 'get_market':
        return getMarket(args);
      case 'top_markets':
        return topMarkets(args);
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// --- helpers ---------------------------------------------------------------

/** epoch-ms → ISO string, null-safe. */
function isoMs(ms: unknown): string | null {
  if (typeof ms !== 'number' || !isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

/** probability (0-1) → percent rounded to 1dp, null-safe. */
function pct(p: unknown): number | null {
  if (typeof p !== 'number' || !isFinite(p)) return null;
  return Math.round(p * 1000) / 10;
}

function round0(n: unknown): number | null {
  if (typeof n !== 'number' || !isFinite(n)) return null;
  return Math.round(n);
}

/** Compact market mapping shared across all three tools. */
function mapMarket(raw: Record<string, unknown>): Record<string, unknown> {
  const isBinary = raw.outcomeType === 'BINARY';
  return {
    id: raw.id,
    question: raw.question,
    url: raw.url,
    type: raw.outcomeType,
    probability_pct: isBinary ? pct(raw.probability) : null,
    volume: round0(raw.volume),
    total_liquidity: round0(raw.totalLiquidity),
    unique_bettors: raw.uniqueBettorCount ?? null,
    close_time: isoMs(raw.closeTime),
    is_resolved: raw.isResolved ?? null,
    resolution: raw.resolution ?? null,
    creator: raw.creatorName ?? null,
  };
}

/** Best-effort plain text from a Manifold description (string or rich-text doc). */
function descriptionText(raw: Record<string, unknown>): string | null {
  // The slug/market endpoints often include a precomputed plain-text field.
  if (typeof raw.textDescription === 'string' && raw.textDescription.trim()) {
    return raw.textDescription.trim().slice(0, 500);
  }
  const d = raw.description;
  if (typeof d === 'string') return d.trim().slice(0, 500) || null;
  if (d && typeof d === 'object') {
    const parts: string[] = [];
    const walk = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      const n = node as Record<string, unknown>;
      if (typeof n.text === 'string') parts.push(n.text);
      if (Array.isArray(n.content)) n.content.forEach(walk);
    };
    walk(d);
    const text = parts.join(' ').replace(/\s+/g, ' ').trim();
    return text ? text.slice(0, 500) : null;
  }
  return null;
}

async function fetchJson(url: string): Promise<unknown> {
  return fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA } });
}

// --- tools -----------------------------------------------------------------

async function searchMarkets(args: Record<string, unknown>): Promise<unknown> {
  const term = typeof args.term === 'string' ? args.term.trim() : '';
  if (!term) return { error: 'provide a search term', term: args.term ?? null };

  const filter = (typeof args.filter === 'string' && args.filter.trim()) || 'open';
  const sort = (typeof args.sort === 'string' && args.sort.trim()) || 'score';
  const contractType = (typeof args.contract_type === 'string' && args.contract_type.trim()) || 'ALL';
  const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 25);

  const qs = new URLSearchParams({
    term,
    filter,
    sort,
    contractType,
    limit: String(limit),
  });
  const res = (await fetchJson(`${BASE}/search-markets?${qs}`)) as Response;
  if (!res.ok) return { error: `manifold: ${res.status} ${(await res.text()).slice(0, 200)}` };

  const arr = (await res.json()) as Array<Record<string, unknown>>;
  const list = Array.isArray(arr) ? arr : [];
  return { count: list.length, markets: list.map(mapMarket) };
}

async function getMarket(args: Record<string, unknown>): Promise<unknown> {
  const slug = typeof args.slug === 'string' ? args.slug.trim() : '';
  const id = typeof args.id === 'string' ? args.id.trim() : '';
  if (!slug && !id) return { error: 'provide exactly one of slug or id' };
  if (slug && id) return { error: 'provide exactly one of slug or id, not both' };

  const path = slug ? `slug/${encodeURIComponent(slug)}` : `market/${encodeURIComponent(id)}`;
  const res = (await fetchJson(`${BASE}/${path}`)) as Response;
  if (res.status === 404) return { error: 'market not found', slug: slug || null, id: id || null };
  if (!res.ok) return { error: `manifold: ${res.status} ${(await res.text()).slice(0, 200)}` };

  const m = (await res.json()) as Record<string, unknown>;
  const out: Record<string, unknown> = {
    ...mapMarket(m),
    created_time: isoMs(m.createdTime),
    total_bettors: m.uniqueBettorCount ?? null,
    description_text: descriptionText(m),
  };

  if (m.outcomeType === 'MULTIPLE_CHOICE' && Array.isArray(m.answers)) {
    out.answers = (m.answers as Array<Record<string, unknown>>)
      .map((a) => ({ text: a.text, probability_pct: pct(a.probability) }))
      .sort((a, b) => (b.probability_pct ?? -1) - (a.probability_pct ?? -1))
      .slice(0, 12);
  }

  return out;
}

async function topMarkets(args: Record<string, unknown>): Promise<unknown> {
  const limit = Math.min(Math.max(Number(args.limit) || 15, 1), 25);
  const term = typeof args.term === 'string' ? args.term.trim() : '';

  const qs = new URLSearchParams({
    term,
    sort: 'most-popular',
    filter: 'open',
    limit: String(limit),
  });
  const res = (await fetchJson(`${BASE}/search-markets?${qs}`)) as Response;
  if (!res.ok) return { error: `manifold: ${res.status} ${(await res.text()).slice(0, 200)}` };

  const arr = (await res.json()) as Array<Record<string, unknown>>;
  const list = Array.isArray(arr) ? arr : [];
  return { count: list.length, markets: list.map(mapMarket) };
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
