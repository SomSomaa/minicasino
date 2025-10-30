// Egyszerű localStorage wrapper per-profil
const ROOT_KEY = "mini-casino";

function k(profile) {
  return `${ROOT_KEY}:${profile}:state`;
}

export function loadProfileState(profile) {
  const raw = localStorage.getItem(k(profile));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function saveProfileState(profile, state) {
  localStorage.setItem(k(profile), JSON.stringify(state));
}

export function listKnownProfiles() {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    // minta: mini-casino:<név>:state
    const m = key && key.match(/^mini-casino:(.+):state$/);
    if (m && m[1]) out.push(m[1]);
  }
  // egyedi + abc sorrend
  return [...new Set(out)].sort((a,b)=> a.localeCompare(b,"hu"));
}

export function deleteProfileState(profile) {
  localStorage.removeItem(k(profile)); // csak a state kulcsot töröljük
  return { ok:true };
}



// storage-profiles.js  (másold be storage.js vagy wallet.js elejére)

/*
  Kulcsok:
   - mini-casino:profiles  -> teljes objektum { profiles: {...}, maxProfiles: N }
*/

const STORAGE_KEY = "mini-casino:profiles";

// DEFAULT init (ha még nincs)
function _loadStore(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) {
      const init = { profiles: {}, maxProfiles: 5 };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(init));
      return init;
    }
    return JSON.parse(raw);
  } catch(e){
    console.error("storage load error", e);
    const init = { profiles: {}, maxProfiles: 5 };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(init));
    return init;
  }
}
function _saveStore(store){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

// név normalizálás: trim + lower
function _normalizeName(name){
  return (name || "").toString().trim().toLowerCase();
}

// --- API ---
// listázás: visszaadja az objektumot { name, balance, createdAt, lastClaim }
export function listProfiles(){
  const s = _loadStore();
  return s.profiles || {};
}

export function getProfile(name){
  const key = _normalizeName(name);
  const s = _loadStore();
  return s.profiles[key] || null;
}

export function createProfile(name, initialBalance = 10000){
  const key = _normalizeName(name);
  if(!key) return { ok:false, reason:"Üres név" };
  const s = _loadStore();

  if(s.profiles[key]) return { ok:false, reason:"Ez a név már foglalt." };
  const currentCount = Object.keys(s.profiles).length;
  if(currentCount >= (s.maxProfiles || 5)) {
    return { ok:false, reason:`Elértétek a maximális profil-számot (${s.maxProfiles}).` };
  }

  const now = Date.now();
  s.profiles[key] = {
    name: name.trim(),
    balance: Number(initialBalance) || 0,
    createdAt: now,
    lastClaim: 0
  };
  _saveStore(s);
  return { ok:true, profile: s.profiles[key] };
}

export function deleteProfile(name){
  const key = _normalizeName(name);
  const s = _loadStore();
  if(!s.profiles[key]) return { ok:false, reason:"Nincs ilyen profil" };
  delete s.profiles[key];
  _saveStore(s);
  return { ok:true };
}

// balance utilities
export function getBalanceFor(name){
  const p = getProfile(name);
  return p ? Number(p.balance) : 0;
}
export function setBalanceFor(name, newBalance){
  const key = _normalizeName(name);
  const s = _loadStore();
  if(!s.profiles[key]) return { ok:false, reason:"Nincs ilyen profil" };
  s.profiles[key].balance = Number(newBalance);
  _saveStore(s);
  return { ok:true };
}
export function changeBalance(name, delta){
  const key = _normalizeName(name);
  const s = _loadStore();
  if(!s.profiles[key]) return { ok:false, reason:"Nincs ilyen profil" };
  s.profiles[key].balance = Number(s.profiles[key].balance || 0) + Number(delta || 0);
  _saveStore(s);
  return { ok:true, balance: s.profiles[key].balance };
}

// maxProfiles (admin)
export function getMaxProfiles(){
  const s = _loadStore();
  return s.maxProfiles || 5;
}
export function setMaxProfiles(n){
  const s = _loadStore();
  s.maxProfiles = Number(n) || 0;
  _saveStore(s);
  return { ok:true, maxProfiles: s.maxProfiles };
}

// --- daily claim logic ---
// helper: ugyanazon a napon-e (UTC)
function _isSameUTCDate(tsA, tsB){
  if(!tsA || !tsB) return false;
  const a = new Date(tsA), b = new Date(tsB);
  return a.getUTCFullYear() === b.getUTCFullYear() &&
         a.getUTCMonth() === b.getUTCMonth() &&
         a.getUTCDate() === b.getUTCDate();
}

/*
  canClaimToday(name) -> { ok: true/false, reason? }
  claimDaily(name, amount) -> { ok, balance?, reason? }
*/
export function canClaimToday(name){
  const key = _normalizeName(name);
  const s = _loadStore();
  const p = s.profiles[key];
  if(!p) return { ok:false, reason:"Nincs ilyen profil" };
  const last = Number(p.lastClaim || 0);
  const now = Date.now();
  const same = _isSameUTCDate(last, now);
  return { ok: !same };
}

export function claimDaily(name, amount=10000){
  const key = _normalizeName(name);
  const s = _loadStore();
  const p = s.profiles[key];
  if(!p) return { ok:false, reason:"Nincs ilyen profil" };
  const now = Date.now();
  if(_isSameUTCDate(p.lastClaim || 0, now)) return { ok:false, reason:"Már igényelted ma." };
  p.balance = Number(p.balance || 0) + Number(amount || 0);
  p.lastClaim = now;
  _saveStore(s);
  return { ok:true, balance: p.balance };
}

// --- Extra admin eszközök (a fájl végére) ---
export function profileCount(){
  const s = _loadStore();
  return Object.keys(s.profiles || {}).length;
}

export function clearAllProfiles(){
  localStorage.removeItem(STORAGE_KEY);
  // visszaállítunk egy üres store-t alapértékekkel
  _loadStore();
  return { ok:true };
}

