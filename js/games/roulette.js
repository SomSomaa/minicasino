import { randInt, randFloat } from "../rng.js";
import { getBalance, placeBet, payout} from "../wallet.js";

// session tárolt profilnév olvasása (slots.js-ben is ezt használjuk)
const PROFILE_KEY = "mini-casino:currentProfile";
function currentProfile() {
  return sessionStorage.getItem(PROFILE_KEY) || "";
}
function updateTopBalance(name){
  try {
    const el = document.getElementById("balance");
    if (!el) return;
    const bal = getBalance(name);
    el.textContent = `${bal.toLocaleString("hu-HU")} token`;
  } catch(_) {}
}
function showWinBanner(modalId, amount, label="Nyeremény"){
  const modal = document.getElementById(modalId);
  if(!modal) return;
  const box = modal.querySelector(".modal-content.game-modal") || modal;
  const el = document.createElement("div");
  el.className = "win-banner";
  el.innerHTML = `
    <div class="win-amount">+${amount.toLocaleString("hu-HU")} token</div>
    <div class="win-label">${label}</div>
  `;
  box.appendChild(el);
  requestAnimationFrame(()=> el.classList.add("show"));
  setTimeout(()=> {
    el.classList.remove("show");
    setTimeout(()=> el.remove(), 240);
  }, 1600);
}
/**
 * Európai rulett számsorrend (0–36)
 * Forrás: standard european single-zero sequence
 */
const EURO_SEQ = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];

// piros számok
const REDS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const BLACKS = new Set([2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35]);

// rajzolási paraméterek
const SIZE = 420;
const CX = SIZE/2, CY = SIZE/2;
const R_OUT = 200;    // külső kör
const R_IN  = 120;    // belső kör (számokig)
const R_BALL= 165;    // golyó sugara

// állapot
let selectedBet = null;      // "red" | "black" | "odd" | "even" | "straight"
let straightNumber = null;   // egy számos tét
let spinning = false;
let lastBetsSnapshot = null;
const undoStack = [];

let ctx;
// több számra tét – szám -> összeg
const straightBets = new Map();
// aktív chip érték
let chipValue = 100;
// history (utolsó 12 szám)
const history = [];
const outsideBets = new Map();


/** segéd: szám színe */
function colorOf(n){
  if(n === 0) return "#1fa968"; // zöld
  if(REDS.has(n)) return "#e63946"; // piros
  return "#1e293b"; // fekete (sötétkékes, hogy illjen a témához)
}

