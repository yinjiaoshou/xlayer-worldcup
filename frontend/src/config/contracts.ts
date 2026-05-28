// ─── Contract addresses ───────────────────────────────────────────────────────
// XLayer Mainnet (chainId 196) — deployed 2026-05-25
// Deployer: 0x2C951158B7A4c46Bc0DE3160CAbFae1AAe0733e0
// DEX: PotatoSwap V2 (0x881fB2f98c13d521009464e7D1CBf16E1b394e8E)
export const CONTRACTS = {
  /** @deprecated Unused ERC20 deployment — NOT the token used in the DeFi flywheel.
   *  All contracts use XLWCFlap (Flap bonding curve token) instead. */
  WorldCupToken:    "0x674668F4fcC80EfB548eCB300e9BD5b0eB0C59eE" as `0x${string}`,
  XLWCFlap:         "0xbc025cef3e0b7e85cf8b33f775fdc84ec93d7777" as `0x${string}`, // XLWC — Flap bonding curve token (used by all contracts)
  ButterflyVault:   "0x1EcE2432F887425B267781d8DDA037269529C92B" as `0x${string}`,
  TeamTokenFactory: "0x8a3aa019bAb59C1E4f9Cd5C7d14b14098dBE422e" as `0x${string}`,
  FantasyLeague:    "0x42E7188475Aa4EBa5C32644E385F9Bca08036397" as `0x${string}`, // 梦幻阵容竞技
  MatchPredictor:   "0x28CFE99d248d40009Cdc239DFDa232390d8a06D2" as `0x${string}`, // 串关竞猜 v6 (agent staking gate)
};

// ─── ABIs ─────────────────────────────────────────────────────────────────────

export const XLWC_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "totalSupply",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "butterflyVault",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "setAMMPair",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "pair", type: "address" },
      { name: "value", type: "bool" },
    ],
    outputs: [],
  },
  {
    name: "setButterflyVault",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "_vault", type: "address" }],
    outputs: [],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export const VAULT_ABI = [
  {
    name: "vaultBalance",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "worldCupEnded",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "championToken",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "buybackExecuted",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "totalBoughtBack",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "executeBuyback",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    name: "endWorldCup",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "_championToken", type: "address" }],
    outputs: [],
  },
  {
    name: "emergencyWithdraw",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "token", type: "address" }],
    outputs: [],
  },
] as const;

export const TEAM_TOKEN_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "totalSupply",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "isEliminated",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "totalXLWCBurned",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "buybackThreshold",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "executeBuyback",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    name: "setAMMPair",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "pair", type: "address" },
      { name: "value", type: "bool" },
    ],
    outputs: [],
  },
  {
    name: "setBuybackThreshold",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "_threshold", type: "uint256" }],
    outputs: [],
  },
] as const;

export const FACTORY_ABI = [
  {
    name: "getAllTeams",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "name", type: "string" },
          { name: "symbol", type: "string" },
          { name: "countryCode", type: "string" },
          { name: "tokenAddress", type: "address" },
          { name: "isEliminated", type: "bool" },
          { name: "exists", type: "bool" },
        ],
      },
    ],
  },
  {
    name: "activeTeamCount",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "count", type: "uint256" }],
  },
  {
    name: "totalTeams",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "champion",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "tournamentEnded",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "eliminateTeam",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "_countryCode", type: "string" }],
    outputs: [],
  },
  {
    name: "eliminateTeams",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "_countryCodes", type: "string[]" }],
    outputs: [],
  },
  {
    name: "declareChampion",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "_countryCode", type: "string" }],
    outputs: [],
  },
] as const;

export const FANTASY_LEAGUE_ABI = [
  {
    name: "registerSquad",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "teamCodes", type: "string[]" }],
    outputs: [],
  },
  {
    name: "getSquad",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "player", type: "address" }],
    outputs: [
      { name: "teamCodes", type: "string[]" },
      { name: "score", type: "uint256" },
    ],
  },
  {
    name: "getScore",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "player", type: "address" }],
    outputs: [{ name: "score", type: "uint256" }],
  },
  {
    name: "getLeaderboard",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "players", type: "address[]" },
      { name: "scores", type: "uint256[]" },
    ],
  },
  {
    name: "claim",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    name: "isRegistered",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "player", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "entryFee",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "registrationDeadline",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "totalPrizePool",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "totalPlayers",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "finalized",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "prizeAmount",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "player", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "claimed",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "player", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;
