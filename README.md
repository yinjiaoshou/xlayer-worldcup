# ⚽ XLayer World Cup 2026

> **On-chain parlay prediction game powered by Claude AI — stake XLWC to follow AI picks, earn +30% win bonus or get guaranteed 15% loss refund, backed by a full DeFi flywheel with 50+ national team tokens on a Flap bonding curve.**

Live: **[xlwc.vercel.app](https://xlwc.vercel.app)** · Twitter: **[@Xlayer_WorldCup](https://x.com/Xlayer_WorldCup)** · Network: **XLayer Mainnet (chainId 196)**

---

## Overview

XLayer World Cup 2026 is a fully on-chain prediction market built for the FIFA World Cup. Players predict the outcomes of bundled match "rounds" (3-5 matches per round), competing for a shared prize pool. What makes it unique:

- **Claude AI Agent** submits its own match predictions on-chain before every deadline
- **Stakers can one-click follow** the AI and earn an additive bonus (win +30%, lose −get 15% back)
- **50+ national team ERC-20 tokens** each launched on Flap's bonding curve — when your team wins, your token pumps
- **DeFi flywheel**: entry fees → prize pool → winners buy team tokens → buyback → XLWC appreciation

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        XLayer Mainnet                        │
│                                                             │
│   XLWC (Flap bonding curve)                                 │
│       │                                                     │
│       ├──► MatchPredictor v7  ◄──── Claude AI Agent         │
│       │         │                       │                   │
│       │    Prize Pool           submitAgentPick()           │
│       │         │                                           │
│       ├──► FantasyLeague                                    │
│       │         │                                           │
│       └──► TeamTokenFactory ──► 50+ TeamToken (ERC-20)      │
│                 │                       │                   │
│                 └──► ButterflyVault ◄───┘                   │
│                           │                                 │
│                    XLWC Buyback (champion wins)             │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Features

### 🎯 Parlay Prediction (串关竞猜)
Each "round" bundles 3–5 World Cup matches. Players predict the outcome of **every match** in the round (home win / draw / away win) by paying an XLWC entry fee. All-correct predictions share the prize pool, weighted by:

| Bonus | Multiplier |
|-------|-----------|
| Base | ×1.0 (weight 10,000) |
| Underdog correct (爆冷) | ×2 per upset, stacks |
| Holding winning team token (持币) | ×1.5 |
| **Hard cap** | **30,000** |

### 🤖 Claude AI Agent
- The AI submits a prediction on-chain (`submitAgentPick`) before each round deadline
- Users who hold ≥ 500 XLWC staked can **follow in one click** via `followAndPredict(roundId)`
- Followers earn an **additive bonus from the insurance pool** — not weight dilution of other players
- The refund is **pre-reserved at entry time**, guaranteeing it's always payable

| Outcome | Follower benefit |
|---------|-----------------|
| AI wins | +30% of entry fee (from insurance pool) |
| AI loses | 15% of entry fee refunded (pre-reserved) |

### 🏆 Fantasy League
Register a squad of 5 national teams before the tournament. Score points for every win. Top players split the prize pool when the tournament ends.

### 🪙 Team Tokens (DeFi Flywheel)
Every 2026 qualifier has its own ERC-20 token launched on [Flap.sh](https://flap.sh). The flywheel:

```
Entry fees → Prize pool → Winners buy team tokens
         → Flap buy tax → Butterfly Vault
         → World Cup ends → Champion token triggers XLWC buyback
```

Eliminated teams' tokens are locked; the champion triggers a protocol-wide final buyback.

---

## Contract Addresses (XLayer Mainnet, chainId 196)

| Contract | Address |
|----------|---------|
| **XLWC** (Flap bonding curve token) | [`0xbc025cef3e0b7e85cf8b33f775fdc84ec93d7777`](https://www.oklink.com/xlayer/address/0xbc025cef3e0b7e85cf8b33f775fdc84ec93d7777) |
| **MatchPredictor v7** | [`0x9324F8b611A3aB4d47eD11289dce8C574cE8B96B`](https://www.oklink.com/xlayer/address/0x9324F8b611A3aB4d47eD11289dce8C574cE8B96B) |
| **FantasyLeague** | [`0x42E7188475Aa4EBa5C32644E385F9Bca08036397`](https://www.oklink.com/xlayer/address/0x42E7188475Aa4EBa5C32644E385F9Bca08036397) |
| **TeamTokenFactory** | [`0x8a3aa019bAb59C1E4f9Cd5C7d14b14098dBE422e`](https://www.oklink.com/xlayer/address/0x8a3aa019bAb59C1E4f9Cd5C7d14b14098dBE422e) |
| **ButterflyVault** | [`0x1EcE2432F887425B267781d8DDA037269529C92B`](https://www.oklink.com/xlayer/address/0x1EcE2432F887425B267781d8DDA037269529C92B) |
| Buy XLWC | [flap.sh/xlayer/0xbc025…](https://flap.sh/xlayer/0xbc025cef3e0b7e85cf8b33f775fdc84ec93d7777) |

---

## Repository Structure

```
xlayer-worldcup/
├── contracts/                  # Hardhat project (Solidity 0.8.24)
│   ├── contracts/
│   │   ├── MatchPredictor.sol  # Parlay prediction + AI agent staking (v7)
│   │   ├── FantasyLeague.sol   # Fantasy team competition
│   │   ├── TeamTokenFactory.sol
│   │   ├── TeamToken.sol       # Per-country ERC-20 with buyback
│   │   ├── ButterflyVault.sol  # Final XLWC buyback vault
│   │   └── WorldCupToken.sol   # (legacy, unused)
│   ├── scripts/
│   │   ├── deploy_match_predictor.ts
│   │   ├── deploy_fantasy_league.ts
│   │   └── ...
│   ├── deployments.json        # Live mainnet addresses
│   ├── hardhat.config.ts
│   └── .env.example            # Copy → .env and fill in keys
│
├── frontend/                   # React + Vite + wagmi
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Home.tsx        # Hero, stats, AI follow CTA
│   │   │   ├── Predict.tsx     # Round list, prediction UI, agent follow
│   │   │   ├── Fantasy.tsx     # Fantasy squad registration
│   │   │   ├── Teams.tsx       # Team token explorer
│   │   │   └── Bracket.tsx     # World Cup bracket viewer
│   │   ├── components/
│   │   │   ├── AgentStakePanel.tsx   # Stake / unstake for AI follow
│   │   │   ├── Header.tsx
│   │   │   └── StatsBar.tsx
│   │   ├── config/
│   │   │   ├── contracts.ts    # All ABIs + addresses
│   │   │   └── network.ts      # Chain config
│   │   ├── i18n/index.ts       # zh / en bilingual strings
│   │   └── data/teams.ts       # 48 teams metadata
│   └── ...
│
└── agent/                      # TypeScript AI agent (off-chain runner)
    ├── agent.ts                # Claude AI → on-chain predictions + Twitter posts
    ├── .env.example
    └── ...
```

---

## Getting Started

### Prerequisites

- Node.js ≥ 18
- An XLayer-compatible wallet (MetaMask recommended)
- OKB for gas (XLayer uses OKB)

### 1 — Contracts

```bash
cd contracts
cp .env.example .env
# Fill in DEPLOYER_PRIVATE_KEY and OKLINK_API_KEY

npm install
npx hardhat compile

# Deploy (mainnet already deployed — for local dev use hardhat node)
npx hardhat run scripts/deploy_match_predictor.ts --network xlayer_mainnet
```

### 2 — Frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173

# Production build
npm run build
```

The frontend reads contract addresses from `src/config/contracts.ts`. To switch to testnet:

```bash
VITE_CHAIN_ID=1952 npm run dev
```

### 3 — AI Agent

```bash
cd agent
cp .env.example .env
# Fill in DEPLOYER_PRIVKEY (owner of MatchPredictor) and ANTHROPIC_API_KEY

npm install

# Create a new prediction round (replace timestamps with actual deadlines)
ts-node agent.ts predict 1 2026-06-10T18:00:00Z

# Post AI commentary to X/Twitter after a match result
ts-node agent.ts comment 1

# Eliminate a team after group stage exit
ts-node agent.ts eliminate GER SCO

# Declare champion and trigger XLWC buyback
ts-node agent.ts champion ARG
```

---

## Smart Contract Details

### MatchPredictor v7

The core prediction contract. Key mechanisms:

**Prediction encoding** — two uint8 bitmasks per entry:
- `teamAWinMask`: bit i = 1 → predicted home win for match i
- `drawMask`: bit i = 1 → predicted draw for match i
- Neither bit → predicted away win

**Weight system:**
```
base_weight = 10,000
× 2 per correct underdog pick (stacks, no cap per upset)
× 1.5 if holding ≥ 100 winning team tokens
hard_cap = 30,000
```

**Agent staking gate:**
- Stake ≥ 500 XLWC → `isAgentStaker() = true` → access to `followAndPredict()`
- Refund pre-reserved at entry: `insurancePool ≥ totalReservedRefunds + newRefund` required before entry
- Win bonus capped at `insurancePool − totalReservedRefunds` (can never eat reserved refunds)

**v7 security invariants:**
- `rolloverPrize` blocked while `claimedCount < totalWinners` (prevents prize theft)
- `remaining = balance − staked − insurance − totalUnclaimedPrize` (cross-round safe)

### TeamToken

Each team token has a buy tax routed to ButterflyVault. On elimination, the token is locked (no new buys via factory). On championship, `executeBuyback()` swaps all vault XLWC back to OKB and back again — the final event of the tournament.

---

## Economics & Actuarial Notes

Insurance pool sustainability (agent accuracy p ≈ 40%):

```
Expected drain per follower per round
  = p × WinBonus + (1−p) × LossRefund
  = 0.40 × 30% + 0.60 × 15%
  = 12% + 9%
  = 21% of entry fee
```

Owner tops up insurance manually via `addInsurance()`. At current parameters:
- 100 followers at 100 XLWC entry fee → max drain ≈ 2,100 XLWC per round
- Keep insurance pool ≥ 5× expected drain for safety margin

---

## Tech Stack

| Layer | Stack |
|-------|-------|
| Smart contracts | Solidity 0.8.24, Hardhat, OpenZeppelin 5 |
| Frontend | React 18, Vite, Wagmi v2, Viem, TailwindCSS |
| Wallet | MetaMask, WalletConnect (via Reown AppKit) |
| AI Agent | TypeScript, Anthropic SDK (Claude 3), ethers.js v6 |
| Network | XLayer Mainnet (chainId 196, gas token OKB) |
| DEX | PotatoSwap V2 (27k+ pairs, dominant XLayer DEX) |
| Token launch | Flap.sh bonding curve |
| Deployment | Vercel (frontend) |

---

## Security

- All state-changing functions protected by `ReentrancyGuard`
- `SafeERC20` used for all token transfers
- `onlyOwner` on all admin functions (round management, insurance top-up, rollover)
- v7 actuarial fixes: see [contract source](contracts/contracts/MatchPredictor.sol) for full `@notice` documentation of each security invariant
- Private keys stored in `.env` (git-ignored), never hardcoded

---

## License

MIT

---

*Built on XLayer · Powered by Claude AI · ⚽ World Cup 2026*
