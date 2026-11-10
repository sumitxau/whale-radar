import {
  Connection,
  LAMPORTS_PER_SOL,
  VersionedTransaction,
} from "@solana/web3.js";
import { prisma } from "../config/db";
import { reconstructKeypairFromShares } from "./shamirVault";

const RPC_URL =
  process.env.SOLANA_MAINNET_RPC || "https://api.mainnet-beta.solana.com";
export const connection = new Connection(RPC_URL, "confirmed");

const SOL_MINT = "So11111111111111111111111111111111111111112";

export interface CopyTradeExecutionResult {
  mode: "MAINNET_LIVE" | "MAINNET_SIMULATED";
  txSignature: string;
  outAmount: string;
  amountSol: number;
  tokenMint: string;
}

export async function executeShamirCopyTrade(
  userId: string,
  whaleWallet: string,
  tokenMint: string,
  amountSol: number
): Promise<CopyTradeExecutionResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { keyVault: true },
  });

  if (!user || !user.keyVault) {
    throw new Error("User Shamir KeyVault not found");
  }

  // 1. Reconstruct Solana Keypair in RAM from Share 1 + Share 2
  const keypair = reconstructKeypairFromShares(
    user.encryptedShare1,
    user.keyVault.encryptedShare2,
    user.keyVault.userSalt
  );

  const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL);

  // 2. Fetch real Mainnet quote from Jupiter V6
  const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${SOL_MINT}&outputMint=${tokenMint}&amount=${lamports}&slippageBps=100`;
  let outAmount = "0";
  let mode: "MAINNET_LIVE" | "MAINNET_SIMULATED" = "MAINNET_SIMULATED";
  let txSignature = `sim_${Date.now().toString(36)}`;

  try {
    const quoteRes = await fetch(quoteUrl);
    if (quoteRes.ok) {
      const quoteData = await quoteRes.json();
      outAmount = quoteData.outAmount || "0";

      // Check real Mainnet SOL balance
      const onChainBalance = await connection.getBalance(keypair.publicKey);
      if (onChainBalance > lamports + 5000000) {
        // User funded real Mainnet SOL -> build and sign real Jupiter V6 swap
        const swapRes = await fetch("https://quote-api.jup.ag/v6/swap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quoteResponse: quoteData,
            userPublicKey: keypair.publicKey.toBase58(),
            wrapAndUnwrapSol: true,
          }),
        });
        if (swapRes.ok) {
          const { swapTransaction } = await swapRes.json();
          const txBuf = Buffer.from(swapTransaction, "base64");
          const tx = VersionedTransaction.deserialize(txBuf);
          tx.sign([keypair]);
          txSignature = await connection.sendRawTransaction(tx.serialize(), {
            skipPreflight: true,
          });
          mode = "MAINNET_LIVE";
        }
      }
    }
  } catch {
    // Fallback if Jupiter API is unreachable or token is custom
    outAmount = Math.floor(amountSol * 1450000).toString();
  }

  // 3. Atomic Prisma Transaction: deduct demo SOL if simulated and record trade
  await prisma.$transaction(async (tx) => {
    if (mode === "MAINNET_SIMULATED") {
      if (user.demoSolBalance < amountSol) {
        throw new Error("Insufficient Demo SOL balance");
      }
      await tx.user.update({
        where: { id: user.id },
        data: { demoSolBalance: { decrement: amountSol } },
      });
    }

    await tx.copyTrade.create({
      data: {
        userId: user.id,
        whaleWallet,
        tokenMint,
        amountSol,
        outAmount,
        mode,
        txSignature,
      },
    });
  });

  return { mode, txSignature, outAmount, amountSol, tokenMint };
}
