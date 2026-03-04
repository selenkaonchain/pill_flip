import { useState, useEffect, useCallback, useRef } from 'react';
import { JSONRpcProvider, getContract, IOP20Contract, OP_20_ABI } from 'opnet';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { networks } from '@btc-vision/bitcoin';
import type { Network } from '@btc-vision/bitcoin';

/* ---- Network RPC endpoints ---- */
const RPC: Record<string, string> = {
  testnet: 'https://testnet.opnet.org',
  mainnet: 'https://mainnet.opnet.org',
  regtest: 'https://regtest.opnet.org',
};

function getNetworkName(network: Network | null): string {
  if (!network) return 'testnet';
  // WalletConnectNetwork extends Network and adds a `.network` string field
  const n = network as unknown as Record<string, unknown>;
  if (typeof n.network === 'string') return n.network;
  if (network.bech32 === 'bc') return 'mainnet';
  if (network.bech32 === 'tb') return 'testnet';
  if (network.bech32 === 'bcrt') return 'regtest';
  return 'testnet';
}

function getBitcoinNetwork(name: string): Network {
  if (name === 'mainnet') return networks.bitcoin;
  if (name === 'regtest') return networks.regtest;
  return networks.testnet;
}

export interface TokenInfo {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: bigint;
  userBalance: bigint;
}

export interface TxRecord {
  id: string;
  type: 'query' | 'transfer' | 'error';
  description: string;
  timestamp: number;
}

