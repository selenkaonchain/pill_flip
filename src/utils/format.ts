/**
 * Formatting utilities for VibeVault
 */

/** Truncate a Bitcoin/OP_NET address for display */
export function truncateAddress(address: string, startChars = 8, endChars = 6): string {
  if (!address) return '';
  if (address.length <= startChars + endChars) return address;
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

/** Format a number with commas */
export function formatNumber(num: number, decimals = 2): string {
  if (num >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(decimals) + 'B';
  }
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(decimals) + 'M';
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(decimals) + 'K';
  }
  return num.toFixed(decimals);
}

/** Format satoshis to BTC string */
export function satsToBtc(sats: number): string {
  return (sats / 100_000_000).toFixed(8);
}

/** Format bigint token amount with decimals */
export function formatTokenAmount(amount: bigint, decimals: number = 8): string {
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const fraction = amount % divisor;
  const fractionStr = fraction.toString().padStart(decimals, '0').slice(0, 4);
  return `${whole.toLocaleString()}.${fractionStr}`;
}

/** Format USD value */
export function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Format percentage */
export function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

/** Get relative time string */
export function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
