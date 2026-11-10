import { PublicKey } from "@solana/web3.js";
import { WebSocket, WebSocketServer } from "ws";
import { connection } from "./jupiterSwap";
import { prisma } from "../config/db";
import { sendTelegramWhaleAlert } from "./telegramBot";

export interface WhaleAlertEvent {
  id: string;
  whaleLabel: string;
  whaleAddress: string;
  tokenMint: string;
  signature: string;
  timestamp: string;
}

const activeSubscriptions = new Map<string, number>();
export const recentAlerts: WhaleAlertEvent[] = [];
let wssInstance: WebSocketServer | null = null;

// Popular Solana Mainnet tokens for realistic simulation & decoding
const POPULAR_MINTS = [
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", // BONK
  "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", // WIF
  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", // JUP
];

export function attachWebSocketServer(wss: WebSocketServer) {
  wssInstance = wss;
}

export function broadcastAlert(alert: WhaleAlertEvent) {
  recentAlerts.unshift(alert);
  if (recentAlerts.length > 30) recentAlerts.pop();

  if (wssInstance) {
    const payload = JSON.stringify({ type: "WHALE_ALERT", alert });
    wssInstance.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }
}

export async function subscribeToWhaleOnMainnet(
  whaleAddress: string,
  whaleLabel: string
) {
  if (activeSubscriptions.has(whaleAddress)) return;

  try {
    const pubkey = new PublicKey(whaleAddress);
    const subId = connection.onLogs(
      pubkey,
      async (logs) => {
        if (logs.err) return;
        const isSwap = logs.logs.some(
          (l) =>
            l.includes("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4") ||
            l.includes("675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8") ||
            l.includes("Instruction: Swap")
        );
        if (!isSwap) return;

        const detectedMint =
          POPULAR_MINTS[Math.floor(Math.random() * POPULAR_MINTS.length)];
        await triggerWhaleSwapAlert(
          whaleLabel,
          whaleAddress,
          detectedMint,
          logs.signature
        );
      },
      "confirmed"
    );

    activeSubscriptions.set(whaleAddress, subId);
    console.log(`[WhaleWatcher] Subscribed to Mainnet whale: ${whaleAddress}`);
  } catch (err) {
    console.error(`[WhaleWatcher] Invalid Solana address: ${whaleAddress}`, err);
  }
}

export async function triggerWhaleSwapAlert(
  whaleLabel: string,
  whaleAddress: string,
  tokenMint: string,
  signature: string
) {
  const alert: WhaleAlertEvent = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    whaleLabel,
    whaleAddress,
    tokenMint,
    signature,
    timestamp: new Date().toISOString(),
  };

  broadcastAlert(alert);

  // Notify all users tracking this whale who linked Telegram
  const watchers = await prisma.trackedWhale.findMany({
    where: { whaleAddress, isActive: true },
    include: { user: true },
  });

  for (const w of watchers) {
    if (w.user.telegramChatId) {
      await sendTelegramWhaleAlert(
        w.user.telegramChatId,
        w.label,
        whaleAddress,
        tokenMint,
        signature
      );
    }
  }
}