/** kerék kirajzolása adott ballAngle esetén (a kerék áll, a golyó forog) */
function drawWheel(ballAngle, highlightIndex = -1){
  ctx.clearRect(0,0,SIZE,SIZE);

  const sectorAngle = (Math.PI*2)/EURO_SEQ.length;

  // szektorok
  for(let i=0;i<EURO_SEQ.length;i++){
    const a0 = -Math.PI/2 + i*sectorAngle;
    const a1 = a0 + sectorAngle;
    ctx.beginPath();
    ctx.moveTo(CX,CY);
    ctx.arc(CX,CY,R_OUT,a0,a1);
    ctx.closePath();
    ctx.fillStyle = colorOf(EURO_SEQ[i]);
    ctx.fill();

    // highlight keret
    if(i === highlightIndex){
      ctx.strokeStyle = "#49d8ff";
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  // belső kör
  ctx.beginPath();
  ctx.arc(CX,CY,R_IN,0,Math.PI*2);
  ctx.fillStyle = "#0d1322";
  ctx.fill();

  // számok
  ctx.fillStyle = "#e7eef7";
  ctx.font = "12px Inter, Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for(let i=0;i<EURO_SEQ.length;i++){
    const ang = -Math.PI/2 + (i+0.5)*sectorAngle;
    const tx = CX + Math.cos(ang)*(R_IN+28);
    const ty = CY + Math.sin(ang)*(R_IN+28);
    ctx.save();
    ctx.translate(tx,ty);
    ctx.rotate(ang+Math.PI/2);
    ctx.fillText(String(EURO_SEQ[i]),0,0);
    ctx.restore();
  }

  // golyó
  const bx = CX + Math.cos(ballAngle)*R_BALL;
  const by = CY + Math.sin(ballAngle)*R_BALL;
  ctx.beginPath();
  ctx.arc(bx,by,8,0,Math.PI*2);
  ctx.fillStyle="#fff";
  ctx.fill();
}

function buildRouletteTable(){
  const wrap = document.getElementById("rouletteTable");
  wrap.innerHTML = "";

  // bal oldali 0
  const zero = document.createElement("div");
  zero.className = "rt-cell rt-green rt-zero";
  zero.dataset.n = "0";
  zero.textContent = "0";
  wrap.appendChild(zero);

  // 1..36 három sorban (klasszikus asztal)
  // sor1: 3,6,9,...,36
  // sor2: 2,5,8,...,35
  // sor3: 1,4,7,...,34
  const rows = [[],[],[]];
  for(let c=1;c<=12;c++){
    rows[0].push(c*3);
    rows[1].push(c*3-1);
    rows[2].push(c*3-2);
  }
  const seq = rows.flat(); // 3,6,9,..., 2,5,8,..., 1,4,7,...

  for(const n of seq){
    const d = document.createElement("div");
    d.className = "rt-cell " + (n===0 ? "rt-green" : (REDS.has(n) ? "rt-red":"rt-black"));
    d.dataset.n = String(n);
    d.textContent = String(n);
    wrap.appendChild(d);
  }

  // click → chip hozzáadás; right-click → chip levétel
  wrap.addEventListener("click", onCellClick);
  wrap.addEventListener("contextmenu", onCellRightClick);
  refreshBadges();
}

function snapshotBets(){
  return {
    straight: new Map(straightBets),
    outside:  new Map(outsideBets)
  };
}
function restoreBets(snap){
  straightBets.clear();
  outsideBets.clear();
  if(snap){
    snap.straight.forEach((v,k)=>straightBets.set(k,v));
    snap.outside.forEach((v,k)=>outsideBets.set(k,v));
  }
  refreshBadges();
  updateBetTotalUI();
}
function doubleBets(){
  // duplázunk mindent, tétlimit nélkül (ha kell limit, be tudjuk tenni)
  for(const [k,v] of straightBets) straightBets.set(k, v*2);
  for(const [k,v] of outsideBets)  outsideBets.set(k, v*2);
  refreshBadges();
  updateBetTotalUI();
}


function onOutsideClick(e){
  const cell = e.target.closest(".rt-out");
  if(!cell) return;
  const key = cell.dataset.out; // 'red' | 'black' | 'odd' | 'even'
  const prev = outsideBets.get(key) || 0;
  outsideBets.set(key, prev + chipValue);
  refreshBadges();
  updateBetTotalUI();
}
function onOutsideRightClick(e){
  const cell = e.target.closest(".rt-out");
  if(!cell) return;
  e.preventDefault();
  const key = cell.dataset.out;
  const prev = outsideBets.get(key) || 0;
  if(prev <= 0) return;
  const next = Math.max(0, prev - chipValue);
  if(next === 0) outsideBets.delete(key);
  else outsideBets.set(key, next);
  refreshBadges();
  updateBetTotalUI();
}


function onCellClick(e){
  const cell = e.target.closest(".rt-cell");
  if(!cell) return;
  const n = Number(cell.dataset.n);
  const prev = straightBets.get(n) || 0;
  straightBets.set(n, prev + chipValue);
  refreshBadges();
  updateBetTotalUI();
}

function onCellRightClick(e){
  const cell = e.target.closest(".rt-cell");
  if(!cell) return;
  e.preventDefault();
  const n = Number(cell.dataset.n);
  const prev = straightBets.get(n) || 0;
  if(prev <= 0) return;
  const next = Math.max(0, prev - chipValue);
  if(next === 0) straightBets.delete(n);
  else straightBets.set(n, next);
  refreshBadges();
  updateBetTotalUI();
}

function refreshBadges(){
  // távolítsuk el a régi chipeket
  document.querySelectorAll(".rt-cell .rt-chip, .rt-out .rt-chip").forEach(b=>b.remove());

  // SZÁMOS chipek
  for(const [n,amt] of straightBets){
    const cell = document.querySelector(`.rt-cell[data-n="${n}"]`);
    if(!cell) continue;
    const chip = document.createElement("div");
    chip.className = "rt-chip";
    const displayValue = chipValue >= 1000 ? `${chipValue/1000}k` : `${chipValue}`;
    chip.textContent = displayValue;
    const count = Math.round(amt / chipValue);
    if(count > 1){
      const mult = document.createElement("em");
      mult.textContent = `×${count}`;
      chip.appendChild(mult);
    }
    cell.appendChild(chip);
  }

  // OUTSIDE chipek
  for(const [key,amt] of outsideBets){
    const cell = document.querySelector(`.rt-out[data-out="${key}"]`);
    if(!cell) continue;
    const chip = document.createElement("div");
    chip.className = "rt-chip";
    const displayValue = chipValue >= 1000 ? `${chipValue/1000}k` : `${chipValue}`;
    chip.textContent = displayValue;
    const count = Math.round(amt / chipValue);
    if(count > 1){
      const mult = document.createElement("em");
      mult.textContent = `×${count}`;
      chip.appendChild(mult);
    }
    cell.appendChild(chip);
  }
}



function updateBetTotalUI(){
  const totalStraight = [...straightBets.values()].reduce((a,b)=>a+b,0);
  const totalOutside  = [...outsideBets.values()].reduce((a,b)=>a+b,0);
  const total = totalStraight + totalOutside;
  document.getElementById("betTotal").textContent = total.toLocaleString("hu-HU");
}



/** easing – kifutásra */
function easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }

