import crypto from "crypto";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
// @ts-ignore
import * as sss from "shamirs-secret-sharing";

// Master server key 
const SERVER_MASTER_KEY = Buffer.from(
  (process.env.SERVER_MASTER_KEY || "").padEnd(64, "0").slice(0, 64),
  "hex"
);
const JWT_SECRET = process.env.JWT_SECRET || "whaleradar_secret";

// Encrypt buffer (AES-256-GCM)
function encryptBuffer(plainBuf: Buffer, key32: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key32, iv);
  const encrypted = Buffer.concat([cipher.update(plainBuf), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

// Decrypt buffer (AES-256-GCM)
function decryptBuffer(payload: string, key32: Buffer): Buffer {
  const [ivHex, tagHex, encHex] = payload.split(":");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key32,
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(encHex, "hex")),
    decipher.final(),
  ]);
}

// Unique per-user encryption key
function deriveUserKey(userSalt: string): Buffer {
  return crypto.scryptSync(JWT_SECRET, userSalt, 32);
}
// Create wallet + 2-of-3 Shamir split
export interface SplitWalletResult {
  publicKey: string;
  encryptedShare1: string;
  encryptedShare2: string;
  recoveryShare3Hex: string;
  userSalt: string;
}

export function createShamirSplitWallet(): SplitWalletResult {
  const keypair = Keypair.generate();
  const secretBuffer = Buffer.from(keypair.secretKey);


  
// Split key into 3 shares (need 2 to recover)

  const shares = sss.split(secretBuffer, { shares: 3, threshold: 2 }) as Buffer[];

  const userSalt = crypto.randomBytes(16).toString("hex");
  const userKey = deriveUserKey(userSalt);

  // Encrypt Share 1 (Server) & Share 2 (User)
  const encryptedShare1 = encryptBuffer(shares[0], SERVER_MASTER_KEY);
  const encryptedShare2 = encryptBuffer(shares[1], userKey);
  const recoveryShare3Hex = shares[2].toString("hex");

  // Wipe raw secret key
  secretBuffer.fill(0);

  return {
    publicKey: keypair.publicKey.toBase58(),
    encryptedShare1,
    encryptedShare2,
    recoveryShare3Hex,
    userSalt,
  };
}

 // Reconstruct keypair from Share 1 + Share 2
export function reconstructKeypairFromShares(
  encryptedShare1: string,
  encryptedShare2: string,
  userSalt: string
): Keypair {
  const share1 = decryptBuffer(encryptedShare1, SERVER_MASTER_KEY);
  const userKey = deriveUserKey(userSalt);
  const share2 = decryptBuffer(encryptedShare2, userKey);

  // Combine shares in RAM
  const recoveredSecret = sss.combine([share1, share2]) as Buffer;
  const keypair = Keypair.fromSecretKey(new Uint8Array(recoveredSecret));


  // Wipe RAM buffers immediately
  share1.fill(0);
  share2.fill(0);
  recoveredSecret.fill(0);

  return keypair;
}

// Export raw private key (Base58)
export function exportBase58PrivateKey(
  encryptedShare1: string,
  encryptedShare2: string,
  userSalt: string
): string {
  const kp = reconstructKeypairFromShares(
    encryptedShare1,
    encryptedShare2,
    userSalt
  );
  return bs58.encode(kp.secretKey);
}