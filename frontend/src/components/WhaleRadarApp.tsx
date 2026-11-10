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
  const [view, setView] = useState<"overview" | "terminal" | "whales">("overview");
  const [token, setToken] = useState<string>("");
  const [user, setUser] = useState<UserInfo | null>(null);
  const [authMode, setAuthMode] = useState<"signup" | "login">("signup");
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [recoveryShare, setRecoveryShare] = useState("");

  const [whales, setWhales] = useState<WhaleItem[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [trades, setTrades] = useState<TradeItem[]>([]);

  const [whaleLabel, setWhaleLabel] = useState("Raydium Authority Whale");
  const [whaleAddress, setWhaleAddress] = useState("5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1");

  const fetchAccount = useCallback(async (jwtToken: string) => {
    if (!jwtToken || jwtToken === "local_preview_token") return;
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
      setStatusMsg("Backend on localhost:4000 is offline — running in local preview mode.");
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("wr_token");
    if (saved) {
      setToken(saved);
      fetchAccount(saved);
    }
  }, [fetchAccount]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(WS_URL);
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "WHALE_ALERT" && msg.alert) {
            setAlerts((prev) => [msg.alert, ...prev.slice(0, 19)]);
          }
        } catch {
          return;
        }
      };
    } catch {
      return;
    }
    return () => {
      if (ws) ws.close();
    };
  }, []);

  function startLocalPreviewSession(email: string) {
    setToken("local_preview_token");
    setUser({
      email,
      solanaPublicKey: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
      telegramLinkCode: "WR-90F4B2",
      telegramLinked: false,
      demoSolBalance: 10.0,
    });
    setWhales([
      {
        id: "w1",
        label: "Raydium Authority Whale",
        whaleAddress: "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1",
      },
    ]);
    setAlerts([
      {
        id: "a1",
        whaleLabel: "Raydium Authority Whale",
        whaleAddress: "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1",
        tokenMint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
        signature: "5MainnetSig89fK2xLmP9qR7vWz3",
        timestamp: new Date().toISOString(),
      },
    ]);
    setView("terminal");
  }

  async function handleAuth() {
    setStatusMsg("");
    if (!emailInput || passwordInput.length < 6) {
      setStatusMsg("Enter a valid email and a password of at least 6 characters.");
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/auth/${authMode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailInput, password: passwordInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMsg(data.error || "Authentication failed");
        return;
      }
      localStorage.setItem("wr_token", data.token);
      setToken(data.token);
      setUser(data.user);
      if (data.recoveryShare3Hex) {
        setRecoveryShare(data.recoveryShare3Hex);
      }
      await fetchAccount(data.token);
      setView("terminal");
    } catch {
      startLocalPreviewSession(emailInput);
    }
  }

  async function handleInstantDemo() {
    setStatusMsg("");
    const demoEmail = "demo@whaleradar.io";
    const demoPassword = "DemoPassword123!";
    try {
      let res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: demoEmail, password: demoPassword }),
      });
      if (!res.ok) {
        res = await fetch(`${API_URL}/api/auth/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: demoEmail, password: demoPassword }),
        });
      }
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem("wr_token", data.token);
        setToken(data.token);
        setUser(data.user);
        await fetchAccount(data.token);
        setView("terminal");
        return;
      }
      startLocalPreviewSession(demoEmail);
    } catch {
      startLocalPreviewSession(demoEmail);
    }
  }

  function handleLogout() {
    localStorage.removeItem("wr_token");
    setToken("");
    setUser(null);
    setRecoveryShare("");
    setView("overview");
  }

  async function handleAddWhale() {
    setStatusMsg("");
    if (token === "local_preview_token") {
      setWhales((prev) => [
        ...prev,
        { id: `w_${Date.now()}`, label: whaleLabel, whaleAddress },
      ]);
      return;
    }
    try {
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
        setStatusMsg(data.error || "Invalid Solana address");
        return;
      }
      await fetchAccount(token);
    } catch {
      setStatusMsg("Could not reach backend server on port 4000.");
    }
  }

  async function handleSimulateAlert() {
    if (token === "local_preview_token") {
      setAlerts((prev) => [
        {
          id: `sim_${Date.now()}`,
          whaleLabel,
          whaleAddress,
          tokenMint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
          signature: `5SimSig${Date.now().toString(36)}`,
          timestamp: new Date().toISOString(),
        },
        ...prev,
      ]);
      return;
    }
    try {
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
    } catch {
      setStatusMsg("Start backend on port 4000 to broadcast live WebSocket alerts.");
    }
  }

  async function handleCopyTrade(whaleWallet: string, tokenMint: string) {
    setStatusMsg("");
    if (token === "local_preview_token" && user) {
      setUser({ ...user, demoSolBalance: Math.max(0, user.demoSolBalance - 0.25) });
      setTrades((prev) => [
        {
          id: `t_${Date.now()}`,
          whaleWallet,
          tokenMint,
          amountSol: 0.25,
          outAmount: "362,500",
          mode: "MAINNET_SIMULATED",
          txSignature: `5CopyTx${Date.now().toString(36)}`,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/radar/copy-trade`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ whaleWallet, tokenMint, amountSol: 0.25 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMsg(data.error || "Trade failed");
        return;
      }
      await fetchAccount(token);
    } catch {
      setStatusMsg("Backend offline — could not execute trade.");
    }
  }

  return (
    <div>
      <div className="wr-top-strip">
        SOLANA MAINNET WHALE INDEXER &bull; 2-OF-3 SPLIT KEY VAULT &bull; JUPITER V6 ROUTING
      </div>

      <div className="wr-layout">
        <aside className="wr-rail">
          <div className="wr-rail-top">
            <div className="wr-brand">
              <span className="wr-brand-mark" />
              <span className="wr-brand-name">WHALERADAR</span>
            </div>

            <nav className="wr-rail-nav">
              <button
                type="button"
                onClick={() => setView("overview")}
                className={view === "overview" ? "wr-rail-btn active" : "wr-rail-btn"}
              >
                01 / OVERVIEW
              </button>
              <button
                type="button"
                onClick={() => setView("terminal")}
                className={view === "terminal" ? "wr-rail-btn active" : "wr-rail-btn"}
              >
                02 / LIVE TERMINAL
              </button>
              <button
                type="button"
                onClick={() => setView("whales")}
                className={view === "whales" ? "wr-rail-btn active" : "wr-rail-btn"}
              >
                03 / WATCHLIST ({whales.length})
              </button>
            </nav>
          </div>

          <div className="wr-rail-bottom">
            <div className="wr-rail-stat">
              <span>NETWORK</span>
              <strong>MAINNET-BETA</strong>
            </div>
            <div className="wr-rail-stat">
              <span>KEY CUSTODY</span>
              <strong>2-OF-3 SPLIT</strong>
            </div>
            {user ? (
              <>
                <div className="wr-rail-stat">
                  <span>BALANCE</span>
                  <strong>{user.demoSolBalance.toFixed(2)} SOL</strong>
                </div>
                <button type="button" onClick={handleLogout} className="wr-btn-teal">
                  LOGOUT
                </button>
              </>
            ) : (
              <button type="button" onClick={handleInstantDemo} className="wr-btn-teal">
                INSTANT DEMO
              </button>
            )}
          </div>
        </aside>

        <main className="wr-stage">
          {statusMsg && <div className="wr-banner-err">{statusMsg}</div>}

          {view === "overview" && (
            <>
              <section className="wr-hero">
                <div>
                  <span className="wr-eyebrow">NON-CUSTODIAL TELEGRAM &amp; WEB BOT</span>
                  <h1 className="wr-display-title">
                    TRACK SOLANA WHALES. COPY SWAPS IN ONE CLICK.
                  </h1>
                  <p className="wr-hero-copy">
                    WhaleRadar watches smart-money wallets directly via Solana JSON-RPC{" "}
                    <code>connection.onLogs</code>, pushes instant swap alerts to Telegram, and
                    signs Jupiter V6 trades using ephemeral 2-of-3 Shamir key shares.
                  </p>
                  <div className="wr-cta-row">
                    <button
                      type="button"
                      onClick={() => setView("terminal")}
                      className="wr-btn-teal"
                    >
                      OPEN TRADING TERMINAL
                    </button>
                    <button
                      type="button"
                      onClick={handleInstantDemo}
                      className="wr-btn-outline"
                    >
                      LAUNCH 1-CLICK DEMO
                    </button>
                  </div>
                </div>

                <div className="wr-hero-spec-box">
                  <div className="wr-spec-head">SYSTEM ARCHITECTURE</div>
                  <div className="wr-spec-row">
                    <span>LOG STREAM</span>
                    <span>connection.onLogs (Confirmed)</span>
                  </div>
                  <div className="wr-spec-row">
                    <span>KEY SECURITY</span>
                    <span>Shamir 2-of-3 + AES-256-GCM</span>
                  </div>
                  <div className="wr-spec-row">
                    <span>DEX ROUTER</span>
                    <span>Jupiter V6 Mainnet API</span>
                  </div>
                  <div className="wr-spec-row">
                    <span>BOT ENGINE</span>
                    <span>Telegraf Inline Callbacks</span>
                  </div>
                </div>
              </section>

              <section className="wr-steps-grid">
                <div className="wr-box-light">
                  <span className="wr-step-tag">STEP 01</span>
                  <h2 className="wr-section-head">MAINNET LOG LISTENER</h2>
                  <p className="wr-muted-text">
                    Subscribes directly to Solana validator logs for tracked whale addresses,
                    detecting Raydium and Jupiter swaps in ~350ms without webhook queues.
                  </p>
                </div>

                <div className="wr-box-dark">
                  <span className="wr-step-tag">STEP 02</span>
                  <h2 className="wr-section-head">2-OF-3 SHAMIR VAULT</h2>
                  <p className="wr-muted-text">
                    Splits each generated Ed25519 private key into 3 cryptographic shares across
                    isolated database tables so a single table dump reveals zero keys.
                  </p>
                </div>

                <div className="wr-box-light">
                  <span className="wr-step-tag">STEP 03</span>
                  <h2 className="wr-section-head">TELEGRAM &amp; WEB EXECUTION</h2>
                  <p className="wr-muted-text">
                    Reconstructs Share 1 + Share 2 in memory for 5ms when you click Copy Buy on
                    Telegram or Web, signs the Jupiter V6 swap, and wipes RAM.
                  </p>
                </div>
              </section>
            </>
          )}

          {view === "terminal" && (
            <>
              {!user ? (
                <div className="wr-auth-stage">
                  <div className="wr-box-light">
                    <span className="wr-step-tag">AUTHENTICATION</span>
                    <h2 className="wr-section-head">
                      {authMode === "signup"
                        ? "CREATE 2-OF-3 SPLIT WALLET"
                        : "UNLOCK WHALERADAR"}
                    </h2>
                    <div className="wr-tab-row">
                      <button
                        type="button"
                        onClick={() => setAuthMode("signup")}
                        className={
                          authMode === "signup" ? "wr-btn-teal" : "wr-btn-outline"
                        }
                      >
                        SIGN UP
                      </button>
                      <button
                        type="button"
                        onClick={() => setAuthMode("login")}
                        className={
                          authMode === "login" ? "wr-btn-teal" : "wr-btn-outline"
                        }
                      >
                        LOGIN
                      </button>
                    </div>
                    <input
                      type="email"
                      placeholder="email@domain.com"
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
                    <div className="wr-cta-row">
                      <button
                        type="button"
                        onClick={handleAuth}
                        className="wr-btn-teal"
                      >
                        {authMode === "signup" ? "CREATE WALLET" : "SIGN IN"}
                      </button>
                      <button
                        type="button"
                        onClick={handleInstantDemo}
                        className="wr-btn-outline"
                      >
                        1-CLICK DEMO
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="wr-terminal-grid">
                  <div className="wr-col">
                    <div className="wr-box-light">
                      <div className="wr-box-header">
                        <h2 className="wr-section-head">
                          LIVE WHALE SWAP FEED ({alerts.length})
                        </h2>
                        <button
                          type="button"
                          onClick={handleSimulateAlert}
                          className="wr-btn-teal"
                        >
                          SIMULATE WHALE SWAP
                        </button>
                      </div>
                      {alerts.length === 0 ? (
                        <p className="wr-muted-text">
                          No swaps detected yet. Click &ldquo;SIMULATE WHALE SWAP&rdquo; to test
                          instant WebSocket + Telegram execution.
                        </p>
                      ) : (
                        <table className="wr-table">
                          <thead>
                            <tr>
                              <th>WHALE</th>
                              <th>TOKEN MINT</th>
                              <th>SIGNATURE</th>
                              <th>ACTION</th>
                            </tr>
                          </thead>
                          <tbody>
                            {alerts.map((a) => (
                              <tr key={a.id}>
                                <td>
                                  <strong>{a.whaleLabel}</strong>
                                  <div className="wr-muted-text">
                                    {a.whaleAddress.slice(0, 8)}...
                                  </div>
                                </td>
                                <td>
                                  <span className="wr-pill">
                                    {a.tokenMint.slice(0, 10)}...
                                  </span>
                                </td>
                                <td>{a.signature.slice(0, 10)}...</td>
                                <td>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleCopyTrade(a.whaleAddress, a.tokenMint)
                                    }
                                    className="wr-btn-dark"
                                  >
                                    COPY 0.25 SOL
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>

                    <div className="wr-box-light">
                      <div className="wr-box-header">
                        <h2 className="wr-section-head">
                          EXECUTED COPY TRADES ({trades.length})
                        </h2>
                      </div>
                      {trades.length === 0 ? (
                        <p className="wr-muted-text">No trades executed yet.</p>
                      ) : (
                        <table className="wr-table">
                          <thead>
                            <tr>
                              <th>TOKEN</th>
                              <th>SOL SPENT</th>
                              <th>OUT AMOUNT</th>
                              <th>MODE</th>
                              <th>TX</th>
                            </tr>
                          </thead>
                          <tbody>
                            {trades.map((t) => (
                              <tr key={t.id}>
                                <td>{t.tokenMint.slice(0, 10)}...</td>
                                <td>{t.amountSol} SOL</td>
                                <td>
                                  <strong>{t.outAmount}</strong>
                                </td>
                                <td>
                                  <span className="wr-pill">{t.mode}</span>
                                </td>
                                <td>{t.txSignature.slice(0, 10)}...</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>

                  <aside className="wr-col">
                    <div className="wr-box-dark">
                      <div className="wr-box-header">
                        <h2 className="wr-section-head">SHAMIR 2-OF-3 VAULT</h2>
                        <span className="wr-pill">ACTIVE</span>
                      </div>
                      <p className="wr-muted-text">SOLANA MAINNET ADDRESS</p>
                      <div className="wr-code-field">{user.solanaPublicKey}</div>

                      <p className="wr-muted-text">TELEGRAM BOT LINK COMMAND</p>
                      <div className="wr-code-field">/link {user.telegramLinkCode}</div>

                      <div className="wr-spec-row">
                        <span>SHARE 1 (PRIMARY DB)</span>
                        <span>AES-256-GCM</span>
                      </div>
                      <div className="wr-spec-row">
                        <span>SHARE 2 (KEYVAULT)</span>
                        <span>SCRYPT SALT</span>
                      </div>
                      <div className="wr-spec-row">
                        <span>TELEGRAM STATUS</span>
                        <span>
                          {user.telegramLinked ? "CONNECTED" : "AWAITING /LINK"}
                        </span>
                      </div>

                      {recoveryShare && (
                        <div style={{ marginTop: "14px" }}>
                          <p className="wr-muted-text">OFFLINE SHARE #3 (SAVE ONCE)</p>
                          <div className="wr-code-field">
                            {recoveryShare.slice(0, 38)}...
                          </div>
                        </div>
                      )}
                    </div>
                  </aside>
                </div>
              )}
            </>
          )}

          {view === "whales" && (
            <div className="wr-box-light">
              <div className="wr-box-header">
                <h2 className="wr-section-head">WATCH MAINNET WHALE WALLETS</h2>
              </div>
              <input
                type="text"
                value={whaleLabel}
                onChange={(e) => setWhaleLabel(e.target.value)}
                placeholder="Whale Label"
                className="wr-input"
              />
              <input
                type="text"
                value={whaleAddress}
                onChange={(e) => setWhaleAddress(e.target.value)}
                placeholder="Solana Mainnet Address"
                className="wr-input"
              />
              <button
                type="button"
                onClick={handleAddWhale}
                className="wr-btn-teal"
              >
                ADD WALLET TO ONLOGS STREAM
              </button>

              <table className="wr-table" style={{ marginTop: "24px" }}>
                <thead>
                  <tr>
                    <th>LABEL</th>
                    <th>SOLANA ADDRESS</th>
                    <th>STREAM</th>
                  </tr>
                </thead>
                <tbody>
                  {whales.map((w) => (
                    <tr key={w.id}>
                      <td>
                        <strong>{w.label}</strong>
                      </td>
                      <td>{w.whaleAddress}</td>
                      <td>
                        <span className="wr-pill">CONFIRMED LOGS</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}


