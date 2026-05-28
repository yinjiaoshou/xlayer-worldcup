import { useReadContract, useReadContracts } from "wagmi";
import { formatEther } from "viem";
import { CONTRACTS, VAULT_ABI, FACTORY_ABI, TEAM_TOKEN_ABI } from "../config/contracts";
import { ACTIVE_CHAIN_ID } from "../config/network";

function isDeployed(addr: string): boolean {
  return !!addr && addr !== "0x0000000000000000000000000000000000000000";
}

export interface OnChainTeam {
  name: string;
  symbol: string;
  countryCode: string;
  tokenAddress: `0x${string}`;
  isEliminated: boolean;
  exists: boolean;
}

/** XLWC balance sitting in ButterflyVault (in whole tokens). */
export function useVaultBalance(): { value: number | null; isError: boolean } {
  const { data, isError } = useReadContract({
    address: CONTRACTS.ButterflyVault,
    abi: VAULT_ABI,
    functionName: "vaultBalance",
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled: isDeployed(CONTRACTS.ButterflyVault), refetchInterval: 30_000 },
  });
  return {
    value: data != null ? Number(formatEther(data as bigint)) : null,
    isError,
  };
}

/** All 48 teams with live isEliminated status from the factory. */
export function useAllTeams(): {
  teams: OnChainTeam[];
  isLoading: boolean;
  isError: boolean;
} {
  const { data, isLoading, isError } = useReadContract({
    address: CONTRACTS.TeamTokenFactory,
    abi: FACTORY_ABI,
    functionName: "getAllTeams",
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled: isDeployed(CONTRACTS.TeamTokenFactory), refetchInterval: 30_000 },
  });

  // Filter out placeholder entries (exists=false) that could appear before all teams are deployed.
  const raw = (data as OnChainTeam[] | undefined) ?? [];
  const teams = raw.filter((t) => t.exists);

  return { teams, isLoading, isError };
}

/** Active team count derived from live team list. Returns null while loading. */
export function useActiveTeamCount(): number | null {
  const { teams, isLoading } = useAllTeams();
  if (isLoading || teams.length === 0) return null;
  return teams.filter((t) => !t.isEliminated).length;
}

/**
 * Aggregate totalXLWCBurned across all team token contracts in one multicall batch.
 * Returns null if contracts aren't deployed yet.
 */
export function useTotalXLWCBurned(
  teamAddresses: `0x${string}`[]
): { value: number | null; isError: boolean } {
  const contracts = teamAddresses.map((addr) => ({
    address: addr,
    abi: TEAM_TOKEN_ABI,
    functionName: "totalXLWCBurned" as const,
    chainId: ACTIVE_CHAIN_ID,
  }));

  const { data, isError } = useReadContracts({
    contracts,
    query: { enabled: teamAddresses.length > 0, refetchInterval: 30_000 },
  });

  if (!data) return { value: null, isError };

  let total = 0n;
  for (const r of data) {
    if (r.status === "success" && r.result != null) {
      total += r.result as bigint;
    }
  }
  return { value: Number(formatEther(total)), isError };
}
