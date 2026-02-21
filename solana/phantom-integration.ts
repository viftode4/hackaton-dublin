/**
 * Orbital Atlas — Phantom Wallet Integration
 *
 * Drop-in module for the React frontend (P1).
 * Supports two minting flows:
 *   1. Service wallet (default) — calls POST /mint on our Rust backend
 *   2. User wallet (Phantom) — user signs the memo tx in-browser
 *
 * Usage:
 *   import { connectWallet, mintViaService, mintViaPhantom, getWalletStatus } from './phantom-integration';
 */

// --- Types ---

export interface MintPayload {
  location_id: string;
  name?: string;
  capacity_mw?: number;
  grade?: string;
  report_hash?: string;
}

export interface MintResult {
  signature: string;
  explorer_url: string;
  memo_content: Record<string, unknown>;
}

export interface WalletStatus {
  connected: boolean;
  publicKey: string | null;
  isPhantomInstalled: boolean;
}

// --- Constants ---

const SOLANA_MINT_API = import.meta.env.VITE_SOLANA_API_URL || 'http://localhost:3001';
const MEMO_PROGRAM_ID = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
const DEVNET_RPC = 'https://api.devnet.solana.com';

// --- Phantom Detection ---

function getPhantomProvider(): PhantomProvider | null {
  if (typeof window === 'undefined') return null;
  const phantom = (window as any).phantom?.solana;
  if (phantom?.isPhantom) return phantom;
  return null;
}

interface PhantomProvider {
  isPhantom: boolean;
  publicKey: { toBase58(): string; toBytes(): Uint8Array } | null;
  isConnected: boolean;
  connect(): Promise<{ publicKey: { toBase58(): string } }>;
  disconnect(): Promise<void>;
  signTransaction(tx: any): Promise<any>;
}

// --- Wallet Connection ---

export function getWalletStatus(): WalletStatus {
  const provider = getPhantomProvider();
  return {
    connected: provider?.isConnected ?? false,
    publicKey: provider?.publicKey?.toBase58() ?? null,
    isPhantomInstalled: provider !== null,
  };
}

export async function connectWallet(): Promise<string> {
  const provider = getPhantomProvider();
  if (!provider) {
    window.open('https://phantom.app/', '_blank');
    throw new Error('Phantom wallet not installed. Opening install page.');
  }

  const resp = await provider.connect();
  return resp.publicKey.toBase58();
}

export async function disconnectWallet(): Promise<void> {
  const provider = getPhantomProvider();
  if (provider?.isConnected) {
    await provider.disconnect();
  }
}

// --- Flow 1: Service Wallet (simple API call) ---

export async function mintViaService(payload: MintPayload): Promise<MintResult> {
  const resp = await fetch(`${SOLANA_MINT_API}/mint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `Mint failed: ${resp.status}`);
  }

  return resp.json();
}

// --- Flow 2: User Wallet (Phantom signs) ---

export async function mintViaPhantom(payload: MintPayload): Promise<MintResult> {
  const provider = getPhantomProvider();
  if (!provider?.isConnected || !provider.publicKey) {
    throw new Error('Phantom wallet not connected. Call connectWallet() first.');
  }

  // We need @solana/web3.js in the frontend for this flow.
  // Import dynamically to avoid bundling if not used.
  const { Connection, Transaction, TransactionInstruction, PublicKey } =
    await import('@solana/web3.js');

  const connection = new Connection(DEVNET_RPC, 'confirmed');

  // Build memo content (same structure as Rust service)
  const memo = JSON.stringify({
    type: 'orbital-atlas-dc-record',
    version: 1,
    location_id: payload.location_id,
    name: payload.name ?? null,
    capacity_mw: payload.capacity_mw ?? null,
    feasibility_grade: payload.grade ?? null,
    timestamp: new Date().toISOString(),
    report_hash: payload.report_hash ?? null,
  });

  const memoInstruction = new TransactionInstruction({
    keys: [{ pubkey: provider.publicKey as any, isSigner: true, isWritable: false }],
    programId: new PublicKey(MEMO_PROGRAM_ID),
    data: Buffer.from(memo, 'utf-8'),
  });

  const tx = new Transaction().add(memoInstruction);
  tx.feePayer = provider.publicKey as any;
  tx.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash;

  // User signs in Phantom popup
  const signedTx = await provider.signTransaction(tx);
  const signature = await connection.sendRawTransaction(signedTx.serialize());
  await connection.confirmTransaction(signature, 'confirmed');

  return {
    signature,
    explorer_url: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
    memo_content: JSON.parse(memo),
  };
}

// --- Unified Mint (picks best available flow) ---

export async function mint(payload: MintPayload): Promise<MintResult> {
  const wallet = getWalletStatus();

  if (wallet.connected) {
    // User has Phantom connected — let them sign
    return mintViaPhantom(payload);
  }

  // Fall back to service wallet
  return mintViaService(payload);
}
