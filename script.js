/* Hollow Creek — local browser prototype.
   For true online multiplayer, move game state and all role/action resolution
   to a trusted backend. This file intentionally simulates the other players. */
const $ = (id) => document.getElementById(id);

const ROLE_INFO = {
  Villager: { team: "Town", icon: "🧑‍🌾", description: "You have no night ability. Listen carefully, compare stories, and help vote out the Mafia." },
  Mafia: { team: "Mafia", icon: "🕵️", description: "At night, secretly choose someone to eliminate. During the day, blend in and avoid suspicion." },
  Doctor: { team: "Town", icon: "🩺", description: "Protect one person each night. You cannot protect the same person two nights in a row." },
  Detective: { team: "Town", icon: "🔎", description: "Investigate one person each night to learn whether they are Mafia or Innocent." }
};
const AVATARS = ["🧑🏻","👩🏽","🧔🏻","👩🏼","🧑🏾","👨🏼","👩🏻‍🦰","🧑🏽‍🦱","👨🏿","👩🏾‍🦱","🧑🏼‍🦰","👨🏻‍🦳"];
const COLORS = ["#dba47f","#a4b7eb","#d5a4b8","#b7d6a6","#e7c36d","#b7a0dc","#81c6c8","#d88f7c","#8fa5bd","#d4b7a1","#b7c5a1","#cf9bbd"];
const NAMES = ["Dani","Milo","Iris","Theo","Luna","Felix","Maeve","Jasper","Cleo","Rowan","Nico","Wren"];
let game = null;
let timerInterval = null;
let feedEntries = [];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function makeRoster(count) {
  const roles = [];
  const mafia = Math.max(1, Math.floor(count / 4));
  for (let i=0;i<mafia;i++) roles.push("Mafia");
  if (count >= 6) roles.push("Doctor");
  if (count >= 7) roles.push("Detective");
  while (roles.length < count) roles.push("Villager");
  return shuffle(roles).map((role, i) => ({
    id: i, name: NAMES[i], avatar: AVATARS[i], color: COLORS[i], role,
    alive: true, isHuman: i === 0, lastProtected: null, suspicion: 0
  }));
}
function me() { return game?.players.find(p => p.isHuman); }
function alive() { return game.players.filter(p => p.alive); }
function byId(id) { return game.players.find(p => p.id === Number(id)); }
function log(message, type="") {
  feedEntries.unshift({message,type});
  feedEntries = feedEntries.slice(0,18);
  $("notification-feed").innerHTML = feedEntries.map(e =>
    `<div class="feed-entry ${e.type}"><span class="feed-dot"></span><p>${escapeHtml(e.message)}</p></div>`
  ).join("");
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function showModal(kicker, title, copy, symbol, buttonText="Continue", callback=null) {
  $("modal-kicker").textContent = kicker;
  $("modal-title").textContent = title;
  $("modal-copy").textContent = copy;
  $("modal-symbol").textContent = symbol;
  $("modal-button").textContent = buttonText;
  $("modal").classList.remove("hidden");
  $("modal-button").onclick = () => {
    $("modal").classList.add("hidden");
    if (callback) callback();
  };
}
function setPhase(phase, title, message, seconds=null) {
  game.phase = phase;
  $("phase-title").textContent = title;
  $("phase-message").textContent = message;
  $("timer").textContent = seconds === null ? phase.toUpperCase() : `${seconds}s`;
  render();
}
function startRound() {
  if (timerInterval) clearInterval(timerInterval);
  const count = Number($("player-total").value);
  game = {round: (game?.round || 0) + 1, phase:"RoleReveal", players:makeRoster(count),
    day:1, votes:{}, lastDoctorTarget:null, running:false, countdown:0};
  feedEntries = [];
  $("notification-feed").innerHTML = "";
  log(`Round ${game.round} begins. ${count} people have gathered in Hollow Creek.`, "success");
  updateRoleCard();
  render();
  const human = me();
  const info = ROLE_INFO[human.role];
  showModal("YOUR ROLE IS SECRET", human.role, info.description,
    info.icon, "Enter Hollow Creek", () => {
      game.running = true;
      startLobbyCountdown();
    });
}
function startLobbyCountdown() {
  setPhase("Lobby", "The town is gathering", "The doors close in 15 seconds. Prepare for the first night.", 15);
  runCountdown(15, () => startNight());
}
function runCountdown(seconds, callback) {
  if (timerInterval) clearInterval(timerInterval);
  let left = seconds;
  $("timer").textContent = `${left}s`;
  timerInterval = setInterval(() => {
    left--;
    $("timer").textContent = `${Math.max(left,0)}s`;
    if (left <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      callback();
    }
  }, 1000);
}
function updateRoleCard() {
  const human = me();
  if (!human) return;
  const info = ROLE_INFO[human.role];
  $("role-icon").textContent = info.icon;
  $("player-role").textContent = human.role;
  $("role-description").textContent = info.description;
  $("role-team").textContent = info.team.toUpperCase();
  $("role-team").className = `team-tag ${info.team.toLowerCase()}`;
}
function render() {
  if (!game) return;
  $("round-number").textContent = game.round;
  $("alive-count").textContent = alive().length;
  $("player-count").textContent = `${game.players.length} players`;
  renderPlayers();
  renderMap();
  renderActions();
}
function renderPlayers() {
  $("player-list").innerHTML = game.players.map(p => `
    <div class="player-item ${p.alive ? "" : "dead"}">
      <div class="mini-avatar" style="--avatar:${p.color}">${p.alive ? p.avatar : "👻"}</div>
      <div style="min-width:0"><div class="player-name">${escapeHtml(p.name)}${p.isHuman ? " (you)" : ""}</div>
      <span class="player-status">${p.alive ? "● Alive" : "✕ Eliminated"}</span></div>
    </div>`).join("");
}
function renderMap() {
  const positions = [
    [33,37],[67,37],[29,57],[71,57],[42,31],[58,31],
    [40,68],[60,68],[23,48],[77,48],[48,24],[52,76]
  ];
  $("map-characters").innerHTML = game.players.map((p,i) => {
    const [x,y] = positions[i];
    return `<div class="map-person ${p.alive ? "" : "dead"}" style="left:${x}%;top:${y}%">
      <div class="avatar" style="--avatar:${p.color}">${p.alive ? p.avatar : "👻"}</div>
      <small>${escapeHtml(p.name)}</small></div>`;
  }).join("");
}
function renderActions() {
  const area = $("action-area");
  if (!game.running) return;
  const human = me();
  area.innerHTML = "";
  let heading = "Waiting for the next phase";
  let instruction = "Keep an eye on the town bulletin.";
  if (game.phase === "Night") {
    heading = "Night action";
    if (!human.alive) {
      instruction = "You have been eliminated. Watch the round unfold as a spectator.";
      area.innerHTML = `<p class="subtle">${instruction}</p>`;
    } else if (["Mafia","Doctor","Detective"].includes(human.role)) {
      instruction = human.role === "Mafia" ? "Choose someone to target. Your Mafia allies act secretly too." :
        human.role === "Doctor" ? "Choose someone to protect from tonight's attack." :
        "Choose someone to investigate. Your result will be private.";
      area.appendChild(makeText(instruction, "p", "subtle"));
      alive().filter(p=>p.id!==human.id).forEach(p => {
        const btn = document.createElement("button");
        btn.className = "choice-button";
        btn.innerHTML = `<span class="choice-emoji">${p.avatar}</span><span>${escapeHtml(p.name)}<span class="choice-sub">Select this player</span></span>`;
        btn.onclick = () => submitNightAction(p.id);
        area.appendChild(btn);
      });
    } else {
      area.innerHTML = `<p class="subtle">You are a Villager. You have no night action. Wait for dawn.</p>`;
    }
  } else if (game.phase === "Discussion") {
    heading = "Discuss your suspicions";
    instruction = "The townspeople share clues. Read the bulletin, then prepare to vote.";
    area.innerHTML = `<p class="subtle">${instruction}</p><button class="primary-button" id="discussion-done">I'm ready to vote →</button>`;
    $("discussion-done").onclick = () => startVoting();
  } else if (game.phase === "Voting") {
    heading = "Who should be voted out?";
    instruction = "Choose one living player. Your vote can be changed until voting closes.";
    area.appendChild(makeText(instruction,"p","subtle"));
    alive().filter(p=>p.id!==human.id).forEach(p => {
      const btn = document.createElement("button");
      btn.className = "choice-button";
      const votes = Object.values(game.votes).filter(id=>id===p.id).length;
      btn.innerHTML = `<span class="choice-emoji">${p.avatar}</span><span>${escapeHtml(p.name)}<span class="choice-sub">${votes} vote${votes===1?"":"s"} · Tap to vote</span></span>`;
      btn.onclick = () => castVote(p.id);
      area.appendChild(btn);
    });
  } else if (game.phase === "Results") {
    heading = "Round complete";
    instruction = "The roles have been revealed. Start another round when you're ready.";
    area.innerHTML = `<p class="subtle">${instruction}</p><button class="primary-button" id="again-button">↻ Play another round</button>`;
    $("again-button").onclick = startRound;
  } else {
    heading = "Ready to begin?";
    instruction = "Choose the number of players, then begin the game.";
    area.innerHTML = `<label class="setup-label" for="player-total">Players in town</label>
      <select id="player-total">${[6,7,8,9,10,11,12].map(n=>`<option value="${n}">${n} players</option>`).join("")}</select>
      <button id="start-button" class="primary-button">✨ Start a new round</button>
      <p class="small-note">You play as Dani. The other townspeople are computer-controlled characters.</p>`;
    $("start-button").onclick = startRound;
  }
  $("action-heading").textContent = heading;
  $("action-instructions").textContent = game.phase === "Night" || game.phase === "Voting" ? "" : instruction;
}
function makeText(text, tag="p", cls="") {
  const el = document.createElement(tag);
  el.className = cls;
  el.textContent = text;
  return el;
}
function submitNightAction(targetId) {
  const human = me(), target = byId(targetId);
  if (!human.alive || game.phase!=="Night") return;
  if (human.role==="Doctor" && human.lastProtected===targetId) {
    log("You cannot protect the same person on two consecutive nights.");
    return;
  }
  if (human.role==="Mafia") game.nightKill = targetId;
  if (human.role==="Doctor") { game.nightProtect=targetId; human.lastProtected=targetId; }
  if (human.role==="Detective") {
    log(`Investigation: ${target.name} is ${target.role==="Mafia"?"MAFIA":"INNOCENT"}.`, "success");
    showModal("PRIVATE INVESTIGATION", target.role==="Mafia"?"Mafia detected!":"Appears innocent",
      `${target.name} is ${target.role==="Mafia"?"Mafia":"Innocent"}. Keep this information secret.`, "🔎", "Keep it secret");
  } else {
    log(`Your ${human.role.toLowerCase()} action has been submitted.`);
  }
  renderActions();
}
function startNight() {
  if (!game || !game.running) return;
  if (checkWinner()) return endRound(checkWinner());
  game.nightKill = null; game.nightProtect = null; game.votes = {};
  setPhase("Night","Night falls over Hollow Creek","The streets grow quiet. Special roles, make your move.",30);
  renderActions();
  runCountdown(30, resolveNight);
  // Computer-controlled special roles choose their actions.
  const bots = alive().filter(p=>!p.isHuman);
  const mafiaBots = bots.filter(p=>p.role==="Mafia");
  const mafiaTargets = alive().filter(p=>p.role!=="Mafia");
  if (mafiaBots.length && mafiaTargets.length && !me().role==="Mafia") {}
  if (mafiaBots.length && mafiaTargets.length) {
    const target = choose(mafiaTargets.filter(p=>p.id!==me().id)) || choose(mafiaTargets);
    if (target) game.nightKill = target.id;
  }
  const doctor = bots.find(p=>p.role==="Doctor" && p.alive);
  if (doctor) {
    const options = alive().filter(p=>p.id!==doctor.id && p.id!==doctor.lastProtected);
    const target = choose(options);
    if (target) { game.nightProtect=target.id; doctor.lastProtected=target.id; }
  }
  const detective = bots.find(p=>p.role==="Detective" && p.alive);
  if (detective) {
    const target = choose(alive().filter(p=>p.id!==detective.id));
    if (target && target.role==="Mafia") target.suspicion += 2;
  }
}
function choose(arr) { return arr.length ? arr[Math.floor(Math.random()*arr.length)] : null; }
function resolveNight() {
  if (!game || game.phase!=="Night") return;
  if (game.nightKill !== null && game.nightKill !== game.nightProtect) {
    const victim = byId(game.nightKill);
    if (victim?.alive) {
      victim.alive=false;
      log(`Dawn breaks. ${victim.name} was found eliminated. Their role will remain secret until the round ends.`, "death");
    } else log("Dawn breaks, but nobody was eliminated.");
  } else {
    log("Dawn breaks. Nobody was eliminated.", "success");
  }
  render();
  const winner=checkWinner();
  if (winner) return endRound(winner);
  setPhase("Dawn","Dawn breaks","The town gathers to share what they know.",5);
  runCountdown(5, startDiscussion);
}
function startDiscussion() {
  setPhase("Discussion","The town is in session","Talk through the clues. Someone's story may not add up.",60);
  botDiscussion();
  renderActions();
  runCountdown(60, startVoting);
}
function botDiscussion() {
  const suspects=alive().filter(p=>p.role==="Mafia" && !p.isHuman);
  if (suspects.length) {
    const s=choose(suspects);
    log(`${choose(alive().filter(p=>p.id!==s.id))?.name || "A villager"} says: "I have a strange feeling about ${s.name}."`);
  } else {
    log(`${choose(alive())?.name || "Someone"} says: "We need to compare everyone's stories."`);
  }
  const aliveMafia=alive().filter(p=>p.role==="Mafia").length;
  if (aliveMafia) alive().filter(p=>p.role!=="Mafia").forEach(p=>p.suspicion += Math.random()*.3);
}
function startVoting() {
  if (!game || !game.running || game.phase==="Results") return;
  setPhase("Voting","Cast your vote","Choose carefully. You can change your vote before time runs out.",30);
  renderActions();
  // Bots vote based on suspicion, with some randomness.
  alive().filter(p=>!p.isHuman).forEach(voter=>{
    const candidates=alive().filter(p=>p.id!==voter.id);
    if (!candidates.length) return;
    const ranked=candidates.map(p=>({p,score:p.suspicion+(Math.random()*.8)}))
      .sort((a,b)=>b.score-a.score);
    let target=ranked[0].p;
    // Mafia tend to deflect suspicion away from themselves.
    if (voter.role==="Mafia") target=choose(candidates.filter(p=>p.role!=="Mafia")) || target;
    game.votes[voter.id]=target.id;
  });
  renderActions();
  runCountdown(30, resolveVoting);
}
function castVote(targetId) {
  if (game.phase!=="Voting" || !me().alive) return;
  game.votes[me().id]=targetId;
  const target=byId(targetId);
  log(`You voted for ${target.name}. You may change your vote before voting closes.`);
  renderActions();
}
function resolveVoting() {
  if (!game || game.phase!=="Voting") return;
  const counts={};
  Object.entries(game.votes).forEach(([voterId,targetId])=>{
    if (byId(voterId)?.alive && byId(targetId)?.alive) counts[targetId]=(counts[targetId]||0)+1;
  });
  const entries=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  const total=entries.reduce((sum,e)=>sum+e[1],0);
  if (!entries.length) log("No valid votes were cast.");
  else {
    const highest=entries[0][1], tied=entries.filter(e=>e[1]===highest);
    if (tied.length===1 && highest>total/2) {
      const out=byId(tied[0][0]);
      out.alive=false;
      log(`${out.name} was voted out by the town. Their role remains secret until the end of the round.`, "death");
    } else log("The vote ended without a strict majority. Nobody was eliminated.");
  }
  render();
  const winner=checkWinner();
  if (winner) return endRound(winner);
  game.day++;
  setPhase("Dawn","The town takes a breath","The next night is approaching...",5);
  runCountdown(5,startNight);
}
function checkWinner() {
  if (!game) return null;
  const mafia=alive().filter(p=>p.role==="Mafia").length;
  const town=alive().filter(p=>p.role!=="Mafia").length;
  if (mafia===0) return "Town";
  if (mafia>=town) return "Mafia";
  if (mafia+town===0) return "Town";
  return null;
}
function endRound(winner) {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval=null;
  game.phase="Results";
  game.running=false;
  render();
  const human=me();
  const won=(winner==="Town" && human.role!=="Mafia") || (winner==="Mafia" && human.role==="Mafia");
  $("phase-title").textContent=`${winner} wins!`;
  $("phase-message").textContent="The mystery is solved. Every secret comes to light.";
  $("timer").textContent="GAME OVER";
  log(`${winner} wins the round!`, "success");
  const reveal=game.players.map(p=>`${p.name}: ${p.role}${p.alive?"":" (eliminated)"}`).join(" · ");
  $("action-heading").textContent="All roles revealed";
  $("action-instructions").textContent=reveal;
  renderActions();
  showModal("ROUND COMPLETE",`${winner} wins!`,`${won?"Congratulations — your team won!":"Your team lost this time."} All roles: ${reveal}`,winner==="Town"?"🏘️":"🕵️","Play again",startRound);
}
$("start-button").addEventListener("click", startRound);
$("clear-feed").addEventListener("click",()=>{feedEntries=[];$("notification-feed").innerHTML="";});
render();
