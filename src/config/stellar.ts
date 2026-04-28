// src/config/stellar.ts
// Configures Stellar/Soroban SDK clients and shared helpers

import { Networks, SorobanRpc, Horizon } from '@stellar/stellar-sdk';
import { env } from './env';

export const NETWORK_PASSPHRASE =
  env.STELLAR_NETWORK === 'mainnet'   ? Networks.PUBLIC   :
  env.STELLAR_NETWORK === 'futurenet' ? Networks.FUTURENET :
  Networks.TESTNET;

export const sorobanServer = new SorobanRpc.Server(env.SOROBAN_RPC_URL, {
  allowHttp: env.NODE_ENV !== 'production',
});

export const horizonServer = new Horizon.Server(env.HORIZON_URL, {
  allowHttp: env.NODE_ENV !== 'production',
});

/** Convert stroops (i128) to XLM */
export function stroopsToXlm(stroops: bigint | number): number {
  return Number(stroops) / 10_000_000;
}

/** Convert XLM to stroops */
export function xlmToStroops(xlm: number): bigint {
  return BigInt(Math.round(xlm * 10_000_000));
}

/** Shorten a Stellar address for display */
export function shortAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Validate a Stellar address (basic G… check) */
export function isValidStellarAddress(address: string): boolean {
  return /^G[A-Z2-7]{55}$/.test(address);
}
