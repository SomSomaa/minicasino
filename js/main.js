import { initProfile, getBalance, canClaimToday, claimDaily } from "./wallet.js";
import { setText, showToast } from "./ui.js";
import { initSlots } from "./games/slots.js";
import { initRoulette } from "./games/roulette.js";


// A kiválasztott profil nevét a sessionStorage-ben tartjuk, hogy ne kelljen minden reloadnál újra írni
const PROFILE_KEY = "mini-casino:currentProfile";

function getCurrentProfile() {
  return sessionStorage.getItem(PROFILE_KEY) || "";
}
function setCurrentProfile(name) {
  sessionStorage.setItem(PROFILE_KEY, name);
}

function refreshUI(profile) {
  if (!profile) {
    setText("balance", "—");
    document.getElementById("claimBtn").disabled = true;
    document.getElementById("dailyInfo").textContent = "Adj meg egy profilnevet és mentsd el.";
    return;
  }
  const bal = getBalance(profile).toLocaleString("hu-HU");
  setText("balance", `${bal} token`);

  const claimBtn = document.getElementById("claimBtn");
  const info = document.getElementById("dailyInfo");
  const can = canClaimToday(profile);
  claimBtn.disabled = !can;
  claimBtn.classList.toggle("primary", can);
  info.textContent = can
    ? "A mai napi bónusz igényelhető."
    : "A mai napi bónuszt már igényelted.";
}

document.addEventListener("DOMContentLoaded", () => {
  const profileInput = document.getElementById("profileName");
  const saveBtn = document.getElementById("saveProfileBtn");
  const claimBtn = document.getElementById("claimBtn");

  // betöltjük az aktuális profil nevét (ha volt)
  const existing = getCurrentProfile();
  if (existing) {
    profileInput.value = existing;
    initProfile(existing);
  }
  refreshUI(existing);

  saveBtn.addEventListener("click", () => {
    const name = (profileInput.value || "").trim();
    if (!name) { showToast("Adj meg egy profilnevet!"); return; }
    setCurrentProfile(name);
    initProfile(name);
    showToast(`Profil mentve: ${name}`);
    refreshUI(name);
  });

  claimBtn.addEventListener("click", () => {
    const profile = getCurrentProfile();
    if (!profile) { showToast("Előbb mentsd el a profilnevet."); return; }
    const res = claimDaily(profile);
    if (res.ok) showToast("Jó játékot! +10 000 token 🎉");
    else showToast("A mai bónuszt már igényelted.");
    refreshUI(profile);
  });

    // --- SLOTS MODAL ---
  const slotModal = document.getElementById("slotModal");
  const openSlotsBtn = document.getElementById("openSlotsBtn");
  const closeSlotsBtn = document.getElementById("closeSlotsBtn");

  function openSlots() {
    const profile = sessionStorage.getItem("mini-casino:currentProfile") || "";
    if (!profile) { showToast("Előbb mentsd el a profilnevet."); return; }
    slotModal.classList.add("show");
    slotModal.setAttribute("aria-hidden", "false");
    initSlots(); // belső elemek bekötése, rács kirajzolás
  }

  function closeSlots() {
    slotModal.classList.remove("show");
    slotModal.setAttribute("aria-hidden", "true");
  }

  openSlotsBtn.addEventListener("click", openSlots);
  closeSlotsBtn.addEventListener("click", closeSlots);

  // modál háttérre kattintásra zárás
  slotModal.addEventListener("click", (e) => {
    if (e.target === slotModal) closeSlots();
  });

// --- ROULETTE MODAL ---
const rouletteModal = document.getElementById("rouletteModal");
const openRouletteBtn = document.getElementById("openRouletteBtn");

function openRoulette() {
  const profile = sessionStorage.getItem("mini-casino:currentProfile") || "";
  if (!profile) { showToast("Előbb mentsd el a profilnevet."); return; }
  rouletteModal.classList.add("show");
  rouletteModal.setAttribute("aria-hidden", "false");
  initRoulette();
}

function closeRoulette() {
  rouletteModal.classList.remove("show");
  rouletteModal.setAttribute("aria-hidden", "true");
}

openRouletteBtn.addEventListener("click", openRoulette);

// a modal fejlécében van egy X (span.close) data-close attribútummal
rouletteModal.addEventListener("click", (e) => {
  const target = e.target;
  if (target.matches('[data-close="rouletteModal"]') || target === rouletteModal) {
    closeRoulette();
  }
});

  
});


