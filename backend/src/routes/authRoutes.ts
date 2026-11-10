import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { prisma } from "../config/db";
import { createShamirSplitWallet } from "../services/shamirVault";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "whaleradar_secret";

router.post("/signup", async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;
    if (!email || !password || password.length < 6) {
      res.status(400).json({ error: "Email and 6+ char password required" });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const shamirWallet = createShamirSplitWallet();
    const telegramLinkCode =
      "WR-" + crypto.randomBytes(3).toString("hex").toUpperCase();

    // Store Share 1 in User table and Share 2 in KeyVault table inside an ACID transaction
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          passwordHash,
          solanaPublicKey: shamirWallet.publicKey,
          encryptedShare1: shamirWallet.encryptedShare1,
          telegramLinkCode,
        },
      });

      await tx.keyVault.create({
        data: {
          userId: created.id,
          encryptedShare2: shamirWallet.encryptedShare2,
          userSalt: shamirWallet.userSalt,
        },
      });

      return created;
    });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
      expiresIn: "7d",
    });

    res.status(201).json({
      token,
      user: {
        email: user.email,
        solanaPublicKey: user.solanaPublicKey,
        telegramLinkCode: user.telegramLinkCode,
        telegramLinked: Boolean(user.telegramChatId),
        demoSolBalance: user.demoSolBalance,
      },
      recoveryShare3Hex: shamirWallet.recoveryShare3Hex,
    });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/login", async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({
      token,
      user: {
        email: user.email,
        solanaPublicKey: user.solanaPublicKey,
        telegramLinkCode: user.telegramLinkCode,
        telegramLinked: Boolean(user.telegramChatId),
        demoSolBalance: user.demoSolBalance,
      },
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get(
  "/me",
  requireAuth,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: { whales: true, trades: { orderBy: { createdAt: "desc" } } },
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({
      user: {
        email: user.email,
        solanaPublicKey: user.solanaPublicKey,
        telegramLinkCode: user.telegramLinkCode,
        telegramLinked: Boolean(user.telegramChatId),
        demoSolBalance: user.demoSolBalance,
      },
      whales: user.whales,
      trades: user.trades,
    });
  }
);

export default router;

