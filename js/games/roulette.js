import { randInt } from "../rng.js";
import { getBalance, placeBet, payout } from "../wallet.js";

const PROFILE_KEY = "mini-casino:currentProfile";
function currentProfile() {
  return sessionStorage.getItem(PROFILE_KEY) || "";
}

export function initRoulette() {
  const modal = document.getElementById("rouletteModal");
  const msg = document.getElementById("rouletteMsg");

  const betInput = document.getElementById("rouletteBet");
  const canvas = document.getElementById("rouletteCanvas");
  const ctx = canvas.getContext("2d");

  let selectedBet = null;
  let straightNumber = null;

  // gombok
  document.getElementById("btnRed").onclick = () => setBet("red");
  document.getElementById("btnBlack").onclick = () => setBet("black");
  document.getElementById("btnOdd").onclick = () => setBet("odd");
  document.getElementById("btnEven").onclick = () => setBet("even");
  document.getElementById("btnStraight").onclick = () => {
    const n = prompt("Melyik számra teszel? (0–36)");
    if (n === null) return;
    const num = Number(n);
    if (num < 0 || num > 36) return alert("Érvénytelen szám!");
    straightNumber = num;
    setBet("straight");
  };

  function setBet(betType) {
    selectedBet = betType;
    msg.textContent = `Tét kiválasztva: ${betType}${straightNumber !== null ? " " + straightNumber : ""}`;
    spin();
  }

  function drawWheel(result) {
    ctx.clearRect(0,0,300,300);
    
    ctx.beginPath();
    ctx.arc(150,150,140,0,Math.PI*2);
    ctx.fillStyle = "#1a2539";
    ctx.fill();

    // labda
    if (result !== null) {
      ctx.beginPath();
      ctx.arc(150,50,10,0,Math.PI*2);
      ctx.fillStyle = "white";
      ctx.fill();
      ctx.font = "18px Arial";
      ctx.fillText(result, 138, 150);
    }
  }

  drawWheel(null);

  function spin() {
    const name = currentProfile();
    if (!name) return alert("Előbb adj meg játékos nevet!");

    const bet = Number(betInput.value);
    const bal = getBalance(name);

    if (bal < bet) return alert("Nincs elég egyenleg!");

    placeBet(name, bet);

    const result = randInt(0,36); // egyenlő esély minden számra

    drawWheel(result);

    let win = 0;

    if (selectedBet === "red" && isRed(result)) win = bet * 2;
    if (selectedBet === "black" && isBlack(result)) win = bet * 2;
    if (selectedBet === "odd" && result % 2 === 1) win = bet * 2;
    if (selectedBet === "even" && result !== 0 && result % 2 === 0) win = bet * 2;
    if (selectedBet === "straight" && result === straightNumber) win = bet * 36;

    if (win > 0) {
      payout(name, win);
      msg.textContent = `🎉 Nyeremény: +${win} token!`;
    } else {
      msg.textContent = `😢 Veszítettél (${result})`;
    }
  }

  function isRed(n) {
    return [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36].includes(n);
  }
  function isBlack(n) {
    return [2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35].includes(n);
  }
}
