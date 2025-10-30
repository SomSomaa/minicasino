import { randInt, randFloat } from "../rng.js";
import { getBalance, placeBet, payout } from "../wallet.js";
import { setText, showToast } from "../ui.js";

// A sessionStorage-ben tartjuk az aktív profil kulcsát (ugyanaz, mint main.js-ben)
const PROFILE_KEY = "mini-casino:currentProfile";
function currentProfile() {
  return sessionStorage.getItem(PROFILE_KEY) || "";
}

/**
 * Szimbólumok + súlyok (durván beállított valószínűségek)
 * Gyakoribb szimbólum -> kisebb kifizetés.
 */
const SYMBOLS = [
  { icon: "🍋", weight: 34, pay: 4 }, // 3 egyformára adott szorzó (tét * pay)
  { icon: "🍒", weight: 28, pay: 6 },
  { icon: "⭐", weight: 18, pay: 12 },
  { icon: "🔔", weight: 10, pay: 20 },
  { icon: "💎", weight: 6,  pay: 40 },
  { icon: "7️⃣", weight: 3,  pay: 100 },
  { icon: "BONUS", weight: 30, pay: 0 },
];

// Gyors választólista a súlyozott randomhoz
// Súlyozott listák – külön a BONUS nélküli választáshoz
let weightedAll = [];
let weightedNoBonus = [];

function buildWeighted() {
  weightedAll = [];
  weightedNoBonus = [];
  for (const s of SYMBOLS) {
    for (let i = 0; i < s.weight; i++) {
      weightedAll.push(s.icon);
      if (s.icon !== "BONUS") weightedNoBonus.push(s.icon);
    }
  }
}
buildWeighted();

function pickSymbol() {
  const idx = randInt(0, weightedAll.length - 1);
  return weightedAll[idx];
}
function pickNonBonusSymbol() {
  const idx = randInt(0, weightedNoBonus.length - 1);
  return weightedNoBonus[idx];
}


// 3×3 mátrix generálása
function spinGrid() {
  const grid = [];
  for (let r = 0; r < 3; r++) {
    const row = [];
    for (let c = 0; c < 3; c++) row.push(pickSymbol());
    grid.push(row);
  }
  return grid;
}

// Olyan 3x3 grid, ahol egy oszlopban max 1 BONUS lehet.
// A 3 oszlop közül BONUS előfordulása ~25%/oszlop → P(3 BONUS összesen) ≈ 0.25^3 ≈ 1.56% ~ 1.5%
const BONUS_COL_PROB = 0.25;

function spinGridConstrained() {
  const grid = [[],[],[]]; // 3 sor
  for (let col = 0; col < 3; col++) {
    const hasBonus = randFloat() < BONUS_COL_PROB; // egy oszlop kap-e bonuszt
    let bonusRow = -1;
    if (hasBonus) bonusRow = randInt(0, 2);

    for (let row = 0; row < 3; row++) {
      if (row === bonusRow) {
        grid[row][col] = "BONUS";
      } else {
        grid[row][col] = pickNonBonusSymbol();
      }
    }
  }
  return grid;
}


// Paylines: 1 vonal = középső sor
// 5 vonal = [felső sor, középső sor, alsó sor, bal-felsőtől jobb-alsóig átló, jobb-felsőtől bal-alsóig átló]
function getLines(mode) {
  if (mode === 1) return [[ [1,0],[1,1],[1,2] ]]; // középső
  return [
    [ [0,0],[0,1],[0,2] ], // top
    [ [1,0],[1,1],[1,2] ], // middle
    [ [2,0],[2,1],[2,2] ], // bottom
    [ [0,0],[1,1],[2,2] ], // diag ↘
    [ [0,2],[1,1],[2,0] ], // diag ↙
  ];
}

// Paytable: 3 azonos szimbólum kell egy vonalon -> pay szorzó
function evalWin(grid, lines) {
  let totalMultiplier = 0;
  const winningCells = []; // kiemeléshez

  for (const line of lines) {
    const [a,b,c] = line.map(([r, col]) => grid[r][col]);
    if (a === b && b === c) {
      // keressük meg a pay értéket
      const sym = SYMBOLS.find(s => s.icon === a);
      if (sym) {
        totalMultiplier += sym.pay;
        winningCells.push(...line);
      }
    }
  }
  return { totalMultiplier, winningCells };
}

function gridToDOM(grid) {
  const reels = document.getElementById("reels");
  reels.innerHTML = "";
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const div = document.createElement("div");
      div.className = "symbol";
      div.dataset.r = String(r);
      div.dataset.c = String(c);

      const sym = grid[r][c];
      if (sym === "BONUS") {
        div.innerHTML = `<img src="assets/img/bonus.jpg" alt="BONUS" class="bonus-icon">`;
      } else {
        div.textContent = sym;
      }

      reels.appendChild(div);
    }
  }
}

