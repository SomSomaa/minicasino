import { randInt } from "../rng.js";
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
  { icon: "🍋", weight: 30, pay: 1.5 }, // 3 egyformára adott szorzó (tét * pay)
  { icon: "🍒", weight: 26, pay: 2 },
  { icon: "⭐", weight: 18, pay: 4 },
  { icon: "🔔", weight: 14, pay: 6 },
  { icon: "💎", weight: 8,  pay: 10 },
  { icon: "7️⃣", weight: 4,  pay: 20 },
];

// Gyors választólista a súlyozott randomhoz
let weighted = [];
function buildWeighted() {
  weighted = [];
  for (const s of SYMBOLS) for (let i = 0; i < s.weight; i++) weighted.push(s.icon);
}
buildWeighted();

function pickSymbol() {
  const idx = randInt(0, weighted.length - 1);
  return weighted[idx];
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
      div.textContent = grid[r][c];
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

function updateBalanceUI(profile) {
  const bal = getBalance(profile).toLocaleString("hu-HU");
  setText("balance", `${bal} token`);
}

export function initSlots() {
  const profile = currentProfile();
  const spinBtn = document.getElementById("spinBtn");
  const betInput = document.getElementById("slotBet");
  const linesSel = document.getElementById("slotLines");
  const result = document.getElementById("slotResult");

  // induló rács
  gridToDOM(spinGrid());
  result.textContent = "Válassz tétet és pörgesd meg!";

  let spinning = false;

  spinBtn.onclick = async () => {
    if (spinning) return;
    const name = currentProfile();
    if (!name) { showToast("Előbb mentsd el a profilnevet."); return; }

    const betPerLine = Math.max(100, Math.floor(Number(betInput.value) || 0));
    const linesCount = Number(linesSel.value) === 5 ? 5 : 1;
    const totalBet = betPerLine * linesCount;

    // tét levonása
    const betRes = placeBet(name, totalBet);
    if (!betRes.ok) {
      showToast(betRes.reason || "Nem sikerült a tét.");
      return;
    }
    updateBalanceUI(name);

    spinning = true;
    spinBtn.disabled = true;
    result.textContent = "Pörgetés...";

    // pörgetés: "animációszerű" újrahúzás 8× kis késleltetéssel
    for (let i = 0; i < 8; i++) {
      gridToDOM(spinGrid());
      await new Promise(r => setTimeout(r, 70));
    }

    // végső grid
    const grid = spinGrid();
    gridToDOM(grid);

    const lines = getLines(linesCount);
    const { totalMultiplier, winningCells } = evalWin(grid, lines);
    highlightWin(winningCells);

    let won = 0;
    if (totalMultiplier > 0) {
      won = Math.floor(betPerLine * totalMultiplier);
      payout(name, won);
      updateBalanceUI(name);
      showToast(`Nyeremény: +${won.toLocaleString("hu-HU")} token 🎉`);
      result.textContent = `Nyert vonalak: ${winningCells.length ? winningCells.length/3 : 0} | Szorzó összesen: ×${totalMultiplier}`;
    } else {
      showToast("Nem nyert most — próbáld újra!");
      result.textContent = "Nincs nyerő vonal.";
    }

    spinning = false;
    spinBtn.disabled = false;
  };
}