export function useBlockchain() {
  const wallet = useWalletConnect();

  const walletAddress = wallet.walletAddress ?? null;
  const walletNetwork = wallet.network ?? null;
  const walletInstance = wallet.walletInstance ?? null;
  // Use `as any` to bridge the Address type mismatch between
  // @btc-vision/walletconnect's bundled copy and the direct @btc-vision/transaction install
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walletAddr: any = wallet.address ?? null;
  const connecting = wallet.connecting;
  const openConnectModal = wallet.openConnectModal;
  const disconnectWallet = wallet.disconnect;

  // WalletBalance has .total, .confirmed, .unconfirmed (numbers in sats)
  const walletBalance = wallet.walletBalance ?? null;

  /* ---- derived ---- */
  const networkName = getNetworkName(walletNetwork);
  const btcNetwork: Network = walletNetwork ?? getBitcoinNetwork(networkName);
  const isConnected = Boolean(walletAddress);

  /* ---- state ---- */
  const [blockHeight, setBlockHeight] = useState<bigint | null>(null);
  const [loadingBlock, setLoadingBlock] = useState(false);
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [loadingToken, setLoadingToken] = useState(false);
  const [txLog, setTxLog] = useState<TxRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [transferring, setTransferring] = useState(false);

  const providerRef = useRef<JSONRpcProvider | null>(null);

  /* ---- helpers ---- */
  const log = useCallback((type: TxRecord['type'], description: string) => {
    setTxLog((prev) => [
      { id: crypto.randomUUID(), type, description, timestamp: Date.now() },
      ...prev.slice(0, 49),
    ]);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  /** Read-only JSONRpcProvider for the current network */
  const getProvider = useCallback((): JSONRpcProvider | null => {
    const rpc = RPC[networkName] || RPC.testnet;
    if (!providerRef.current) {
      try {
        providerRef.current = new JSONRpcProvider(rpc, btcNetwork);
      } catch (e) {
        console.error('Failed to create provider:', e);
        return null;
      }
    }
    return providerRef.current;
  }, [networkName, btcNetwork]);

  /* Reset provider when network changes */
  useEffect(() => {
    providerRef.current = null;
  }, [networkName]);

  /* ---- Fetch latest block height ---- */
  const fetchBlockHeight = useCallback(async () => {
    const p = getProvider();
    if (!p) return;
    setLoadingBlock(true);
    try {
      const height = await p.getBlockNumber();
      setBlockHeight(height);
    } catch (e: unknown) {
      console.error('getBlockNumber error:', e);
    } finally {
      setLoadingBlock(false);
    }
  }, [getProvider]);

  /* Auto-fetch on mount + interval */
  useEffect(() => {
    fetchBlockHeight();
    const iv = setInterval(fetchBlockHeight, 30_000);
    return () => clearInterval(iv);
  }, [fetchBlockHeight]);

  /* ---- Query OP20 token ---- */
  const queryToken = useCallback(
    async (contractAddress: string) => {
      const p = getProvider();
      if (!p) {
        setError('No RPC provider available');
        return;
      }
      setLoadingToken(true);
      setError(null);
      setTokenInfo(null);
      try {
        const contract = getContract<IOP20Contract>(
          contractAddress,
          OP_20_ABI,
          p,
          btcNetwork,
          walletAddr ?? undefined,
        );

        // Parallel read
        const [nameRes, symbolRes, decimalsRes, supplyRes] = await Promise.all([
          contract.name().catch(() => null),
          contract.symbol().catch(() => null),
          contract.decimals().catch(() => null),
          contract.totalSupply().catch(() => null),
        ]);

        const name = nameRes?.properties?.name ?? 'Unknown';
        const symbol = symbolRes?.properties?.symbol ?? '???';
        const decimals = decimalsRes?.properties?.decimals ?? 8;
        const totalSupply = supplyRes?.properties?.totalSupply ?? 0n;

        // If wallet connected, fetch user balance
        let userBalance = 0n;
        if (walletAddr) {
          try {
            const balRes = await contract.balanceOf(walletAddr);
            userBalance = balRes?.properties?.balance ?? 0n;
          } catch {
            // 0 balance or unsupported
          }
        }

        const info: TokenInfo = {
          address: contractAddress,
          name,
          symbol,
          decimals,
          totalSupply,
          userBalance,
        };
        setTokenInfo(info);
        log('query', `Queried ${symbol} (${name}) at ${contractAddress.slice(0, 12)}...`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(`Token query failed: ${msg}`);
        log('error', `Failed to query ${contractAddress.slice(0, 16)}...`);
      } finally {
        setLoadingToken(false);
      }
    },
    [getProvider, btcNetwork, walletAddr, log],
  );

  /* ---- Transfer OP20 tokens ---- */
  const transferToken = useCallback(
    async (contractAddress: string, recipientAddress: string, amount: bigint) => {
      if (!walletInstance?.web3) {
        setError('Wallet not connected or web3 provider unavailable');
        return;
      }
      const p = getProvider();
      if (!p) {
        setError('No RPC provider available');
        return;
      }

      setTransferring(true);
      setError(null);
      try {
        const contract = getContract<IOP20Contract>(
          contractAddress,
          OP_20_ABI,
          p,
          btcNetwork,
          walletAddr ?? undefined,
        );

        // 1) Simulate transfer (balanceOf takes Address, but transfer takes a string)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const simResult = await (contract as any).transfer(recipientAddress, amount);
        if (!simResult || !simResult.calldata) {
          throw new Error('Transaction simulation failed — no calldata returned');
        }

        // 2) Wallet extension signs and broadcasts
        const web3 = walletInstance.web3;
        const result = await web3.signAndBroadcastInteraction({
          calldata: simResult.calldata,
          to: contractAddress,
          network: btcNetwork,
          feeRate: 10,
          priorityFee: 1000n,
          gasSatFee: simResult.estimatedSatGas ?? 10000n,
          utxos: [],
        } as any);

        const txId = result?.[3] ?? 'submitted';
        log('transfer', `Sent tokens → tx: ${String(txId).slice(0, 16)}...`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(`Transfer failed: ${msg}`);
        log('error', `Transfer failed: ${msg}`);
      } finally {
        setTransferring(false);
      }
    },
    [walletInstance, getProvider, btcNetwork, walletAddr, log],
  );

  return {
    // Wallet
    isConnected,
    walletAddress,
    walletBalance,
    networkName,
    connecting,
    connect: openConnectModal,
    disconnect: disconnectWallet,

    // Chain data
    blockHeight,
    loadingBlock,
    fetchBlockHeight,

    // Token
    tokenInfo,
    loadingToken,
    queryToken,

    // Transfer
    transferring,
    transferToken,

    // Log
    txLog,
    error,
    clearError,
  };
}
