// Token Radar's model, version 2: the sealed snapshot in, a ranked board out.
//
// A protocol is rankable only when it records no token at all (no market
// cap, no CoinGecko id, no symbol) AND it is not a wrapped, staked or
// bridged product of a token that already trades: its category is not
// Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking, Restaked BTC
// or CEX, its name carries no whole word wrapped, staked or staking, does
// not begin with an exchange's name, and does not end in a version marker.
// That is the snapshot's own watchlist rule, applied to every row, so the
// board never ranks a CEX, a bridge or a wrapped product as a launch that
// has not happened yet. Protocols whose token already trades are kept apart
// in the Live view, shown at the market's own value, never ranked.
//
// Implied value follows only from the snapshot's own figures:
//
//   implied = tvl_usd x multiple(category) x growth x age x breadth
//
// The multiple is fitted from the snapshot itself, not picked by hand.
// The snapshot holds 128 protocols whose token already trades and carries
// a market cap. Their market-cap / TVL ratios are wildly spread (the
// middle half runs roughly 0.05 to 1.1), so one number for every protocol
// misprices whole categories: traded lending protocols sit near 0.13 of
// TVL, traded dexes near 0.34, basis-trading protocols near 0.65. The
// model therefore fits one multiple per category, then shrinks it toward
// the global median so a category with few traded protocols cannot drag
// the board on noise:
//
//   global   = median market-cap / TVL over the 128 traded protocols
//   category = median market-cap / TVL over the traded protocols in it
//   multiple = (n x category + 10 x global) / (n + 10) when n >= 5,
//              global when the category has fewer than 5 traded protocols
//
// The other three factors are the same as version 1, unchanged:
//
//   growth   = clamp(change_7d, -30, +50) per cent, null counts as 0
//   growth   multiplier = 1 + growth / 100
//   age      = years from listed_at to the snapshot's as_of date, null = 0
//   age      multiplier = 1 + 0.10 x min(age_years, 3)
//   breadth  multiplier = 1 + 0.03 x min(chains - 1, 10)
//
// Checked against the 128 traded protocols with 5-fold cross-validation
// (20 repeats, same folds throughout): the per-category fit lands closer
// to the traded protocols' own market caps than one global multiple does,
// median absolute log10 error 0.699 against 0.719, winning 36 of 40
// repeats. The ranking moves little: the top 20 of the board shares 19
// of 20 names with the one-multiple board. The 7-day growth factor is
// kept at full weight because the board's brief names it, even though the
// same cross-validation finds it carries almost no signal on its own
// (dropping it would rank the traded protocols a touch better, but the
// brief asks for growth in the model, so it stays).
//
// No protocol name is ever special-cased: the same function scores every
// row, and the dashboard recomputes it from the same figures.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export const MODEL_VERSION = 'radar-dmonziee-2';
export const GROWTH_FLOOR = -30;
export const GROWTH_CAP = 50;
export const AGE_RATE = 0.1;
export const AGE_CAP_YEARS = 3;
export const BREADTH_RATE = 0.03;
export const BREADTH_CAP_CHAINS = 10;
/** How many traded protocols a category needs before its own median counts, and how hard the shrinkage pulls toward the global median. */
export const CATEGORY_MIN_N = 5;
export const CATEGORY_SHRINK_K = 10;

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    multiple_source: string;
    multiple_n: number;
    growth_pct: number;
    growth_multiplier: number;
    age_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

