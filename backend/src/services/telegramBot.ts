import { Telegraf, Markup } from "telegraf";
import { prisma } from "../config/db";
import { executeShamirCopyTrade } from "./jupiterSwap";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
export const bot = BOT_TOKEN ? new Telegraf(BOT_TOKEN) : null;

export function initTelegramBot() {
  if (!bot) {
    console.log("[Telegram] No TELEGRAM_BOT_TOKEN set — running in Web-only mode.");
    return;
  }

  bot.start(async (ctx) => {
    await ctx.reply(
      "Welcome to WhaleRadar (Shamir-Secured Solana Bot)!\n\n" +
        "Commands:\n" +
        "/link <CODE> - Link your WhaleRadar web account\n" +
        "/wallet - View your Shamir-protected Solana address & balance\n" +
        "/whales - List your tracked Mainnet whale wallets"
    );
  });

  bot.command("link", async (ctx) => {
    const parts = ctx.message.text.trim().split(/\s+/);
    const code = parts[1];
    if (!code) {
      await ctx.reply("Usage: /link YOUR_CODE (copy code from Web Dashboard)");
      return;
    }

    const user = await prisma.user.findUnique({
      where: { telegramLinkCode: code },
    });
    if (!user) {
      await ctx.reply("Invalid link code. Check your WhaleRadar Web Dashboard.");
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { telegramChatId: String(ctx.chat.id) },
    });

    await ctx.reply(
      `Linked to ${user.email}!\nYour Shamir Solana Wallet: ${user.solanaPublicKey}\nDemo Balance: ${user.demoSolBalance.toFixed(2)} SOL`
    );
  });

  bot.command("wallet", async (ctx) => {
    const user = await prisma.user.findUnique({
      where: { telegramChatId: String(ctx.chat.id) },
    });
    if (!user) {
      await ctx.reply("Account not linked yet. Use /link <CODE>.");
      return;
    }
    await ctx.reply(
      `Shamir 2-of-3 Protected Wallet:\nAddress: ${user.solanaPublicKey}\nDemo Balance: ${user.demoSolBalance.toFixed(2)} SOL`
    );
  });

  // Handle 1-Click Copy Trade Callback Button (30-second answerCbQuery rule)
  bot.action(/^copy:([^:]+):([^:]+)$/, async (ctx) => {
    await ctx.answerCbQuery("Reconstructing Shamir shares & executing swap...");
    const whaleWallet = ctx.match[1];
    const tokenMint = ctx.match[2];

    const user = await prisma.user.findUnique({
      where: { telegramChatId: String(ctx.chat?.id) },
    });
    if (!user) {
      await ctx.reply("Please link your account first with /link <CODE>.");
      return;
    }

    try {
      const result = await executeShamirCopyTrade(
        user.id,
        whaleWallet,
        tokenMint,
        0.25
      );
      await ctx.reply(
        `Copy Trade Executed (${result.mode})!\n` +
          `Spent: 0.25 SOL\n` +
          `Token Mint: ${result.tokenMint}\n` +
          `Tokens Received: ${result.outAmount}\n` +
          `Signature: ${result.txSignature}`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Trade failed";
      await ctx.reply(`Trade Error: ${msg}`);
    }
  });

  bot.launch().then(() => {
    console.log("[Telegram] WhaleRadar Bot is live!");
  });
}

export async function sendTelegramWhaleAlert(
  chatId: string,
  whaleLabel: string,
  whaleAddress: string,
  tokenMint: string,
  signature: string
) {
  if (!bot) return;
  try {
    await bot.telegram.sendMessage(
      chatId,
      `WHALE SWAP DETECTED!\n` +
        `Whale: ${whaleLabel} (${whaleAddress.slice(0, 6)}...)\n` +
        `Bought Token: ${tokenMint}\n` +
        `Tx: https://solscan.io/tx/${signature}`,
      Markup.inlineKeyboard([
        Markup.button.callback(
          "Copy Buy 0.25 SOL (Shamir Sign)",
          `copy:${whaleAddress.slice(0, 16)}:${tokenMint}`
        ),
      ])
    );
  } catch (err) {
    console.error("[Telegram] Alert error:", err);
  }
}