/** adott ballAngle-hez melyik szektor tartozik */
function sectorIndexFromAngle(angleRad){
  // normalizáljuk [-pi, pi] -> [0, 2pi)
  let a = angleRad % (Math.PI*2);
  if(a < 0) a += Math.PI*2;

  // a 0. szektor középvonala -PI/2 + sector/2
  const sectorAngle = (Math.PI*2)/EURO_SEQ.length;

  // melyik szektor középpontja van legközelebb az angle-hez
  // a szektor "slicing" helyett könnyen: floor((angle + PI/2)/sectorAngle)
  const idx = Math.floor( (a + Math.PI/2) / sectorAngle ) % EURO_SEQ.length;
  return idx;
}

function isWin(result, type, straightN){
  if(type === "red")   return REDS.has(result);
  if(type === "black") return BLACKS.has(result);
  if(type === "odd")   return result % 2 === 1;
  if(type === "even")  return result !== 0 && result % 2 === 0;
  if(type === "straight") return result === straightN;
  return false;
}

export function initRoulette(){
  const canvas = document.getElementById("rouletteCanvas");
  const msg    = document.getElementById("rouletteMsg");
  const spinBtn = document.getElementById("btnSpin");
  if (!canvas || !spinBtn) return;

  // canvas ctx + első rajz
  ctx = canvas.getContext("2d");
  drawWheel(0, -1);

  // tábla felépítése
  buildRouletteTable();

  // chip választó gombok
  document.querySelectorAll(".chip").forEach(btn=>{
    btn.onclick = ()=>{
      document.querySelectorAll(".chip").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      chipValue = Number(btn.dataset.chip);
      const cv = document.getElementById("chipValueView");
      if (cv) cv.textContent = chipValue.toLocaleString("hu-HU");
    };
  });
  // alap aktív chip
  const firstChip = document.querySelector('.chip[data-chip="100"]');
  if(firstChip) firstChip.classList.add("active");

  // outside (red/black/odd/even) kattintások
  const outsideRow = document.getElementById("outsideRow");
  if (outsideRow){
    outsideRow.addEventListener("click", onOutsideClick);
    outsideRow.addEventListener("contextmenu", onOutsideRightClick);
  }

  // törlés gomb
  const clearBtn = document.getElementById("btnClear");
  // ---- Bet tools ----
const btnUndo   = document.getElementById("btnUndo");
const btnRepeat = document.getElementById("btnRepeat");
const btnDouble = document.getElementById("btnDouble");

if(btnUndo){
  btnUndo.onclick = ()=>{
    if(undoStack.length === 0) return;
    const prev = undoStack.pop();
    restoreBets(prev);
  };
}
if(btnRepeat){
  btnRepeat.onclick = ()=>{
    if(!lastBetsSnapshot) return;
    restoreBets(lastBetsSnapshot);
  };
}
if(btnDouble){
  btnDouble.onclick = ()=>{
    // snapshot az undo-hoz
    undoStack.push(snapshotBets());
    doubleBets();
  };
}

  if (clearBtn){
    clearBtn.onclick = ()=>{
      outsideBets.clear();
      straightBets.clear();
      refreshBadges();
      updateBetTotalUI();
    };
  }

  // induló UI
  updateBetTotalUI();
  msg.textContent = "Válassz téteket, majd SPIN.";

  // === SPIN ===
  let spinning = false;
  spinBtn.onclick = async ()=>{
    if (spinning) return;
    const name = currentProfile();
    if (!name){ msg.textContent = "Adj meg profilnevet a főoldalon."; return; }

    // teljes tét: számos + outside
    const totalStraight = [...straightBets.values()].reduce((a,b)=>a+b,0);
    const totalOutside  = [...outsideBets.values()].reduce((a,b)=>a+b,0);
    const totalBet = totalStraight + totalOutside;
    if (totalBet <= 0){ msg.textContent = "Nincs tét."; return; }
    if (getBalance(name) < totalBet){ msg.textContent = "Nincs elég egyenleg!"; return; }

    // levonás + azonnali balance frissítés
    const res = placeBet(name, totalBet);
    if (!res.ok){ msg.textContent = res.reason || "Nem sikerült a tét."; return; }
    updateTopBalance(name);
    if (typeof refreshLeaderboard === "function") refreshLeaderboard();
    undoStack.push(snapshotBets());
    lastBetsSnapshot = snapshotBets();
    spinning = true;
    msg.textContent = "Pörgetés...";
    

    // RNG cél + animáció
    const resultNumber = randInt(0,36);
    const targetIndex = EURO_SEQ.indexOf(resultNumber);
    const sectorAngle = (Math.PI*2)/EURO_SEQ.length;
    const startAngle = randFloat() * Math.PI*2;
    const extraTurns = 4 + randInt(0,2);
    const targetAngleCenter = -Math.PI/2 + (targetIndex + 0.5) * sectorAngle;
    const totalDelta = extraTurns * (Math.PI*2) + ((targetAngleCenter - startAngle) % (Math.PI*2));
    const DURATION = 3500;
    const t0 = performance.now();

    await new Promise(resolve=>{
      function frame(t){
        const p = Math.min(1, (t - t0)/DURATION);
        const eased = 1 - Math.pow(1 - p, 3);
        const ang = startAngle + totalDelta * eased;
        const idx = sectorIndexFromAngle(ang);
        drawWheel(ang, idx);
        if(p < 1) requestAnimationFrame(frame); else resolve();
      }
      requestAnimationFrame(frame);
    });

    const finalIdx = sectorIndexFromAngle(startAngle + totalDelta);
    const finalNumber = EURO_SEQ[finalIdx];

    // kifizetés számítása
    let win = 0;

    // outside 1:1 (kifizetés 2×)
    for(const [key,amt] of outsideBets){
      if((key === "red"   && REDS.has(finalNumber)) ||
         (key === "black" && BLACKS.has(finalNumber)) ||
         (key === "odd"   && finalNumber % 2 === 1) ||
         (key === "even"  && finalNumber !== 0 && finalNumber % 2 === 0)){
        win += amt * 2;
      }
    }

    // straight (35:1 → 36×)
    for(const [n,amt] of straightBets){
      if(n === finalNumber){
        win += amt * 36;
      }
    }

    if (win > 0){
      payout(name, win);
      showWinBanner("rouletteModal", win, "Roulette nyeremény");
      updateTopBalance(name);
      if (typeof refreshLeaderboard === "function") refreshLeaderboard();
      msg.textContent = `🎉 ${finalNumber} — Nyeremény: +${win.toLocaleString("hu-HU")} token`;
    } else {
      msg.textContent = `😕 ${finalNumber} — Veszítettél`;
    }

    addToHistory(finalNumber);
    spinning = false;
  };

  // megnyitáskor ürítjük a régi téteket és frissítjük a UI-t
  outsideBets.clear();
  straightBets.clear();
  refreshBadges();
  updateBetTotalUI();
}

function addToHistory(n){
  history.unshift(n);
  if(history.length > 12) history.pop();
  const box = document.getElementById("historyList");
  box.innerHTML = "";
  for(const v of history){
    const d = document.createElement("div");
    d.className = "h-item " + (v===0 ? "h-green" : (REDS.has(v) ? "h-red":"h-black"));
    d.textContent = String(v);
    box.appendChild(d);
  }
}
