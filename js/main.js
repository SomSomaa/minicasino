import { initProfile, getBalance, canClaimToday, claimDaily } from "./wallet.js";
import { setText, showToast } from "./ui.js";

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
});
