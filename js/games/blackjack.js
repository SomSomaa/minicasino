import { getBalance, placeBet, payout } from "../wallet.js";
import { randInt } from "../rng.js";

// --- profil olvasása (ugyanaz a kulcs, mint máshol) ---
const PROFILE_KEY = "mini-casino:currentProfile";
function currentProfile() {
  return sessionStorage.getItem(PROFILE_KEY) || "";
}

// --- Anim segédek ---
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function makeCardEl(card, hidden = false) {
  const d = document.createElement("div");
  d.className =
    "bj-card" +
    (hidden ? " hidden" : "") +
    ((card.s === "♥" || card.s === "♦") ? " red" : "");
  if (!hidden) {
    const small = document.createElement("div");
    small.className = "small";
    small.textContent = card.r;
    const big = document.createElement("div");
    big.className = "big";
    big.textContent = card.s;
    d.appendChild(small);
    d.appendChild(big);
  }
  return d;
}

async function appendAnimated(handId, card, { hidden = false, enterDelay = 180 } = {}) {
  const hand = document.getElementById(handId);
  const el = makeCardEl(card, hidden);
  el.classList.add("enter");
  hand.appendChild(el);
  requestAnimationFrame(() => el.classList.add("in"));
  await delay(enterDelay);
}

async function flipDealerHole() {
  const dd = document.getElementById("bjDealer");
  if (!dd || !dd.firstChild) return;
  const visible = makeCardEl(dealer[0], false);
  visible.classList.add("flip-start");
  dd.replaceChild(visible, dd.firstChild);
  await delay(10);
  visible.classList.remove("flip-start");
  visible.classList.add("flip-end");
  await delay(220);
}

// --- Állapot ---
let shoe = [];
let bet = 0;
let chipValue = 100;
let inRound = false;
let canDouble = false;
let player = [];
let dealer = [];
const history = [];

// --- Kártya eszközök ---
const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

function buildShoe(decks = 6) {
  const s = [];
  for (let d = 0; d < decks; d++) {
    for (const sUIT of SUITS) {
      for (const r of RANKS) {
        s.push({ r, s: sUIT });
      }
    }
  }
  for (let i = s.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [s[i], s[j]] = [s[j], s[i]];
  }
  return s;
}

function drawCard() {
  if (shoe.length < 60) shoe = buildShoe(6);
  return shoe.pop();
}

function cardValue(c) {
  if (c.r === "A") return 11;
  if (["J", "Q", "K"].includes(c.r)) return 10;
  return Number(c.r);
}

function handValue(arr) {
  let total = 0,
    aces = 0;
  for (const c of arr) {
    total += cardValue(c);
    if (c.r === "A") aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

function isBlackjack(arr) {
  return arr.length === 2 && handValue(arr) === 21;
}

// --- UI segédek ---
function el(id) {
  return document.getElementById(id);
}

function updateTopBalance(name) {
  const b = getBalance(name);
  const e = document.getElementById("balance");
  if (e) e.textContent = `${b.toLocaleString("hu-HU")} token`;
}

function updateBetUI() {
  el("bjBetTotal").textContent = bet.toLocaleString("hu-HU");
  el("bjChipValueView").textContent = chipValue.toLocaleString("hu-HU");
}

function setControls(state) {
  const deal = el("bjDeal"),
    hit = el("bjHit"),
    stand = el("bjStand"),
    dbl = el("bjDouble");
  if (state === "bet") {
    deal.disabled = false;
    hit.disabled = true;
    stand.disabled = true;
    dbl.disabled = true;
  } else if (state === "play") {
    deal.disabled = true;
    hit.disabled = false;
    stand.disabled = false;
    dbl.disabled = !canDouble;
  } else {
    deal.disabled = true;
    hit.disabled = true;
    stand.disabled = true;
    dbl.disabled = true;
  }
}

function showWinBanner(modalId, amount, label = "Nyeremény") {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  const box = modal.querySelector(".modal-content.game-modal") || modal;
  const el = document.createElement("div");
  el.className = "win-banner";
  el.innerHTML = `
    <div class="win-amount">+${amount.toLocaleString("hu-HU")} token</div>
    <div class="win-label">${label}</div>
  `;
  box.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 240);
  }, 1600);
}

