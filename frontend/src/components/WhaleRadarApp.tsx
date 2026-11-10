"use client";

import React, { useState, useEffect, useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:4000";

interface UserInfo {
  email: string;
  solanaPublicKey: string;
  telegramLinkCode: string;
  telegramLinked: boolean;
  demoSolBalance: number;
}

interface WhaleItem {
  id: string;
  label: string;
  whaleAddress: string;
}

interface AlertItem {
  id: string;
  whaleLabel: string;
  whaleAddress: string;
  tokenMint: string;
  signature: string;
  timestamp: string;
}

interface TradeItem {
  id: string;
  whaleWallet: string;
  tokenMint: string;
  amountSol: number;
  outAmount: string;
  mode: string;
  txSignature: string;
  createdAt: string;
}

export default function WhaleRadarApp() {
  const [activeTab, setActiveTab] = useState<"landing" | "terminal" | "whales">("landing");
  const [token, setToken] = useState<string>("");
  const [user, setUser] = useState<UserInfo | null>(null);
  const [authMode, setAuthMode] = useState<"signup" | "login">("signup");
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [error, setError] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");

  const [whales, setWhales] = useState<WhaleItem[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [trades, setTrades] = useState<TradeItem[]>([]);

  const [whaleLabel, setWhaleLabel] = useState("Raydium Mainnet Whale");
  const [whaleAddress, setWhaleAddress] = useState("5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1");

  const fetchAccount = useCallback(async (jwtToken: string) => {
    if (!jwtToken) return;
    try {
      const [meRes, alertRes] = await Promise.all([
        fetch(`${API_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${jwtToken}` },
        }),
        fetch(`${API_URL}/api/radar/alerts`),
      ]);
      if (meRes.ok) {
        const data = await meRes.json();
        setUser(data.user);
        setWhales(data.whales || []);
        setTrades(data.trades || []);
      }
      if (alertRes.ok) {
        const alertData = await alertRes.json();
        setAlerts(alertData.alerts || []);
      }
    } catch {
      // Ignore network errors
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("wr_token");
    if (saved) {
      setToken(saved);
      fetchAccount(saved);
      setActiveTab("terminal");
    }
  }, [fetchAccount]);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "WHALE_ALERT" && msg.alert) {
          setAlerts((prev) => [msg.alert, ...prev.slice(0, 19)]);
        }
      } catch {
        // Ignore JSON parse errors
      }
    };
    return () => ws.close();
  }, []);

  async function handleAuth(overrideEmail?: string, overridePass?: string) {
    setError("");
    const email = overrideEmail || emailInput;
    const password = overridePass || passwordInput;

    const res = await fetch(`${API_URL}/api/auth/${authMode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Authentication failed");
      return;
    }
    localStorage.setItem("wr_token", data.token);
    setToken(data.token);
    setUser(data.user);
    if (data.recoveryShare3Hex) {
      setRecoveryKey(data.recoveryShare3Hex);
    }
    fetchAccount(data.token);
    setActiveTab("terminal");
  }

  function handleQuickDemoLogin() {
    setAuthMode("login");
    handleAuth("recruiter@whaleradar.io", "DemoPassword123!");
  }

  function handleLogout() {
    localStorage.removeItem("wr_token");
    setToken("");
    setUser(null);
    setRecoveryKey("");
    setActiveTab("landing");
  }

  async function handleAddWhale() {
    setError("");
    const res = await fetch(`${API_URL}/api/radar/whales`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ label: whaleLabel, whaleAddress }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not subscribe to whale");
      return;
    }
    await fetchAccount(token);
  }

  async function handleSimulatePing() {
    await fetch(`${API_URL}/api/radar/simulate-whale-ping`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        whaleLabel,
        whaleAddress,
        tokenMint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
      }),
    });
  }

  async function handleCopyTrade(whale: string, mint: string) {
    setError("");
    const res = await fetch(`${API_URL}/api/radar/copy-trade`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ whaleWallet: whale, tokenMint: mint, amountSol: 0.25 }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Trade failed");
      return;
    }
    await fetchAccount(token);
  }

  return (
    <div className="wr-shell">
      {/* Navigation Header */}
      <nav className="wr-nav">
        <a href="#" onClick={() => setActiveTab("landing")} className="wr-nav-brand">
          <span className="wr-logo-mark" />
          <span className="wr-nav-title">WhaleRadar</span>
        </a>

        <div className="wr-nav-links">
          <button
            type="button"
            onClick={() => setActiveTab("landing")}
            className={activeTab === "landing" ? "wr-nav-link active" : "wr-nav-link"}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("terminal")}
            className={activeTab === "terminal" ? "wr-nav-link active" : "wr-nav-link"}
          >
            Terminal
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("whales")}
            className={activeTab === "whales" ? "wr-nav-link active" : "wr-nav-link"}
          >
            Tracked Whales
          </button>
        </div>

        <div className="wr-nav-user">
          {user ? (
            <>
              <div className="wr-sol-chip">
                Balance: <strong>{user.demoSolBalance.toFixed(2)} SOL</strong>
              </div>
              <button type="button" onClick={handleLogout} className="wr-btn-ghost">
                Logout
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setActiveTab("terminal")} className="wr-btn-primary">
              Open Terminal
            </button>
          )}
        </div>
      </nav>

      {error && <div className="wr-error">{error}</div>}

      {/* LANDING PAGE  */}
      {activeTab === "landing" && (
        <>
          <section className="wr-hero-band">
            <span className="wr-eyebrow">Real-Time Solana Mainnet Indexer</span>
            <h1 className="wr-hero-title">
              Detect Solana whale moves in{" "}
              <span className="wr-highlight-chip">&lt;400ms</span> with zero key custody.
            </h1>
            <p className="wr-hero-sub">
              WhaleRadar subscribes directly to Solana validator logs over native WebSockets,
              streams instant swap alerts to Telegram, and executes 1-click copy trades using
              ephemeral 2-of-3 key reconstruction.
            </p>
            <div className="wr-hero-ctas">
              <button
                type="button"
                onClick={() => setActiveTab("terminal")}
                className="wr-btn-primary"
              >
                Launch Web Terminal
              </button>
              <button
                type="button"
                onClick={handleQuickDemoLogin}
                className="wr-btn-inverted"
              >
                1-Click Recruiter Demo
              </button>
            </div>
          </section>

          {/*  3-Step Architecture Ribbon */}
          <section className="wr-ribbon">
            <div className="wr-ribbon-card">
              <div className="wr-ribbon-step">STEP 01</div>
              <h3 className="wr-ribbon-title">Sub-400ms Mainnet Stream</h3>
              <p className="wr-ribbon-desc">
                Native Solana JSON-RPC <code>connection.onLogs</code> streaming directly from
                Mainnet-Beta validators, eliminating 1.5s webhook queue delays.
              </p>
            </div>

            <div className="wr-ribbon-card">
              <div className="wr-ribbon-step">STEP 02</div>
              <h3 className="wr-ribbon-title">2-of-3 Key Sharding</h3>
              <p className="wr-ribbon-desc">
                Your private key is mathematically split into 3 isolated shards on signup.
                A single database breach yields zero usable keys.
              </p>
            </div>

            <div className="wr-ribbon-card">
              <div className="wr-ribbon-step">STEP 03</div>
              <h3 className="wr-ribbon-title">1-Click Telegram Execution</h3>
              <p className="wr-ribbon-desc">
                Receive instant buy/sell alerts in Telegram with 1-click execution through
                Jupiter V6 smart routing and priority fee injection.
              </p>
            </div>
          </section>
        </>
      )}

      {/* VIEW 2 TRADING TERMINAL */}
      {activeTab === "terminal" && (
        <main className="wr-container">
          {!user ? (
            <div className="wr-auth-box">
              <div className="wr-card">
                <div className="wr-card-header">
                  <h2 className="wr-card-title">
                    {authMode === "signup"
                      ? "Create Split-Key Trading Wallet"
                      : "Sign In to Terminal"}
                  </h2>
                </div>
                <div className="wr-tabs">
                  <button
                    type="button"
                    onClick={() => setAuthMode("signup")}
                    className={authMode === "signup" ? "wr-tab active" : "wr-tab"}
                  >
                    Sign Up
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthMode("login")}
                    className={authMode === "login" ? "wr-tab active" : "wr-tab"}
                  >
                    Login
                  </button>
                </div>
                <input
                  type="email"
                  placeholder="name@whaleradar.io"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="wr-input"
                />
                <input
                  type="password"
                  placeholder="Password (6+ chars)"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="wr-input"
                />
                <button
                  type="button"
                  onClick={() => handleAuth()}
                  className="wr-btn-primary"
                  style={{ width: "100%", marginBottom: "12px" }}
                >
                  {authMode === "signup" ? "Generate Key Shards & Enter" : "Sign In"}
                </button>
                <button
                  type="button"
                  onClick={handleQuickDemoLogin}
                  className="wr-btn-ghost"
                  style={{ width: "100%" }}
                >
                  Quick Demo Sign-In
                </button>
              </div>
            </div>
          ) : (
            <div className="wr-grid">
              <section className="wr-main-col">
                <div className="wr-card">
                  <div className="wr-card-header">
                    <h2 className="wr-card-title">
                      Live Mainnet Whale Swap Stream ({alerts.length})
                    </h2>
                    <button type="button" onClick={handleSimulatePing} className="wr-btn-copy">
                      Trigger Test Alert
                    </button>
                  </div>
                  {alerts.length === 0 ? (
                    <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>
                      Listening to Mainnet logs... Click &ldquo;Trigger Test Alert&rdquo; to test instant execution.
                    </p>
                  ) : (
                    <table className="wr-table">
                      <thead>
                        <tr>
                          <th>Whale</th>
                          <th>Token Mint</th>
                          <th>Signature</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {alerts.map((a) => (
                          <tr key={a.id}>
                            <td>
                              <strong>{a.whaleLabel}</strong>
                              <div className="wr-tag-pill">{a.whaleAddress.slice(0, 8)}...</div>
                            </td>
                            <td className="wr-mono">{a.tokenMint.slice(0, 12)}...</td>
                            <td className="wr-mono">{a.signature.slice(0, 12)}...</td>
                            <td>
                              <button
                                type="button"
                                onClick={() => handleCopyTrade(a.whaleAddress, a.tokenMint)}
                                className="wr-btn-copy"
                              >
                                Copy Buy 0.25 SOL
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="wr-card">
                  <div className="wr-card-header">
                    <h2 className="wr-card-title">Execution History ({trades.length})</h2>
                  </div>
                  {trades.length === 0 ? (
                    <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>No trades executed yet.</p>
                  ) : (
                    <table className="wr-table">
                      <thead>
                        <tr>
                          <th>Token</th>
                          <th>Amount</th>
                          <th>Tokens Received</th>
                          <th>Mode</th>
                          <th>Signature</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trades.map((t) => (
                          <tr key={t.id}>
                            <td className="wr-mono">{t.tokenMint.slice(0, 12)}...</td>
                            <td>{t.amountSol} SOL</td>
                            <td className="wr-mono">{t.outAmount}</td>
                            <td><span className="wr-tag-pill">{t.mode}</span></td>
                            <td className="wr-mono">{t.txSignature.slice(0, 10)}...</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </section>

              <aside className="wr-side-col">
                <div className="wr-card">
                  <div className="wr-card-header">
                    <h2 className="wr-card-title">Security & Key Vault</h2>
                  </div>
                  <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "6px" }}>
                    Your Solana Address:
                  </p>
                  <div className="wr-code-block">{user.solanaPublicKey}</div>

                  <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "6px" }}>
                    Telegram Linking Code:
                  </p>
                  <div className="wr-code-block">/link {user.telegramLinkCode}</div>
                  <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "14px" }}>
                    Status: {user.telegramLinked ? "Connected to Telegram" : "Send command to @Bot"}
                  </p>

                  {recoveryKey && (
                    <>
                      <p style={{ fontSize: "12px", color: "var(--accent-pink)", marginBottom: "6px" }}>
                        Offline Recovery Share (Save Once):
                      </p>
                      <div className="wr-code-block">{recoveryKey.slice(0, 36)}...</div>
                    </>
                  )}
                </div>
              </aside>
            </div>
          )}
        </main>
      )}

      {/* VIEW 3 TRACKED WHALES CONFIGURATION */}
      {activeTab === "whales" && (
        <main className="wr-container">
          <div className="wr-card" style={{ maxWidth: "720px", margin: "0 auto" }}>
            <div className="wr-card-header">
              <h2 className="wr-card-title">Subscribe to Solana Mainnet Whale</h2>
            </div>
            <input
              type="text"
              value={whaleLabel}
              onChange={(e) => setWhaleLabel(e.target.value)}
              placeholder="Whale Label (e.g. Smart Money #1)"
              className="wr-input"
            />
            <input
              type="text"
              value={whaleAddress}
              onChange={(e) => setWhaleAddress(e.target.value)}
              placeholder="Solana Address"
              className="wr-input"
            />
            <button
              type="button"
              onClick={handleAddWhale}
              className="wr-btn-primary"
              style={{ width: "100%", marginBottom: "24px" }}
            >
              Add to Real-Time Watchlist
            </button>

            <h3 style={{ fontSize: "14px", fontWeight: "600", marginBottom: "12px" }}>
              Active Tracked Wallets ({whales.length})
            </h3>
            <table className="wr-table">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Solana Address</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {whales.map((w) => (
                  <tr key={w.id}>
                    <td><strong>{w.label}</strong></td>
                    <td className="wr-mono">{w.whaleAddress}</td>
                    <td><span className="wr-tag-pill">ACTIVE</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      )}

      {/* Footer */}
      <footer className="wr-footer">
        <div>WhaleRadar &bull; Solana Mainnet Indexer &amp; Copy-Trading Terminal</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--accent-lime)" }}>
          Latency: ~350ms &bull; Zero Key Custody
        </div>
      </footer>
    </div>
  );
}

