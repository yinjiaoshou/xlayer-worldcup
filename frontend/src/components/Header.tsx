import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain, type Connector } from "wagmi";
import { ACTIVE_CHAIN_ID } from "../config/network";
import { useLang } from "../contexts/LanguageContext";

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function getPreferredConnector(connectors: readonly Connector[]): Connector | undefined {
  return (
    connectors.find((c) => c.name === "MetaMask") ??
    connectors.find((c) => c.type === "injected") ??
    connectors[0]
  );
}

export default function Header() {
  const { address, isConnected } = useAccount();
  const { connect, connectors }   = useConnect();
  const { disconnect }            = useDisconnect();
  const chainId                   = useChainId();
  const { switchChain }           = useSwitchChain();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { t, toggle, lang }       = useLang();

  const wrongNetwork = isConnected && chainId !== ACTIVE_CHAIN_ID;

  const navCls = ({ isActive }: { isActive: boolean }) =>
    `text-sm font-semibold transition-colors ${
      isActive ? "text-emerald-400" : "text-white/60 hover:text-white"
    }`;

  function handleConnect() {
    const connector = getPreferredConnector(connectors);
    if (connector) connect({ connector });
  }

  return (
    <>
      {wrongNetwork && (
        <div className="sticky top-0 z-[60] bg-red-500/90 backdrop-blur-sm text-white text-xs font-bold text-center py-2 px-4 flex items-center justify-center gap-3">
          <span>⚠️ {t.header.wrongNetwork}</span>
          <button
            onClick={() => switchChain({ chainId: ACTIVE_CHAIN_ID })}
            className="bg-white/20 hover:bg-white/30 border border-white/30 rounded-lg px-3 py-1 text-xs font-bold transition-colors"
          >
            {t.header.switchNetwork}
          </button>
        </div>
      )}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-pitch-900/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <NavLink to="/" className="flex items-center gap-2.5" onClick={() => setMobileOpen(false)}>
            <span className="text-2xl">🏆</span>
            <div className="leading-tight">
              <div className="font-black text-white text-sm tracking-tight">{t.header.logoTitle}</div>
              <div className="font-black text-emerald-400 text-sm tracking-tight">{t.header.logoSub}</div>
            </div>
          </NavLink>

          {/* Desktop nav */}
          <nav className="hidden sm:flex items-center gap-8">
            <NavLink to="/" end className={navCls}>{t.header.navHome}</NavLink>
            <NavLink to="/teams" className={navCls}>{t.header.navTeams}</NavLink>
            <NavLink to="/bracket" className={navCls}>{t.header.navBracket}</NavLink>
            <NavLink to="/fantasy" className={({ isActive }) =>
              `text-sm font-semibold transition-colors flex items-center gap-1 ${
                isActive ? "text-purple-400" : "text-white/60 hover:text-white"
              }`}>
              ⚽ {t.header.navFantasy}
            </NavLink>
            <NavLink to="/predict" className={({ isActive }) =>
              `text-sm font-semibold transition-colors flex items-center gap-1 ${
                isActive ? "text-amber-400" : "text-white/60 hover:text-white"
              }`}>
              🎯 {t.header.navPredict}
            </NavLink>
            <NavLink to="/predict#agent-panel" className={({ isActive }) =>
              `text-sm font-bold transition-colors px-3 py-1.5 rounded-lg border ${
                isActive
                  ? "bg-violet-500/30 border-violet-400/50 text-violet-300"
                  : "bg-violet-500/15 border-violet-500/30 text-violet-400 hover:bg-violet-500/25"
              }`}>
              {t.header.navAgent}
            </NavLink>
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2">
            {/* Language toggle */}
            <button
              onClick={toggle}
              className="hidden sm:flex items-center gap-1 text-xs font-bold text-white/50 hover:text-white border border-white/10 hover:border-white/25 rounded-lg px-2.5 py-1.5 transition-colors"
              aria-label="Switch language"
            >
              {lang === "zh" ? "🌐 EN" : "🌐 中"}
            </button>

            {/* Wallet */}
            {isConnected && address ? (
              <button onClick={() => disconnect()} className="btn-secondary text-sm !py-2 !px-4">
                {shortAddr(address)}
              </button>
            ) : (
              <button onClick={handleConnect} className="btn-primary text-sm !py-2 !px-4">
                {t.header.connectWallet}
              </button>
            )}

            {/* Mobile hamburger */}
            <button
              className="sm:hidden text-white/60 hover:text-white transition-colors p-1"
              onClick={() => setMobileOpen((o) => !o)}
              aria-label="Toggle navigation"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileOpen
                  ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                }
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile nav dropdown */}
        {mobileOpen && (
          <nav className="sm:hidden border-t border-white/5 bg-pitch-900/95 px-4 py-3 flex flex-col gap-3">
            <NavLink to="/"       end className={navCls} onClick={() => setMobileOpen(false)}>{t.header.navHome}</NavLink>
            <NavLink to="/teams"      className={navCls} onClick={() => setMobileOpen(false)}>{t.header.navTeams}</NavLink>
            <NavLink to="/bracket"    className={navCls} onClick={() => setMobileOpen(false)}>{t.header.navBracket}</NavLink>
            <NavLink to="/fantasy"    className={navCls} onClick={() => setMobileOpen(false)}>⚽ {t.header.navFantasy}</NavLink>
            <NavLink to="/predict"    className={({ isActive }) =>
              `text-sm font-semibold transition-colors ${isActive ? "text-amber-400" : "text-white/60 hover:text-white"}`
            } onClick={() => setMobileOpen(false)}>🎯 {t.header.navPredict}</NavLink>
            <NavLink to="/predict#agent-panel" className={({ isActive }) =>
              `text-sm font-bold transition-colors px-3 py-1.5 rounded-lg border inline-block w-fit ${
                isActive ? "bg-violet-500/30 border-violet-400/50 text-violet-300" : "bg-violet-500/15 border-violet-500/30 text-violet-400"
              }`
            } onClick={() => setMobileOpen(false)}>{t.header.navAgent}</NavLink>
            {/* Mobile language toggle */}
            <button
              onClick={() => { toggle(); setMobileOpen(false); }}
              className="text-left text-sm font-semibold text-white/50 hover:text-white transition-colors"
            >
              🌐 {t.langSwitch}
            </button>
          </nav>
        )}
      </header>
    </>
  );
}
