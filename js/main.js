import { initProfile, getBalance, canClaimToday, claimDaily } from "./wallet.js";
import { setText, showToast } from "./ui.js";
import { initSlots } from "./games/slots.js";
import { initRoulette } from "./games/roulette.js";
import { initBlackjack } from "./games/blackjack.js";

// --- állandók ---
const PROFILE_KEY = "mini-casino:currentProfile";

// aktív profilnév a sessionStorage-ban
function getCurrentProfile() {
  return sessionStorage.getItem(PROFILE_KEY) || "";
}
function setCurrentProfile(name) {
  sessionStorage.setItem(PROFILE_KEY, name);
}

// egyenleg + napi claim UI frissítés
function refreshUI(profile) {
  if (!profile) {
    setText("balance", "—");
    const claimBtn = document.getElementById("claimBtn");
    const info = document.getElementById("dailyInfo");
    if (claimBtn) claimBtn.disabled = true;
    if (info) info.textContent = "Adj meg egy profilnevet és mentsd el.";
    return;
  }

  const bal = getBalance(profile).toLocaleString("hu-HU");
  setText("balance", `${bal} token`);

  const claimBtn = document.getElementById("claimBtn");
  const info = document.getElementById("dailyInfo");
  const can = canClaimToday(profile);

  if (claimBtn) {
    claimBtn.disabled = !can;
    claimBtn.classList.toggle("primary", can);
  }
  if (info) {
    info.textContent = can
      ? "A mai napi bónusz igényelhető."
      : "A mai napi bónuszt már igényelted.";
  }
}

/* ========= NAV RANGLISTA =========
   ID-k az index.html-ben:
   - lbToggleTop (gomb)
   - leaderboardTop (lenyíló doboz)
   - leaderboardListTop (lista)
*/
function readProfilesFromStore() {
  // storage.js a mini-casino:profiles kulcson tartja: { profiles: {...}, maxProfiles: N }
  try {
    const raw = localStorage.getItem("mini-casino:profiles");
    if (!raw) return [];
    const store = JSON.parse(raw);
    const map = store && store.profiles ? store.profiles : {};
    // objektum -> tömb [{name, balance}, ...]
    return Object.values(map).map(p => ({
      name: p.name,
      balance: Number(p.balance || 0),
    }));
  } catch {
    return [];
  }
}

function refreshLeaderboardTop() {
  const list = document.getElementById("leaderboardListTop");
  if (!list) return;
  const profiles = readProfilesFromStore()
    .sort((a, b) => b.balance - a.balance);

  list.innerHTML = profiles.length
    ? profiles.map((p, i) => `
        <div class="lb-item">
          <span class="lb-name">${i + 1}. ${p.name}</span>
          <span class="lb-bal">${p.balance.toLocaleString("hu-HU")}</span>
        </div>
      `).join("")
    : `<div class="muted">Nincs még profil.</div>`;
}

function wireLeaderboardTop() {
  const btn  = document.getElementById("lbToggleTop");
  const menu = document.getElementById("leaderboardTop");

  if (!btn || !menu) return; // ha később kerül be, nem dőlünk el

  btn.onclick = () => {
    const isHidden = menu.classList.toggle("hidden");
    // friss szöveg a gombon
    btn.textContent = isHidden ? "Ranglista ▼" : "Ranglista ▲";
    if (!isHidden) refreshLeaderboardTop();
  };

  // időzített autófrissítés (ha nyitva van is, meg ha zárva, nem gond)
  setInterval(refreshLeaderboardTop, 15000);
}

// ahol egyenleg változhat, jó frissíteni a nav-listát is:
function softRefreshLeaderboard() {
  try { refreshLeaderboardTop(); } catch (_) {}
}

/* ========= MODA-LOK ========= */

function wireSlotsModal() {
  const modal = document.getElementById("slotModal");
  const open  = document.getElementById("openSlotsBtn");
  const close = document.getElementById("closeSlotsBtn");
  if (!modal || !open || !close) return;

  open.onclick = () => {
    if (!getCurrentProfile()) return showToast("Előbb mentsd el a profilnevet.");
    modal.classList.add("show");
    document.body.classList.add("game-open");
    initSlots();
  };
  close.onclick = () => {
    modal.classList.remove("show");
    document.body.classList.remove("game-open");
  };
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.classList.remove("show");
      document.body.classList.remove("game-open");
    }
  });
}

function wireRouletteModal() {
  const modal = document.getElementById("rouletteModal");
  const open  = document.getElementById("openRouletteBtn");
  if (!modal || !open) return;

  open.onclick = () => {
    if (!getCurrentProfile()) return showToast("Előbb mentsd el a profilnevet.");
    modal.classList.add("show");
    document.body.classList.add("game-open");
    initRoulette();
  };
  modal.addEventListener("click", (e) => {
    if (e.target === modal || e.target?.dataset?.close === "rouletteModal") {
      modal.classList.remove("show");
      document.body.classList.remove("game-open");
    }
  });
}

function wireBlackjackModal() {
  const modal = document.getElementById("blackjackModal");
  const open  = document.getElementById("openBlackjackBtn");
  if (!modal || !open) return;

  open.onclick = () => {
    if (!getCurrentProfile()) return showToast("Előbb mentsd el a profilnevet.");
    modal.classList.add("show");
    document.body.classList.add("game-open");
    initBlackjack();
  };
  modal.addEventListener("click", (e) => {
    if (e.target === modal || e.target?.dataset?.close === "blackjackModal") {
      modal.classList.remove("show");
      document.body.classList.remove("game-open");
    }
  });
}

/* ========= ON LOAD ========= */

document.addEventListener("DOMContentLoaded", () => {
  // profil mezők
  const profileInput = document.getElementById("profileName");
  const saveBtn      = document.getElementById("saveProfileBtn");
  const claimBtn     = document.getElementById("claimBtn");

  // aktív profil visszaállítás
  const existing = getCurrentProfile();
  if (existing) {
    if (profileInput) profileInput.value = existing;
    initProfile(existing);
  }
  refreshUI(existing);
  refreshLeaderboardTop();    // első kirajzolás
  wireLeaderboardTop();       // nav toggle bekötése

  // Mentés
  if (saveBtn) {
    saveBtn.onclick = () => {
      const name = (profileInput?.value || "").trim();
      if (!name) return showToast("Adj meg egy profilnevet!");

      // csak beállítjuk aktuálisnak + initProfile (wallet.js gondoskodik a state-ről)
      setCurrentProfile(name);
      initProfile(name);

      showToast(`Profil mentve: ${name}`);
      refreshUI(name);
      softRefreshLeaderboard();
    };
  }

  // Claim
  if (claimBtn) {
    claimBtn.onclick = () => {
      const profile = getCurrentProfile();
      if (!profile) return showToast("Előbb mentsd el a profilnevet.");
      const res = claimDaily(profile);
      if (res.ok) showToast("Jó játékot! +10 000 token 🎉");
      else showToast("A mai bónuszt már igényelted.");
      refreshUI(profile);
      softRefreshLeaderboard();
    };
  }

  // Játék modálok
  wireSlotsModal();
  wireRouletteModal();
  wireBlackjackModal();
});
