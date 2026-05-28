/**
 * Central network configuration — single source of truth.
 *
 * To switch from testnet to mainnet before launch:
 *   1. Change ACTIVE_CHAIN_ID below to 196
 *   2. Update CONTRACTS in contracts.ts with mainnet addresses
 *   3. That's it — all other files import from here.
 */

/** Active chain: 1952 = XLayer Testnet | 196 = XLayer Mainnet
 *  Override at build time with VITE_CHAIN_ID=1952 for testnet deployments. */
export const ACTIVE_CHAIN_ID: number =
  import.meta.env.VITE_CHAIN_ID ? Number(import.meta.env.VITE_CHAIN_ID) : 196;

/** Block explorer base URL for the active chain. */
export const EXPLORER_BASE: string =
  ACTIVE_CHAIN_ID === 196
    ? "https://www.oklink.com/xlayer"
    : "https://www.oklink.com/xlayer-test";

/**
 * Chain ID used in OKX DEX swap buy-links.
 * Always mainnet (196) — OKX DEX only serves mainnet assets.
 */
export const OKX_CHAIN_ID: number = 196;

/**
 * Flap.sh bonding curve URL for XLWC token.
 * Used in multiple "Buy XLWC" CTAs across the app.
 */
export const XLWC_BUY_URL =
  "https://flap.sh/token/0xbc025cef3e0b7e85cf8b33f775fdc84ec93d7777";
