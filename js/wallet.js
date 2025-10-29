import { loadProfileState, saveProfileState } from "./storage.js";

const DAILY_AMOUNT = 10000;

export function initProfile(profile) {
  let s = loadProfileState(profile);
  if (!s) {
    s = { balance: 0, lastClaimDate: null, stats: { wins: 0, losses: 0 } };
    saveProfileState(profile, s);
  }
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
  return { ok: true, balance: s.balance };
}

// egyszerű tétkezelés – később a játékok használják
export function placeBet(profile, amount) {
  const s = loadProfileState(profile) || initProfile(profile);
  if (amount <= 0) return { ok: false, reason: "A tét legyen pozitív." };
  if (s.balance < amount) return { ok: false, reason: "Nincs elég egyenleg." };
  s.balance -= amount;
  saveProfileState(profile, s);
  return { ok: true, balance: s.balance };
}

export function payout(profile, amount) {
  const s = loadProfileState(profile) || initProfile(profile);
  s.balance += Math.max(0, Math.floor(amount));
  saveProfileState(profile, s);
  return s.balance;
}
