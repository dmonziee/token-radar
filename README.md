# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/dmonziee/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/dmonziee/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar for make.fun's [`token-radar-01`](https://make.fun/bounty/token-radar-01) bounty ($1,325): 198 pre-token protocols ranked by implied launch value, with a farm plan for each.

## The model

Implied value follows only from the snapshot's own figures:

```
implied = TVL x 0.205 x growth x age x breadth
```

- **0.205** is the median market-cap / TVL of the 129 token protocols in the snapshot.
- **Growth** is the 7-day TVL change, clamped to -30%..+50%.
- **Age** adds 10% a year running with no token, capped at 3 years.
- **Breadth** adds 3% per extra chain, capped at 10 chains.

No protocol name is special-cased. Exchanges, bridges, liquid-staking
products and wrapped or staked products are excluded, as are versioned
pools — they are not launches that have not happened yet. Protocols whose
token already trades are shown separately, at the market's own value.

## The board

- All 40 protocols on the snapshot's watchlist, plus every other rankable
  pre-token protocol below the $50M floor — 198 rows in all.
- Each row carries 5 concrete farm steps, with what they cost and how
  long they take.
- The dashboard is sortable and filterable, with a detail view for each
  protocol and a separate view of the protocols that already trade.

## How it runs

`main.ts` (Node 22, standard library only) reads the sealed snapshot,
writes `board.json` and `data.js`, copies `dashboard/` and `screenshots/`,
and writes `dossier.json`.

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```