// --- Fő folyamat ---
export function initBlackjack() {
  shoe = buildShoe(6);
  bet = 0;
  inRound = false;
  canDouble = false;
  player = [];
  dealer = [];

  el("bjMsg").textContent = "Téteket helyezz, majd DEAL.";
  updateBetUI();
  setControls("bet");

  // --- Zsetonok (végleges, duplázásmentes) ---
  const chips = document.querySelectorAll("#bjChips .chip");
  chips.forEach(btn => {
    btn.onclick = null;
    btn.oncontextmenu = null;
  });

  chips.forEach(btn => {
    btn.onclick = () => {
      chips.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      chipValue = Number(btn.dataset.chip) || 0;
      bet += chipValue;
      updateBetUI();
    };
    btn.oncontextmenu = e => {
      e.preventDefault();
      chips.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      chipValue = Number(btn.dataset.chip) || 0;
      updateBetUI();
    };
  });

  el("bjClear").onclick = () => {
    bet = 0;
    updateBetUI();
  };

  // --- Gombok ---
  el("bjDeal").onclick = onDeal;
  el("bjHit").onclick = onHit;
  el("bjStand").onclick = onStand;
  el("bjDouble").onclick = onDouble;
}

async function onDeal() {
  const name = currentProfile();
  if (!name) {
    el("bjMsg").textContent = "Adj meg profilnevet a főoldalon.";
    return;
  }
  if (bet <= 0) {
    el("bjMsg").textContent = "Adj tétet a DEAL előtt.";
    return;
  }
  if (getBalance(name) < bet) {
    el("bjMsg").textContent = "Nincs elég egyenleg.";
    return;
  }

  const res = placeBet(name, bet);
  if (!res.ok) {
    el("bjMsg").textContent = res.reason || "Nem sikerült a tét levonása.";
    return;
  }
  updateTopBalance(name);

  inRound = true;
  canDouble = true;
  player = [];
  dealer = [];
  el("bjPlayer").innerHTML = "";
  el("bjDealer").innerHTML = "";
  el("bjMsg").textContent = "Játékban: Hit / Stand / Double.";
  setControls("play");

  dealer.push(drawCard());
  await appendAnimated("bjDealer", dealer[0], { hidden: true });
  player.push(drawCard());
  await appendAnimated("bjPlayer", player[0]);
  dealer.push(drawCard());
  await appendAnimated("bjDealer", dealer[1]);
  player.push(drawCard());
  await appendAnimated("bjPlayer", player[1]);

  el("bjPlayerTotal").textContent = `Össz: ${handValue(player)}`;
  if (isBlackjack(player) || isBlackjack(dealer)) await finishRound(true);
}

async function onHit() {
  if (!inRound) return;
  const c = drawCard();
  player.push(c);
  canDouble = false;
  await appendAnimated("bjPlayer", c);
  const p = handValue(player);
  el("bjPlayerTotal").textContent = `Össz: ${p}`;
  if (p > 21) await finishRound(true);
}

function onStand() {
  if (!inRound) return;
  finishRound(true);
}

function onDouble() {
  if (!inRound || !canDouble) return;
  const name = currentProfile();
  if (getBalance(name) < bet) {
    el("bjMsg").textContent = "Nincs elég egyenleg duplázni.";
    return;
  }
  const res = placeBet(name, bet);
  if (!res.ok) {
    el("bjMsg").textContent = res.reason || "Nem sikerült a duplázás.";
    return;
  }
  updateTopBalance(name);
  canDouble = false;
  player.push(drawCard());
  renderHands(false);
  finishRound(true, true);
}

async function finishRound(revealDealer, wasDouble = false) {
  const name = currentProfile();

  if (revealDealer) {
    await flipDealerHole();
    await delay(120);
    while (handValue(dealer) < 17) {
      const nc = drawCard();
      dealer.push(nc);
      await appendAnimated("bjDealer", nc);
      await delay(80);
    }
  }

  const p = handValue(player);
  const d = handValue(dealer);
  let win = 0;
  let msg = "";

  if (p > 21) msg = `Bust (${p}) – vesztes kör.`;
  else if (d > 21) { msg = `Dealer bust (${d}) – nyertél!`; win = bet * (wasDouble ? 4 : 2); }
  else if (isBlackjack(player) && !isBlackjack(dealer)) { msg = "Blackjack! Kifizetés 3:2."; win = Math.floor(bet * 2.5); }
  else if (isBlackjack(dealer) && !isBlackjack(player)) msg = "Dealer blackjack – veszítettél.";
  else if (p > d) { msg = `Nyertél: ${p} vs ${d}.`; win = bet * (wasDouble ? 4 : 2); }
  else if (p < d) msg = `Vesztettél: ${p} vs ${d}.`;
  else { msg = `Push: ${p} vs ${d}. Tét vissza.`; win = bet; }

  if (win > 0) {
    payout(name, win);
    updateTopBalance(name);
    showWinBanner("blackjackModal", win, "Blackjack nyeremény");
  }

  el("bjMsg").textContent = msg;
  inRound = false;
  canDouble = false;
  setControls("bet");
  bet = 0;
  updateBetUI();
}
