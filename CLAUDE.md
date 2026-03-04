# CLAUDE.md — VibeVault: DeFi Staking Dashboard

## Project Description
VibeVault is a DeFi staking dashboard built on Bitcoin Layer 1 with OP_NET.
Users connect their OP_WALLET, stake tokens, earn rewards, and auto-compound — all on Bitcoin.

## Package Rules
### ALWAYS Use
- `opnet` — OPNet SDK, JSONRpcProvider, getContract, ABIs
- `@btc-vision/bitcoin` — Bitcoin library (OPNet fork)
- `@btc-vision/transaction` — Transaction types and ABI data types
- `@btc-vision/walletconnect` — Wallet connection modal
- `react` — UI framework
- `vite` — Build tool and dev server

### NEVER Use
- `bitcoinjs-lib`, `ethers`, `web3`, `@metamask/sdk`
- `window.ethereum`
- `express`

## Wallet Integration
- Use `@btc-vision/walletconnect` for the connection modal
- ALWAYS include the WalletConnect popup CSS fix
- signer and mldsaSigner are NULL on frontend — wallet extension signs

## Contract Interaction
- Create SEPARATE `JSONRpcProvider` for read operations
- Testnet: `https://testnet.opnet.org`
- ALWAYS simulate before sending
- NEVER put private keys in frontend code

## Build and Dev
- `npm install` — install dependencies
- `npm run dev` — start dev server
- `npm run build` — production build to `dist/`
