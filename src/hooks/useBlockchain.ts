import { useState, useCallback, useRef, useEffect } from 'react';
import { JSONRpcProvider, getContract, OP_20_ABI, UTXO } from 'opnet';
import type { IOP20Contract } from 'opnet';
import { networks, fromBech32 } from '@btc-vision/bitcoin';
import { Address, EcKeyPair, QuantumBIP32Factory, QuantumDerivationPath, TransactionFactory } from '@btc-vision/transaction';
import { useWalletConnect } from '@btc-vision/walletconnect';

const NETWORK = networks.opnetTestnet;
const RPC_URL = 'https://testnet.opnet.org';

// $PILL token contract on OP_NET testnet
export const PILL_CONTRACT = '0xb09fc29c112af8293539477e23d8df1d3126639642767d707277131352040cbb';

// House wallet — receives lost bets, pays out wins
export const HOUSE_ADDRESS = 'opt1pqyq9pjq27a24fy092vy86gzglmr389fvns7ftk8csxecjj5qvytszyycdv';

// House PILL address (32-byte OP_NET identity) — the contract sees this as the balance holder
const HOUSE_PILL_ADDRESS = '0xcfeca746d789519e3135deceef6c03958219768baa3e96938eb5142b08f08e61';

// House WIF for automated payouts (TESTNET ONLY — never do this on mainnet!)
const HOUSE_WIF = 'cPWbKq8daqgvhkawGdXN2vsmet6MD5HrSmDkKStebPpaK4u8kSh7';

interface BlockData {
    height: number;
    hash: string;
}

export interface PillInfo {
    name: string;
    symbol: string;
    decimals: number;
    balance: bigint;
}

export interface DebugInfo {
    walletAddress: string | null;
    publicKey: string | null;
    mldsaPublicKey: string | null;
    hashedMLDSAKey: string | null;
    addressObj: string; // 'present' | 'null'
    addressP2OP: string | null; // wc.address?.p2op(NETWORK)
    addressHex: string | null; // wc.address?.toHex()
    metadataResult: string;
    balanceStrategy: string;
    balanceResult: string;
    errors: string[];
}

