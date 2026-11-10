import { Router, Response } from "express";
import { PublicKey } from "@solana/web3.js";
import { prisma } from "../config/db";
import { requireAuth, AuthRequest } from "../middleware/auth";
import {
  subscribeToWhaleOnMainnet,
  triggerWhaleSwapAlert,
  recentAlerts,
} from "../services/whaleWatcher";
import { executeShamirCopyTrade } from "../services/jupiterSwap";

const router = Router();

router.get("/alerts", (_req, res: Response) => {
  res.json({ alerts: recentAlerts });
});

router.post(
  "/whales",
  requireAuth,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { label, whaleAddress } = req.body;
      new PublicKey(whaleAddress); // Validate Mainnet Solana address

      const tracked = await prisma.trackedWhale.create({
        data: {
          userId: req.userId!,
          label: label || "Smart Money Whale",
          whaleAddress,
        },
      });

      await subscribeToWhaleOnMainnet(whaleAddress, tracked.label);
      res.status(201).json({ whale: tracked });
    } catch {
      res.status(400).json({ error: "Invalid Solana Mainnet wallet address" });
    }
  }
);

// Instant Test Trigger so you and recruiters can test live Mainnet whale alerts + Telegram notifications on click
router.post(
  "/simulate-whale-ping",
  requireAuth,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { whaleAddress, whaleLabel, tokenMint } = req.body;
    const mint =
      tokenMint || "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"; // BONK Mainnet Mint
    const addr =
      whaleAddress || "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1"; // Raydium Authority Whale
    const label = whaleLabel || "Raydium Smart Whale #1";

    await triggerWhaleSwapAlert(
      label,
      addr,
      mint,
      `5MainnetSimSig${Date.now().toString(36)}`
    );
    res.json({ ok: true });
  }
);

router.post(
  "/copy-trade",
  requireAuth,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { whaleWallet, tokenMint, amountSol } = req.body;
      const result = await executeShamirCopyTrade(
        req.userId!,
        whaleWallet || "ManualSwap",
        tokenMint,
        Number(amountSol) || 0.25
      );
      res.json({ result });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Copy trade failed";
      res.status(400).json({ error: msg });
    }
  }
);

export default router;

