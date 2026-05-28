import { createConfig, http } from "wagmi";
import { injected, metaMask } from "wagmi/connectors";
import { defineChain } from "viem";

export const xlayerMainnet = defineChain({
  id: 196,
  name: "X Layer",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.xlayer.tech", "https://xlayerrpc.okx.com"] },
    public:  { http: ["https://rpc.xlayer.tech", "https://xlayerrpc.okx.com"] },
  },
  blockExplorers: {
    default: { name: "OKLink", url: "https://www.oklink.com/xlayer" },
  },
});

export const xlayerTestnet = defineChain({
  id: 1952,
  name: "X Layer Testnet",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://testrpc.xlayer.tech", "https://xlayertestpublicropc.okx.com"] },
    public:  { http: ["https://testrpc.xlayer.tech", "https://xlayertestpublicropc.okx.com"] },
  },
  blockExplorers: {
    default: { name: "OKLink Testnet", url: "https://www.oklink.com/xlayer-test" },
  },
  testnet: true,
});

export const wagmiConfig = createConfig({
  // Mainnet first → users default-connect to XLayer Mainnet (chainId 196).
  chains: [xlayerMainnet, xlayerTestnet],
  connectors: [
    injected({ target: "metaMask" }),
    metaMask(),
    injected(),
  ],
  transports: {
    [xlayerMainnet.id]: http(),
    [xlayerTestnet.id]: http(),
  },
});