export function useBlockchain() {
    const wc = useWalletConnect();
    const providerRef = useRef<JSONRpcProvider | null>(null);

    const [blockData, setBlockData] = useState<BlockData | null>(null);
    const [pillInfo, setPillInfo] = useState<PillInfo | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string>('');
    const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);

    function getProvider(): JSONRpcProvider {
        if (!providerRef.current) {
            providerRef.current = new JSONRpcProvider({
                url: RPC_URL,
                network: NETWORK,
            });
        }
        return providerRef.current;
    }

    // Derived wallet state from WalletConnect context
    const connected = !!wc.walletAddress;
    const walletAddress = wc.walletAddress ?? '';
    const walletBalance = wc.walletBalance;
    const btcTotal = walletBalance?.total ?? 0;

    const connectWallet = useCallback(() => {
        wc.openConnectModal();
    }, [wc]);

    const disconnectWallet = useCallback(() => {
        wc.disconnect();
        setPillInfo(null);
        setDebugInfo(null);
    }, [wc]);

    const fetchBlockData = useCallback(async (): Promise<BlockData | null> => {
        try {
            const provider = getProvider();
            const height = await provider.getBlockNumber();
            const block = await provider.getBlock(height);
            const data: BlockData = {
                height: Number(height),
                hash: block?.hash ?? '',
            };
            setBlockData(data);
            return data;
        } catch (err) {
            console.warn('Block fetch error:', err);
            return null;
        }
    }, []);

    const loadPillBalance = useCallback(async (): Promise<PillInfo | null> => {
        const dbg: DebugInfo = {
            walletAddress: wc.walletAddress,
            publicKey: wc.publicKey ? (wc.publicKey.slice(0, 16) + '...') : null,
            mldsaPublicKey: (wc as any).mldsaPublicKey ? ((wc as any).mldsaPublicKey.slice(0, 16) + '...') : null,
            hashedMLDSAKey: (wc as any).hashedMLDSAKey ? ((wc as any).hashedMLDSAKey.slice(0, 16) + '...') : null,
            addressObj: wc.address ? 'present (' + wc.address.length + ' bytes)' : 'null',
            addressP2OP: null,
            addressHex: null,
            metadataResult: 'pending',
            balanceStrategy: 'none',
            balanceResult: 'pending',
            errors: [],
        };

        // Try to get debug info from wc.address
        if (wc.address) {
            try { dbg.addressHex = wc.address.toHex().slice(0, 20) + '...'; } catch { /* skip */ }
            try { dbg.addressP2OP = wc.address.p2op(NETWORK); } catch { /* skip */ }
        }

        if (!wc.walletAddress) {
            dbg.errors.push('No wallet address');
            setDebugInfo(dbg);
            return null;
        }

        try {
            setLoading(true);
            setError('');
            const provider = getProvider();

            const contract = getContract<IOP20Contract>(
                PILL_CONTRACT,
                OP_20_ABI,
                provider,
                NETWORK,
                wc.address ?? undefined,
            );

            // --- Token metadata ---
            let name = 'PILL';
            let symbol = 'PILL';
            let decimals = 8;

            // Try metadata() first (single call)
            try {
                const meta = await contract.metadata();
                name = meta.properties.name || name;
                symbol = meta.properties.symbol || symbol;
                decimals = Number(meta.properties.decimals ?? 8);
                dbg.metadataResult = `OK: ${name} (${symbol}), ${decimals} dec`;
            } catch (e: any) {
                dbg.metadataResult = `FAIL: ${e?.message?.slice(0, 80) || e}`;
                // Fallback to individual calls
                try {
                    const nr = await contract.name();
                    name = nr.properties.name || name;
                    dbg.metadataResult += ` | name OK: ${name}`;
                } catch (e2: any) {
                    dbg.errors.push(`name(): ${e2?.message?.slice(0, 60) || e2}`);
                }
                try {
                    const sr = await contract.symbol();
                    symbol = sr.properties.symbol || symbol;
                } catch (e2: any) {
                    dbg.errors.push(`symbol(): ${e2?.message?.slice(0, 60) || e2}`);
                }
                try {
                    const dr = await contract.decimals();
                    decimals = Number(dr.properties.decimals ?? 8);
                } catch (e2: any) {
                    dbg.errors.push(`decimals(): ${e2?.message?.slice(0, 60) || e2}`);
                }
            }

            // --- Balance: try multiple strategies ---
            let balance = 0n;
            let balanceFound = false;

            // === STRATEGY A: Use wc.address directly ===
            if (wc.address && !balanceFound) {
                try {
                    const bal = await contract.balanceOf(wc.address);
                    if ('error' in bal) {
                        dbg.errors.push(`balanceOf(wc.address) returned error: ${(bal as any).error}`);
                    } else {
                        balance = bal.properties.balance ?? 0n;
                        dbg.balanceStrategy = 'A: wc.address';
                        dbg.balanceResult = balance.toString();
                        balanceFound = true;
                    }
                } catch (e: any) {
                    dbg.errors.push(`A wc.address: ${e?.message?.slice(0, 100) || e}`);
                }
            }

            // === STRATEGY B: getPublicKeyInfo → Address ===
            if (!balanceFound) {
                try {
                    const resolved = await provider.getPublicKeyInfo(wc.walletAddress, false);
                    if (resolved) {
                        dbg.errors.push(`B resolved addr: ${resolved.length} bytes`);
                        const bal = await contract.balanceOf(resolved);
                        if ('error' in bal) {
                            dbg.errors.push(`B balanceOf returned error: ${(bal as any).error}`);
                        } else {
                            balance = bal.properties.balance ?? 0n;
                            dbg.balanceStrategy = 'B: getPublicKeyInfo';
                            dbg.balanceResult = balance.toString();
                            balanceFound = true;
                        }
                    } else {
                        dbg.errors.push('B getPublicKeyInfo returned undefined');
                    }
                } catch (e: any) {
                    dbg.errors.push(`B getPublicKeyInfo: ${e?.message?.slice(0, 100) || e}`);
                }
            }

            // === STRATEGY C: Build Address from mldsaPublicKey ===
            if (!balanceFound && (wc as any).mldsaPublicKey) {
                try {
                    const mldsaKey = (wc as any).mldsaPublicKey as string;
                    const addr = Address.fromString(mldsaKey, wc.publicKey || undefined);
                    const bal = await contract.balanceOf(addr);
                    if ('error' in bal) {
                        dbg.errors.push(`C balanceOf returned error: ${(bal as any).error}`);
                    } else {
                        balance = bal.properties.balance ?? 0n;
                        dbg.balanceStrategy = 'C: mldsaPublicKey';
                        dbg.balanceResult = balance.toString();
                        balanceFound = true;
                    }
                } catch (e: any) {
                    dbg.errors.push(`C mldsaKey: ${e?.message?.slice(0, 100) || e}`);
                }
            }

            // === STRATEGY D: Build Address from hashedMLDSAKey (raw 32 bytes) ===
            if (!balanceFound && (wc as any).hashedMLDSAKey) {
                try {
                    const hashed = (wc as any).hashedMLDSAKey as string;
                    const hex = hashed.startsWith('0x') ? hashed.slice(2) : hashed;
                    const bytes = new Uint8Array(hex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
                    const addr = Address.wrap(bytes);
                    const bal = await contract.balanceOf(addr);
                    if ('error' in bal) {
                        dbg.errors.push(`D balanceOf returned error: ${(bal as any).error}`);
                    } else {
                        balance = bal.properties.balance ?? 0n;
                        dbg.balanceStrategy = 'D: hashedMLDSAKey';
                        dbg.balanceResult = balance.toString();
                        balanceFound = true;
                    }
                } catch (e: any) {
                    dbg.errors.push(`D hashedMLDSA: ${e?.message?.slice(0, 100) || e}`);
                }
            }

            // === STRATEGY E: Build Address from classical publicKey only ===
            if (!balanceFound && wc.publicKey) {
                try {
                    const hex = wc.publicKey.startsWith('0x') ? wc.publicKey.slice(2) : wc.publicKey;
                    const bytes = new Uint8Array(hex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
                    const addr = new Address(bytes);
                    const bal = await contract.balanceOf(addr);
                    if ('error' in bal) {
                        dbg.errors.push(`E balanceOf returned error: ${(bal as any).error}`);
                    } else {
                        balance = bal.properties.balance ?? 0n;
                        dbg.balanceStrategy = 'E: publicKey→Address';
                        dbg.balanceResult = balance.toString();
                        balanceFound = true;
                    }
                } catch (e: any) {
                    dbg.errors.push(`E publicKey: ${e?.message?.slice(0, 100) || e}`);
                }
            }

            if (!balanceFound) {
                dbg.balanceStrategy = 'ALL FAILED';
                dbg.balanceResult = '0 (no strategy worked)';
            }

            const info: PillInfo = { name, symbol, decimals, balance };
            setPillInfo(info);
            setDebugInfo(dbg);
            console.log('[PILL] Debug:', dbg);
            return info;
        } catch (err: any) {
            const msg = err?.message || 'Failed to load PILL balance';
            dbg.errors.push(`FATAL: ${msg.slice(0, 120)}`);
            setError(msg);
            setDebugInfo(dbg);
            return null;
        } finally {
            setLoading(false);
        }
    }, [wc.address, wc.walletAddress, wc.publicKey, (wc as any).mldsaPublicKey, (wc as any).hashedMLDSAKey]);

    /**
     * Transfer PILL tokens to the house address (on loss) or from house (on win).
     * On loss: user signs a transfer of `amount` PILL to HOUSE_ADDRESS.
     * Returns the tx receipt or throws.
     */
    const transferPillToHouse = useCallback(async (amount: bigint): Promise<string> => {
        if (!wc.walletAddress || !wc.address) {
            throw new Error('Wallet not connected or Address not available');
        }

        const provider = getProvider();

        // Create contract with sender
        const contract = getContract<IOP20Contract>(
            PILL_CONTRACT,
            OP_20_ABI,
            provider,
            NETWORK,
            wc.address,
        );

        // Resolve house address → Address object
        let houseAddr: Address | undefined;
        try {
            houseAddr = await provider.getPublicKeyInfo(HOUSE_ADDRESS, false);
        } catch (e) {
            console.warn('[PILL] getPublicKeyInfo for house failed:', e);
        }

        if (!houseAddr) {
            // Decode opt1... bech32m → raw bytes → Address.wrap()
            const decoded = fromBech32(HOUSE_ADDRESS);
            houseAddr = Address.wrap(decoded.data);
        }

        console.log('[PILL] Simulating transfer of', amount.toString(), 'to house...');
        const simulation = await contract.transfer(houseAddr, amount);

        if (simulation.revert) {
            throw new Error(`Transfer would fail: ${simulation.revert}`);
        }

        console.log('[PILL] Sending transaction (wallet will prompt)...');
        const receipt = await simulation.sendTransaction({
            signer: wc.signer ?? null,
            mldsaSigner: null,
            refundTo: wc.walletAddress,
            maximumAllowedSatToSpend: 100000n,
            feeRate: 10,
            network: NETWORK,
        });

        console.log('[PILL] Transfer TX:', receipt);
        return typeof receipt === 'object' && receipt !== null
            ? JSON.stringify(receipt)
            : String(receipt);
    }, [wc.address, wc.walletAddress, wc.signer]);

    /**
     * House pays out 2x the bet to the player (on win).
     * Uses house WIF to sign directly in the browser — TESTNET ONLY.
     *
     * ARCHITECTURE: The opnet SDK bundles its OWN copy of TransactionFactory in vendors.js.
     * That internal factory's detectInteractionOPWallet() checks window.opnet.web3 and
     * routes through the OP_WALLET browser extension (which uses BroadcastChannel.postMessage
     * that can't serialize UTXO lazy getters). We CANNOT monkey-patch that internal copy.
     *
     * Solution: Use our OWN TransactionFactory from @btc-vision/transaction directly,
     * call signInteraction() ourselves (bypassing the opnet CallResult flow entirely),
     * then broadcast raw hex via provider.sendRawTransaction().
     */
    const payoutFromHouse = useCallback(async (playerBetAmount: bigint): Promise<string> => {
        const provider = getProvider();

        // Create classical house signer from WIF
        const houseSigner = EcKeyPair.fromWIF(HOUSE_WIF, NETWORK);

        // Create ML-DSA (quantum) signer from the house private key as seed
        const housePrivKeyBytes = houseSigner.privateKey!;
        const quantumMaster = QuantumBIP32Factory.fromSeed(
            housePrivKeyBytes,
            NETWORK,
        );
        const houseMldsaSigner = quantumMaster.derivePath(QuantumDerivationPath.STANDARD);

        // Build house Address with BOTH the known 32-byte PILL address AND the classical public key
        const classicalPubHex = '0x' + Array.from(new Uint8Array(houseSigner.publicKey)).map(b => b.toString(16).padStart(2, '0')).join('');
        const houseAddress = Address.fromString(HOUSE_PILL_ADDRESS, classicalPubHex);

        // Create contract with house as sender
        const contract = getContract<IOP20Contract>(
            PILL_CONTRACT,
            OP_20_ABI,
            provider,
            NETWORK,
            houseAddress,
        );

        // Resolve player address
        let playerAddr: Address | undefined;
        if (wc.address) {
            playerAddr = wc.address;
        } else if (wc.walletAddress) {
            try {
                playerAddr = await provider.getPublicKeyInfo(wc.walletAddress, false);
            } catch { /* skip */ }
        }

        if (!playerAddr) {
            throw new Error('Cannot resolve player address for payout');
        }

        // Payout = 2x the bet
        const payoutAmount = playerBetAmount * 2n;

        console.log('[HOUSE] Simulating payout:', payoutAmount.toString(), 'PILL →', wc.walletAddress);
        const simulation = await contract.transfer(playerAddr, payoutAmount);

        if (simulation.revert) {
            throw new Error(`House payout reverted: ${simulation.revert}`);
        }

        // Fetch UTXOs: clean cache, then fetch with optimize=false
        // (btc_getUTXOs returns EMPTY with optimize=true for this address)
        console.log('[HOUSE] Fetching UTXOs with optimize=false...');
        provider.utxoManager.clean(HOUSE_ADDRESS);

        let houseUtxos: any[];
        try {
            houseUtxos = await provider.utxoManager.getUTXOs({
                address: HOUSE_ADDRESS,
                optimize: false,
                mergePendingUTXOs: true,
                filterSpentUTXOs: true,
            });
        } catch (e: any) {
            console.warn('[HOUSE] SDK getUTXOs failed, trying manual RPC...', e?.message);
            houseUtxos = [];
        }

        // Fallback: manual RPC fetch
        if (!houseUtxos || houseUtxos.length === 0) {
            console.log('[HOUSE] Manual RPC fetch...');
            const rpcResp = await fetch(RPC_URL + '/api/v1/json-rpc', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0', id: 1,
                    method: 'btc_getUTXOs',
                    params: [HOUSE_ADDRESS, false],
                }),
            });
            const rpcJson = await rpcResp.json();
            const rawTxs = rpcJson.result?.raw || [];
            const allRaw = [...(rpcJson.result?.confirmed || []), ...(rpcJson.result?.pending || [])];
            houseUtxos = allRaw.map((utxo: any) => new UTXO({ ...utxo, raw: rawTxs[utxo.raw] }, false));
        }

        // Force-materialize ALL lazy getters on UTXOs so they are plain data
        for (const utxo of houseUtxos) {
            if (utxo.nonWitnessUtxo) {
                const materialized = new Uint8Array(utxo.nonWitnessUtxo);
                Object.defineProperty(utxo, 'nonWitnessUtxo', {
                    value: materialized,
                    writable: false,
                    enumerable: true,
                    configurable: true,
                });
            }
        }

        console.log('[HOUSE] UTXOs:', houseUtxos.length, ', total:', houseUtxos.reduce((s: bigint, u: any) => s + u.value, 0n).toString(), 'sats');

        if (!houseUtxos || houseUtxos.length === 0) {
            throw new Error('House wallet has no UTXOs available. Please fund the house wallet.');
        }

        // Get challenge for the transaction
        const challenge = await provider.getChallenge();

        // Extract calldata and gas info from simulation for direct signing
        // (simulation object has these set by the contract.transfer() call)
        const sim = simulation as any;
        const contractAddr = sim.address?.toHex?.() || PILL_CONTRACT;
        const calldata = sim.calldata;
        const estimatedSatGas = sim.estimatedSatGas || 0n;

        if (!calldata) {
            throw new Error('No calldata from simulation — transfer simulation may have failed silently');
        }

        // Build interaction parameters for direct TransactionFactory signing
        // This bypasses opnet's internal factory (which uses vendors.js copy with OP_WALLET detection)
        const interactionParams: any = {
            contract: contractAddr,
            calldata: calldata,
            priorityFee: 0n,
            gasSatFee: estimatedSatGas,
            feeRate: 10,
            from: HOUSE_ADDRESS,
            utxos: houseUtxos,
            to: sim.to || PILL_CONTRACT,
            network: NETWORK,
            optionalInputs: [],
            optionalOutputs: [],
            anchor: false,
            txVersion: 2,
            linkMLDSAPublicKeyToAddress: true,
            revealMLDSAPublicKey: false,
            subtractExtraUTXOFromAmountRequired: false,
            // Backend-style signing: provide both signers directly
            signer: houseSigner,
            challenge: challenge,
            mldsaSigner: houseMldsaSigner,
        };

        // Use OUR OWN TransactionFactory from @btc-vision/transaction
        // (NOT the opnet vendors.js copy that has OP_WALLET detection we can't patch)
        const ourFactory = new TransactionFactory();

        // Monkey-patch OUR factory's detectInteractionOPWallet to return null
        // (this instance uses @btc-vision/transaction's prototype which we CAN control)
        (ourFactory as any).detectInteractionOPWallet = async () => null;

        console.log('[HOUSE] Direct signing with our TransactionFactory (bypassing opnet internal factory)...');
        const txResult = await ourFactory.signInteraction(interactionParams);

        // Broadcast funding transaction first, then interaction transaction
        if (txResult.fundingTransaction) {
            console.log('[HOUSE] Broadcasting funding TX...');
            const fundResult = await provider.sendRawTransaction(txResult.fundingTransaction, false);
            if (!fundResult || fundResult.error) {
                throw new Error(`Funding TX failed: ${fundResult?.error || 'Unknown error'}`);
            }
            if (!fundResult.success) {
                throw new Error(`Funding TX rejected: ${fundResult.result || 'Unknown error'}`);
            }
            console.log('[HOUSE] Funding TX sent successfully');
        }

        console.log('[HOUSE] Broadcasting interaction TX...');
        const interResult = await provider.sendRawTransaction(txResult.interactionTransaction, false);
        if (!interResult || interResult.error) {
            throw new Error(`Interaction TX failed: ${interResult?.error || 'Unknown error'}`);
        }
        if (!interResult.success) {
            throw new Error(`Interaction TX rejected: ${interResult.result || 'Unknown error'}`);
        }

        console.log('[HOUSE] Payout TX ID:', interResult.result);
        return interResult.result || 'tx_sent';
    }, [wc.address, wc.walletAddress]);

    // Fetch block on mount and periodically
    useEffect(() => {
        fetchBlockData();
        const interval = setInterval(fetchBlockData, 30000);
        return () => clearInterval(interval);
    }, [fetchBlockData]);

    // Auto-load PILL balance when wallet connects
    useEffect(() => {
        if (connected && wc.walletAddress) {
            loadPillBalance();
        }
    }, [connected, wc.walletAddress, loadPillBalance]);

    return {
        connected,
        walletAddress,
        btcTotal,
        blockData,
        pillInfo,
        loading,
        error,
        debugInfo,
        connectWallet,
        disconnectWallet,
        fetchBlockData,
        loadPillBalance,
        transferPillToHouse,
        payoutFromHouse,
        setError,
    };
}