function highlightWin(cells) {
  const reels = document.getElementById("reels");
  const all = [...reels.querySelectorAll(".symbol")];
  for (const el of all) el.classList.remove("win");

  for (const [r,c] of cells) {
    const sel = `.symbol[data-r="${r}"][data-c="${c}"]`;
    const el = reels.querySelector(sel);
    if (el) el.classList.add("win");
  }
}

// Tárcsánkénti "spin-és-megáll" animáció
async function animateReelsTo(grid) {
  const reels = document.getElementById("reels");
  // induló zaj
  for (let i = 0; i < 9; i++) {
    const r = Math.floor(i / 3), c = i % 3;
    const div = document.createElement("div");
    div.className = "symbol";
    div.dataset.r = String(r);
    div.dataset.c = String(c);
    div.textContent = pickSymbol(); // random zaj
    reels.appendChild(div);
  }

  // oszloponként állunk meg
  const stopCol = async (col) => {
    // rövid „pörgés” effekthez pár frame random ezen az oszlopon
    for (let k = 0; k < 6; k++) {
      for (let r = 0; r < 3; r++) {
        const sel = `.symbol[data-r="${r}"][data-c="${col}"]`;
        const el = reels.querySelector(sel);
        if (el) el.textContent = pickSymbol();
      }
      await new Promise(r => setTimeout(r, 40));
    }
    // végső érték beírása
    for (let r = 0; r < 3; r++) {
      const sel = `.symbol[data-r="${r}"][data-c="${col}"]`;
      const el = reels.querySelector(sel);
      if (el) {
        const sym = grid[r][col];
        if (sym === "BONUS") {
          el.innerHTML = `<img src="assets/img/bonus.jpg" alt="BONUS" class="bonus-icon">`;
        } else {
          el.textContent = sym;
        }
      }
    }
  };

  // első két oszlop megáll
  await stopCol(0);
  await new Promise(r => setTimeout(r, 80));
  await stopCol(1);

  // TEASE: ha az első 2 oszlopban már >=2 BONUS van, várjunk többet a 3.-nál
  let bonusCountFirst2 = 0;
  for (let r = 0; r < 3; r++) {
    if (grid[r][0] === "BONUS") bonusCountFirst2++;
    if (grid[r][1] === "BONUS") bonusCountFirst2++;
  }
  if (bonusCountFirst2 >= 2) {
    await new Promise(r => setTimeout(r, 600));
  } else {
    await new Promise(r => setTimeout(r, 80));
  }

  await stopCol(2);
}


function updateBalanceUI(profile) {
  const bal = getBalance(profile).toLocaleString("hu-HU");
  setText("balance", `${bal} token`);
}
// BONUS mód állapot
let bonusActive = false;
let bonusSpinsLeft = 0;
let bonusTotalWin = 0;
const BONUS_SPINS_COUNT = 6;
const BONUS_PAYOUT_MULT = 2; // ×2 pénz


