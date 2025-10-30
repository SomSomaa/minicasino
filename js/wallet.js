import { loadProfileState, saveProfileState } from "./storage.js";
import { setBalanceFor } from "./storage.js";


const DAILY_AMOUNT = 10000;

// --- Következő napi-claim időpont (UTC-napváltás) ---
export function getNextClaimTime(profile) {
  try {
    const key = `mini-casino:${profile}:state`;
    const raw = localStorage.getItem(key);
    const state = raw ? JSON.parse(raw) : { lastClaim: 0 };
    const last = Number(state.lastClaim || 0);
    if (!last) return 0; // még nem igényelt
    const d = new Date(last);
    // következő nap 00:00:00 UTC
    const nextUTC = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0);
    return nextUTC; // ms timestamp
  } catch (e) {
    return 0;
  }
}

export function initProfile(profile) {
  let s = loadProfileState(profile);
  if (!s) {
    s = { balance: 0, lastClaimDate: null, stats: { wins: 0, losses: 0 } };
    saveProfileState(profile, s);
  }
  try { setBalanceFor(profile, s.balance); } catch(_) {}
    return s;
}

export function getBalance(profile) {
  const s = loadProfileState(profile) || initProfile(profile);
  return s.balance;
}

export function setBalance(profile, newBalance) {
  const s = loadProfileState(profile) || initProfile(profile);
  s.balance = Math.max(0, Math.floor(newBalance));
  saveProfileState(profile, s);
  try { setBalanceFor(profile, s.balance); } catch(_) {}
  return s.balance;
}

export function canClaimToday(profile) {
  const s = loadProfileState(profile) || initProfile(profile);
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return s.lastClaimDate !== today;
}

export function claimDaily(profile) {
  const s = loadProfileState(profile) || initProfile(profile);
  const today = new Date().toISOString().slice(0, 10);
  if (s.lastClaimDate === today) return { ok: false, balance: s.balance };
  s.balance += DAILY_AMOUNT;
  s.lastClaimDate = today;
  saveProfileState(profile, s);
  try { setBalanceFor(profile, s.balance); } catch(_) {}
  return { ok: true, balance: s.balance };
}

// egyszerű tétkezelés – később a játékok használják
export function placeBet(profile, amount) {
  const s = loadProfileState(profile) || initProfile(profile);
  if (amount <= 0) return { ok: false, reason: "A tét legyen pozitív." };
  if (s.balance < amount) return { ok: false, reason: "Nincs elég egyenleg." };
  s.balance -= amount;
  saveProfileState(profile, s);
  try { setBalanceFor(profile, s.balance); } catch(_) {}
  return { ok: true, balance: s.balance };
}

export function payout(profile, amount) {
  const s = loadProfileState(profile) || initProfile(profile);
  s.balance += Math.max(0, Math.floor(amount));
  saveProfileState(profile, s);
  try { setBalanceFor(profile, s.balance); } catch(_) {}
  return s.balance;
}
