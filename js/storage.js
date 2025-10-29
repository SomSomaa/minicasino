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
  // opcionális: végigmehetünk a kulcsokon; most egyszerűen nem használjuk
  return [];
}
