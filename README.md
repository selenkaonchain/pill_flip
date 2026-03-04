# VibeVault — DeFi Staking Dashboard on Bitcoin L1

> Stake tokens, earn rewards, auto-compound — all on Bitcoin Layer 1, powered by OP_NET.

![Bitcoin](https://img.shields.io/badge/Bitcoin-L1-orange?style=flat-square&logo=bitcoin&logoColor=white)
![OP_NET](https://img.shields.io/badge/OP__NET-Powered-blue?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-React-blue?style=flat-square&logo=typescript)

## What is VibeVault?

VibeVault is a DeFi staking dashboard built for Bitcoin Layer 1 using OP_NET. It lets users:

- **Connect** their OP_WALLET to the app
- **Stake** BTC tokens directly on Bitcoin L1
- **Earn** staking rewards with real-time tracking
- **Auto-Compound** rewards back into the staking vault
- **Track** detailed analytics: APY, reward history, transaction log

Built for the **OP_NET Vibecode Challenge — Week 2: The DeFi Signal**.

## Features

- **Wallet Integration** — Seamless OP_WALLET connection via `@btc-vision/walletconnect`
- **Staking Vault** — Stake/unstake with configurable lock periods
- **Auto-Compound** — Toggle automatic reward reinvestment
- **Live Analytics** — Real-time charts showing reward growth over time
- **Transaction History** — Full log of stakes, unstakes, rewards, and compounds
- **Protocol Stats** — TVL, APY, total stakers, block height from OP_NET
- **Dark Theme** — Professional Bitcoin-aesthetic UI with orange accents
- **Responsive** — Works on desktop and mobile

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19 + TypeScript |
| Build Tool | Vite |
| Blockchain | OP_NET (Bitcoin L1) |
| Wallet | OP_WALLET via `@btc-vision/walletconnect` |
| SDK | `opnet`, `@btc-vision/bitcoin`, `@btc-vision/transaction` |

## Getting Started

### Prerequisites
- Node.js >= 18
- [OP_WALLET browser extension](https://chromewebstore.google.com/detail/opwallet/pmbjpcmaaladnfpacpmhmnfmpklgbdjb)

### Install & Run
```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build for Production
```bash
npm run build
```

Output goes to `dist/` — deploy to IPFS, Vercel, or any static host.

## Screenshots

The dashboard features:
- Protocol overview with TVL, APY, staker count
- Personal staking positions with lock timers
- Cumulative reward chart with daily breakdown
- Full transaction history with color-coded types

## Competition

**OP_NET Vibecode Challenge — Week 2: The DeFi Signal**

- Theme: Build DeFi tools on Bitcoin L1
- Prize Pool: 9 Motocats + 45M $PILL
- All verified builders receive 250,000 $PILL

**#opnetvibecode** · [@opnetbtc](https://x.com/opnetbtc)

## License

MIT