export function initSlots() {
  const profile = currentProfile();
  const spinBtn = document.getElementById("spinBtn");
  const betInput = document.getElementById("slotBet");
  const linesSel = document.getElementById("slotLines");
  const result = document.getElementById("slotResult");

  // bonus banner induláskor (ha kilépett közben valahogy)
    document.getElementById("bonusBanner").style.display = bonusActive ? "block" : "none";
    document.getElementById("bonusLeft").textContent = String(bonusSpinsLeft || 0);
    document.getElementById("bonusTotal").textContent = (bonusTotalWin || 0).toLocaleString("hu-HU");



  // induló rács
    gridToDOM(spinGridConstrained());
  result.textContent = "Válassz tétet és pörgesd meg!";

  let spinning = false;

   // AUTOSPIN
    let autoCount = 0;
    const btn5 = document.getElementById("auto5");
    const btn25 = document.getElementById("auto25");
    const btnInf = document.getElementById("autoInf");
    const btnStop = document.getElementById("autoStop");

function toggleAutoButtons(active) {
  btn5.style.display = active ? "none" : "inline-block";
  btn25.style.display = active ? "none" : "inline-block";
  btnInf.style.display = active ? "none" : "inline-block";
  btnStop.style.display = active ? "inline-block" : "none";
}

    btn5.onclick = () => { autoCount = 5; toggleAutoButtons(true); spinBtn.click(); };
    btn25.onclick = () => { autoCount = 25; toggleAutoButtons(true); spinBtn.click(); };
    btnInf.onclick = () => { autoCount = Infinity; toggleAutoButtons(true); spinBtn.click(); };
    btnStop.onclick = () => { autoCount = 0; toggleAutoButtons(false); };


spinBtn.onclick = async () => {
  if (spinning) return;
  const name = currentProfile();
  if (!name) { showToast("Előbb mentsd el a profilnevet."); return; }

  const betPerLine = Math.max(100, Math.floor(Number(betInput.value) || 0));
  // Free spin módban mindig 5 vonalat értékelünk
  const linesCount = bonusActive ? 5 : (Number(linesSel.value) === 5 ? 5 : 1);
  const totalBet = betPerLine * linesCount;

  // tét levonás CSAK ha nem bonus módban vagyunk
  if (!bonusActive) {
    const betRes = placeBet(name, totalBet);
    if (!betRes.ok) {
      showToast(betRes.reason || "Nem sikerült a tét.");
      if (autoCount > 0) { autoCount = 0; toggleAutoButtons(false); }
      return;
    }
    updateBalanceUI(name);
    if (typeof refreshLeaderboard === "function") refreshLeaderboard();
  }

  spinning = true;
  spinBtn.disabled = true;
  result.textContent = "Pörgetés...";

  // --- végső grid előállítása (oszloponként max 1 BONUS) ---
  let grid = spinGridConstrained();

  // FREE SPIN módban növeljük a találati arányt: ha nincs nyeremény, max 2× újrageneráljuk
  if (bonusActive) {
    const lines5 = getLines(5);
    let evalRes = evalWin(grid, lines5);
    let rerolls = 0;
    while (evalRes.totalMultiplier <= 0 && rerolls < 1) {
      grid = spinGridConstrained();
      evalRes = evalWin(grid, lines5);
      rerolls++;
    }
  }

  // Tárcsánkénti animáció + tease
  const reelsEl = document.getElementById("reels");
  reelsEl.innerHTML = "";
  await animateReelsTo(grid);

  // Eredmény kiértékelés
  const lines = getLines(linesCount);
  const { totalMultiplier, winningCells } = evalWin(grid, lines);
  highlightWin(winningCells);

  let won = 0;
  let effectiveMultiplier = totalMultiplier;

  // BONUS mód ×2 payout
  if (bonusActive && effectiveMultiplier > 0) {
    effectiveMultiplier *= BONUS_PAYOUT_MULT;
  }

  if (effectiveMultiplier > 0) {
    won = Math.floor(betPerLine * effectiveMultiplier);
    payout(name, won);
    updateBalanceUI(name);
    if (typeof refreshLeaderboard === "function") refreshLeaderboard();
    showToast(`Nyeremény: +${won.toLocaleString("hu-HU")} token 🎉`);
    document.getElementById("slotResult").innerHTML =
      `<div class="big-win">+${won.toLocaleString("hu-HU")} token 🎉</div>`;

    // BONUS összesített nyeremény növelése
    if (bonusActive) {
      bonusTotalWin += won;
      document.getElementById("bonusTotal").textContent = bonusTotalWin.toLocaleString("hu-HU");
    }
  } else {
    showToast("Nem nyert most — próbáld újra!");
    result.textContent = "Nincs nyerő vonal.";
    const reels = document.getElementById("reels");
    reels.classList.add("shake");
    setTimeout(()=> reels.classList.remove("shake"), 300);
  }

  // BONUS ikonok számlálása (a retrigger és trigger miatt)
  let bonusCount = 0;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    if (grid[r][c] === "BONUS") bonusCount++;
  }

  // BONUS trigger (normál módban)
  if (!bonusActive) {
    if (bonusCount >= 3) {
      bonusActive = true;
      bonusSpinsLeft = BONUS_SPINS_COUNT;
      bonusTotalWin = 0;
      document.getElementById("bonusBanner").style.display = "block";
      document.getElementById("bonusLeft").textContent = String(bonusSpinsLeft);
      document.getElementById("bonusTotal").textContent = "0";
      showToast("BONUS MODE! 6 FREE SPIN ×2 payout 🎁");
    }
  } else {
    // BONUS módban vagyunk → retrigger szabály
    if (bonusCount === 2) {
      bonusSpinsLeft += 2;
      showToast("+2 free spin (2 BONUS) 🎁");
    } else if (bonusCount === 3) {
      bonusSpinsLeft += 5;
      showToast("+5 free spin (3 BONUS) 🎁");
    }

    // most csökkentjük az aktuális spin miatt
    bonusSpinsLeft--;
    document.getElementById("bonusLeft").textContent = String(bonusSpinsLeft);

    if (bonusSpinsLeft <= 0) {
      bonusActive = false;
      document.getElementById("bonusBanner").style.display = "none";
      // nagy összesítő a végén
      document.getElementById("slotResult").innerHTML =
        `<div class="big-win">BONUS TOTAL: +${bonusTotalWin.toLocaleString("hu-HU")} token 🎉</div>`;
      bonusTotalWin = 0; // reset, hogy legközelebb nulláról fusson
    }
  }

  spinning = false;
  spinBtn.disabled = false;

  // --- AUTOSPIN ciklus: win esetén hosszabb szünet, bonus módban is működik ---
  if (autoCount > 0) {
    autoCount--;
    if (getBalance(name) > 0 || bonusActive) {
      const delay = (effectiveMultiplier > 0) ? 1100 : 500;
      await new Promise(r=>setTimeout(r, delay));
      spinBtn.click();
    } else {
      autoCount = 0;
      toggleAutoButtons(false);
      showToast("Elfogyott az egyenleg.");
    }
  } else {
    toggleAutoButtons(false);
  }
};


}