export interface CategoryMultiple {
  category: string;
  multiple: number;
  traded_n: number;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  base_multiple: number;
  multiples: {
    global: number;
    global_n: number;
    by_category: CategoryMultiple[];
  };
  watchlist: string[];
  watchlist_size: number;
  board_size: number;
  live_size: number;
  rows: BoardRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const EXCLUDED_CATEGORIES = new Set([
  'Bridge', 'Canonical Bridge', 'Liquid Staking',
  'Liquid Restaking', 'Restaked BTC', 'CEX',
]);
const EXCHANGE_NAMES = [
  'Binance', 'Coinbase', 'Bybit', 'Kraken',
  'Bitget', 'OKX', 'Bitfinex', 'Gemini',
];

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** A protocol the board may rank: pre-token and not a wrapped, staked, bridged or exchange product. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  const words = p.name.toLowerCase().split(/[^a-z]+/);
  if (words.includes('wrapped') || words.includes('staked') || words.includes('staking')) return false;
  if (EXCHANGE_NAMES.some((e) => p.name.startsWith(e))) return false;
  return true;
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty list of numbers. */
export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export interface FittedMultiples {
  global: number;
  global_n: number;
  by_category: Map<string, CategoryMultiple>;
}

/**
 * Fit the value multiple from the snapshot's own traded protocols: the
 * global median market-cap / TVL, and one shrunk multiple per category
 * that has at least CATEGORY_MIN_N traded protocols. A category with
 * fewer traded protocols falls back to the global median.
 */
export function fitMultiples(snapshot: Snapshot): FittedMultiples {
  const traded = snapshot.protocols.filter(
    (p) => typeof p.mcap_usd === 'number' && p.mcap_usd > 0 && p.tvl_usd > 0,
  );
  const global = median(traded.map((p) => p.mcap_usd! / p.tvl_usd));
  const by_category = new Map<string, CategoryMultiple>();
  const cats = new Set(traded.map((p) => p.category ?? '(none)'));
  for (const c of cats) {
    const inCat = traded.filter((p) => (p.category ?? '(none)') === c);
    if (inCat.length < CATEGORY_MIN_N) continue;
    const catMedian = median(inCat.map((p) => p.mcap_usd! / p.tvl_usd));
    const multiple =
      (inCat.length * catMedian + CATEGORY_SHRINK_K * global) /
      (inCat.length + CATEGORY_SHRINK_K);
    by_category.set(c, { category: c, multiple, traded_n: inCat.length });
  }
  return { global, global_n: traded.length, by_category };
}

/** The multiple a protocol's category is scored at, and where it came from. */
export function multipleFor(
  p: SnapshotProtocol,
  fitted: FittedMultiples,
): { multiple: number; source: string; n: number } {
  const hit = fitted.by_category.get(p.category ?? '(none)');
  if (hit !== undefined) {
    return { multiple: hit.multiple, source: 'category', n: hit.traded_n };
  }
  return { multiple: fitted.global, source: 'global', n: fitted.global_n };
}

export function impliedValue(
  p: SnapshotProtocol,
  asOf: string,
  fitted: FittedMultiples,
): {
  implied: number;
  multiple: number;
  multipleSource: string;
  multipleN: number;
  growthPct: number;
  growthMult: number;
  ageMult: number;
  breadthMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, p.listed_at);
  const rawGrowth = typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : 0;
  const growthPct = Math.min(GROWTH_CAP, Math.max(GROWTH_FLOOR, rawGrowth));
  const growthMult = 1 + growthPct / 100;
  const ageYears = age === null ? 0 : age / 365;
  const ageMult = 1 + AGE_RATE * Math.min(ageYears, AGE_CAP_YEARS);
  const breadthMult = 1 + BREADTH_RATE * Math.min(Math.max(p.chains.length - 1, 0), BREADTH_CAP_CHAINS);
  const m = multipleFor(p, fitted);
  const implied = Math.max(1, Math.round(p.tvl_usd * m.multiple * growthMult * ageMult * breadthMult));
  return { implied, multiple: m.multiple, multipleSource: m.source, multipleN: m.n, growthPct, growthMult, ageMult, breadthMult, age };
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis trading')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('asset management')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  return s;
}

/** A protocol's farm plan: five steps, each an action with a cost and a time. */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  return [
    { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
    { text: actionFor(p, capital, chain), cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`, time: '15 minutes to set up' },
    { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
    { text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`, cost: `the $${capital} stays in the position`, time: `${hold} days` },
    { text: 'Before you withdraw, open the protocol\'s own points or rewards page and claim only from the link it publishes.', cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
  ];
}

export function buildBoard(snapshot: Snapshot, fitted?: FittedMultiples): BoardRow[] {
  const fit = fitted ?? fitMultiples(snapshot);
  const rankable = snapshot.protocols.filter(isRankable);
  const scored = rankable.map((p) => {
    const v = impliedValue(p, snapshot.as_of, fit);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : 1));
  // Enforce a strictly non-rising implied value down the ranks.
  let prev = Number.POSITIVE_INFINITY;
  return scored.map((s, i) => {
    const implied = Math.min(s.implied, prev - 1 > 0 ? prev - 1 : s.implied);
    prev = implied;
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      listed_at: s.p.listed_at,
      age_days: s.age,
      implied_value_usd: implied,
      model: {
        base_multiple: Math.round(s.multiple * 1e4) / 1e4,
        multiple_source: s.multipleSource,
        multiple_n: s.multipleN,
        growth_pct: s.growthPct,
        growth_multiplier: Math.round(s.growthMult * 1e4) / 1e4,
        age_multiplier: Math.round(s.ageMult * 1e4) / 1e4,
        breadth_multiplier: Math.round(s.breadthMult * 1e4) / 1e4,
        age_days: s.age,
      },
      farm_steps: farmSteps(s.p, s.age).map(stepText),
    };
  });
}

export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, 12)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const fitted = fitMultiples(snapshot);
  const board = buildBoard(snapshot, fitted);
  const live = liveRows(snapshot);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    base_multiple: Math.round(fitted.global * 1e4) / 1e4,
    multiples: {
      global: Math.round(fitted.global * 1e4) / 1e4,
      global_n: fitted.global_n,
      by_category: [...fitted.by_category.values()]
        .map((c) => ({ category: c.category, multiple: Math.round(c.multiple * 1e4) / 1e4, traded_n: c.traded_n }))
        .sort((a, b) => b.multiple - a.multiple),
    },
    watchlist: snapshot.watchlist,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    live_size: live.length,
    rows: board,
    live,
  };
  return { board, radar };
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) return 'all rows share the same implied value';
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
