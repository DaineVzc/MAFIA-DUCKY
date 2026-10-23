// ===== CONFIG: tweak freely =====
const CFG={W:360,H:640,groundY:560,birdX:100,pipeW:56,flapSound:1,resumeCountdown:3,deathTime:1.8,invTime:1.5,lives:3,warnTime:.45,
 safeTop:150,safeBottom:450,
 birds:{classic:{g:900,flap:-300,maxFall:420,r:13},heavy:{g:1150,flap:-350,maxFall:520,r:15},feather:{g:650,flap:-250,maxFall:260,r:10},rocket:{g:1000,flap:-370,maxFall:560,r:12}},
 diff:{easy:{gap:175,speed:80,spacing:230,fire:[2.6,3.6],ball:150,sky:['#8fd8ff','#e6f7ff'],pipe:'#4cc24a',ground:'#8bd35a',bg:'meadow'},
  medium:{gap:150,speed:105,spacing:215,fire:[1.5,2.4],ball:190,sky:['#ff8c5a','#ffd9a0'],pipe:'#c9833f',ground:'#e0b070',bg:'desert'},
  hard:{gap:128,speed:135,spacing:205,fire:[.9,1.5],ball:250,sky:['#0c1030','#3b3f7a'],pipe:'#6b7f92',ground:'#2c3340',bg:'storm'}}};
const $=id=>document.getElementById(id),cv=$('c'),ctx=cv.getContext('2d'),W=CFG.W,H=CFG.H;
const COLORS=['#ffd23f','#ff6b6b','#4dabf7','#69db7c','#da77f2','#ff922b','#f8f9fa','#495057'];
let S={color:COLORS[0],type:'classic',diff:'easy'},best=+(localStorage.getItem('fbBest')||0),muted=false;
// ===== Audio =====
let AC;function sfx(f,f2,d,t='square',v=.08){if(muted)return;try{AC=AC||new (window.AudioContext||window.webkitAudioContext)();const o=AC.createOscillator(),g=AC.createGain(),n=AC.currentTime;o.type=t;o.frequency.setValueAtTime(f,n);o.frequency.exponentialRampToValueAtTime(Math.max(20,f2),n+d);g.gain.setValueAtTime(v,n);g.gain.exponentialRampToValueAtTime(.001,n+d);o.connect(g).connect(AC.destination);o.start();o.stop(n+d)}catch(e){}}
// ===== Bird drawing =====
function drawBird(c,x,y,type,col,ang=0,sx=1,sy=1,wing=0){const r=CFG.birds[type].r;c.save();c.translate(x,y);c.rotate(ang);c.scale(sx,sy);
 const k=type==='heavy'?1.25:type==='rocket'?1.05:type==='feather'?.95:1.1,R=r*k,ry=type==='rocket'?R*.82:R,ln=2.2;
 const dk='rgba(60,30,30,.85)',lt='rgba(255,255,255,.55)';c.lineJoin='round';
 // tail feathers
 c.fillStyle=col;c.strokeStyle=dk;c.lineWidth=ln;for(let i=-1;i<=1;i++){c.beginPath();c.ellipse(-R-3,i*5,8,3.6,i*.35,0,7);c.fill();c.stroke()}
 // fluffy fuzzy outline: ring of little puffs behind the body
 c.fillStyle=col;const n=type==='feather'?14:11;for(let i=0;i<n;i++){const a=i/n*6.283;c.beginPath();c.arc(Math.cos(a)*R*.92,Math.sin(a)*ry*.92,R*.32,0,7);c.fill()}
 // body
 c.beginPath();c.ellipse(0,0,R,ry,0,0,7);c.fill();c.lineWidth=ln;c.stroke();
 // belly
 c.fillStyle='rgba(255,255,255,.7)';c.beginPath();c.ellipse(R*.1,ry*.3,R*.62,ry*.55,0,0,7);c.fill();
 c.fillStyle=lt;c.beginPath();c.ellipse(-R*.25,-ry*.55,R*.35,ry*.16,-.4,0,7);c.fill();
 // head tuft
 c.fillStyle=col;c.strokeStyle=dk;for(let i=-1;i<=1;i++){c.beginPath();c.ellipse(i*3+2,-ry-(type==='feather'?5:3),2.4,type==='feather'?6:4.5,i*.45,0,7);c.fill();c.stroke()}
 // wing (flaps)
 c.save();c.translate(-R*.2,ry*.05);c.rotate(wing?-.9:.25);c.fillStyle=col;c.beginPath();c.ellipse(-3,4,R*.55,ry*.36,.5,0,7);c.fill();c.stroke();c.fillStyle=lt;c.beginPath();c.ellipse(-4,3,R*.3,ry*.14,.5,0,7);c.fill();c.restore();
 // cheeks, eye, beak
 c.fillStyle='rgba(255,105,135,.55)';c.beginPath();c.ellipse(R*.25,ry*.3,4.2,2.8,0,0,7);c.fill();
 const ex=R*.42,ey=-ry*.2;c.fillStyle='#fff';c.strokeStyle=dk;c.lineWidth=1.8;c.beginPath();c.arc(ex,ey,R*.36,0,7);c.fill();c.stroke();
 c.fillStyle='#2b1d2e';c.beginPath();c.arc(ex+1.5,ey+.5,R*.22,0,7);c.fill();c.fillStyle='#fff';c.beginPath();c.arc(ex+2.5,ey-1.5,R*.09,0,7);c.arc(ex,ey+2,R*.05,0,7);c.fill();
 c.fillStyle='#ffa62b';c.strokeStyle=dk;c.beginPath();c.moveTo(R*.78,ey+4);c.quadraticCurveTo(R+8,ey+5,R*.82,ey+11);c.quadraticCurveTo(R*.7,ey+7,R*.78,ey+4);c.fill();c.stroke();
 // accessories
 if(type==='rocket'){c.fillStyle='rgba(120,220,255,.55)';c.strokeStyle=dk;c.lineWidth=2;c.beginPath();c.arc(ex,ey,R*.46,0,7);c.fill();c.stroke();c.fillStyle='#ff5252';c.beginPath();c.moveTo(-R*.6,ry*.6);c.lineTo(-R-10,ry*.6+6);c.lineTo(-R-6,ry*.6-4);c.closePath();c.fill();c.stroke()}
 if(type==='heavy'){c.strokeStyle=dk;c.lineWidth=2;c.beginPath();c.moveTo(ex-5,ey-R*.5);c.lineTo(ex+5,ey-R*.38);c.stroke()}
 c.restore()}
// ===== Ambient + trail particles (per-theme mood) =====
let amb=[],flash=0;
function ambUpdate(dt){const th=D().bg;while(amb.length<(th==='storm'?70:26)){amb.push({x:rnd(0,W),y:rnd(0,H),s:rnd(.5,1.5),p:rnd(0,6)})}
 for(const a of amb){a.p+=dt*2;if(th==='meadow'){a.x-=(14+a.s*8)*dt;a.y+=Math.sin(a.p)*14*dt+6*dt}else if(th==='desert'){a.x-=(60+a.s*40)*dt;a.y+=Math.sin(a.p)*10*dt}else{a.x-=90*dt;a.y+=420*a.s*dt}
  if(a.x<-10)a.x=W+10;if(a.y>CFG.groundY||a.y<-10){a.y=th==='storm'?-10:rnd(0,CFG.groundY-20);if(th==='storm')a.x=rnd(0,W+80)}}
 if(th==='storm'){flash=Math.max(0,flash-dt*2);if(Math.random()<dt*.18){flash=1;sfx(70,40,.6,'sawtooth',.05)}}else flash=0}
function ambDraw(c){const th=D().bg;for(const a of amb){if(th==='meadow'){c.globalAlpha=.8;c.fillStyle=a.s>1?'#ffb3d1':'#fff6a8';c.beginPath();c.arc(a.x,a.y,2+a.s,0,7);c.fill()}
  else if(th==='desert'){c.globalAlpha=.45;c.fillStyle='#ffe9b8';c.fillRect(a.x,a.y,7*a.s,1.6)}
  else{c.globalAlpha=.55;c.strokeStyle='#bcd2ff';c.lineWidth=1.3;c.beginPath();c.moveTo(a.x,a.y);c.lineTo(a.x-4,a.y-12*a.s);c.stroke()}}c.globalAlpha=1;
 if(flash>0){c.fillStyle='rgba(220,230,255,'+flash*.4+')';c.fillRect(0,0,W,H)}
 const v=c.createRadialGradient(W/2,H/2,H*.35,W/2,H/2,H*.75);v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,th==='storm'?'rgba(0,0,20,.4)':'rgba(40,20,0,.14)');c.fillStyle=v;c.fillRect(0,0,W,H)}
function trail(x,y){const th=D().bg;for(let i=0;i<4;i++)parts.push({x:x-10,y:y+rnd(-4,6),vx:rnd(-70,-20),vy:rnd(-30,30),l:.55,c:th==='storm'?'#9fb4ff':th==='desert'?'#ffe0a0':'#ffffff',k:3,g:20,sm:1})}
// ===== Game state =====
let st='menu',bird,pipes,balls,parts,lives,score,inv,shake,t,cnt,dth,spawnX,flapA;
const rnd=(a,b)=>a+Math.random()*(b-a),D=()=>CFG.diff[S.diff],B=()=>CFG.birds[S.type];
function reset(){const d=D();bird={y:300,vy:0};pipes=[];balls=[];parts=[];lives=CFG.lives;score=0;inv=0;shake=0;t=0;dth=null;flapA=0;spawnX=W+60;
 for(let x=W+40;x<W+40+d.spacing*3;x+=d.spacing)addPipe(x)}
function addPipe(x){const d=D();pipes.push({x,gy:rnd(d.gap/2+90,CFG.groundY-d.gap/2-70),passed:false,cd:rnd(...d.fire),warn:0,ang:0,side:0})}
function startRun(){reset();show(null);hud(true);st='count';cnt=CFG.resumeCountdown;$('bp').disabled=false}
function show(id){['menu','pause','over'].forEach(o=>$(o).classList.toggle('on',o===id))}
function hud(on){$('hud').style.display=on?'flex':'none'}
function pause(){if(st!=='play'&&st!=='count')return;st='paused';show('pause')}
function resume(){show(null);st='count';cnt=CFG.resumeCountdown}
function flap(){if(st==='menu'||st==='paused'||st==='over'||st==='dying'||st==='count')return;bird.vy=B().flap;flapA=.15;trail(CFG.birdX,bird.y);sfx(500,800,.1)}
function hit(cause){if(inv>0||st!=='play')return;lives--;sfx(160,60,.25,'sawtooth',.12);
 if(lives<=0){die(cause);return}
 inv=CFG.invTime;shake=.35;if(cause==='ceil'||cause==='ground'){bird.y=300;bird.vy=0}}
function petal(x,y){for(let i=0;i<40;i++){const a=rnd(0,6.28),s=rnd(60,220);parts.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-60,l:1.6,c:['#ff6b9d','#ffd23f','#c77dff','#fff','#ff9f1c'][i%5],k:i%3?0:1,g:90})}}
function die(cause){st='dying';$('bp').disabled=true;dth={t:0,cause,x:CFG.birdX,y:bird.y,vx:0,vy:0,rot:0,done:false};
 if(S.diff==='easy'){petal(dth.x,dth.y);sfx(300,900,.5,'triangle',.12)}
 else if(S.diff==='medium'){if(cause==='pipe'){dth.vx=-120;dth.vy=-200;sfx(200,80,.4,'sawtooth')}else if(cause==='ball'){dth.bx=W+40;sfx(120,60,.6,'square')}else{sfx(700,200,.3,'sawtooth');for(let i=0;i<14;i++)parts.push({x:dth.x,y:dth.y,vx:rnd(-90,90),vy:rnd(-120,40),l:1.5,c:'#fff',k:2,g:60})}}
 else{dth.ry=-80}}
function over(){st='over';hud(false);if(score>best){best=score;try{localStorage.setItem('fbBest',best)}catch(e){}}
 $('fs').textContent='Score: '+score;$('bs').textContent='Best: '+best;show('over')}
// ===== Update =====
function update(dt){const d=D(),b=B();
 if(st==='count'){cnt-=dt;if(cnt<=0)st='play';return}
 if(st==='dying'){updDeath(dt);return}
 if(st!=='play')return;
 t+=dt;for(const p of parts){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=p.g*dt;p.l-=dt}parts=parts.filter(p=>p.l>0);inv=Math.max(0,inv-dt);shake=Math.max(0,shake-dt);flapA=Math.max(0,flapA-dt);
 bird.vy=Math.min(b.maxFall,bird.vy+b.g*dt);bird.y+=bird.vy*dt;
 if(bird.y<b.r){hit('ceil');if(st==='play'){bird.y=b.r}}
 if(bird.y>CFG.groundY-b.r){hit('ground');if(st==='play')bird.y=CFG.groundY-b.r}
 const danger=bird.y<CFG.safeTop?-1:bird.y>CFG.safeBottom?1:0;let near=null;
 for(const p of pipes){p.x-=d.speed*dt;
  if(!p.passed&&p.x+CFG.pipeW<CFG.birdX){p.passed=true;score++;sfx(900,1300,.12,'triangle')}
  if(inv<=0&&CFG.birdX+b.r>p.x&&CFG.birdX-b.r<p.x+CFG.pipeW&&(bird.y-b.r<p.gy-d.gap/2||bird.y+b.r>p.gy+d.gap/2))hit('pipe');
  if(p.x+CFG.pipeW>CFG.birdX-30&&(!near||p.x<near.x))near=p}
 // cannons: nearest pipe fires while bird is outside the safe band
 for(const p of pipes){const cy=p.gy+(p.side||1)*d.gap/2;p.ang=Math.atan2(bird.y-cy,CFG.birdX-(p.x+CFG.pipeW/2));
  if(p===near&&danger){p.side=danger;if(p.warn<=0)p.cd-=dt}else if(p.warn<=0)p.cd=Math.max(p.cd,.5);
  if(p.cd<=0&&p.warn<=0){p.warn=CFG.warnTime;p.cd=1e9}
  if(p.warn>0){p.warn-=dt;if(p.warn<=0){const cx=p.x+CFG.pipeW/2,y0=p.gy+p.side*d.gap/2,a=Math.atan2(bird.y-y0,CFG.birdX-cx);balls.push({x:cx,y:y0,vx:Math.cos(a)*d.ball,vy:Math.sin(a)*d.ball});p.cd=rnd(...d.fire);sfx(200,90,.15,'sawtooth')}}}
 for(const k of balls){k.x+=k.vx*dt;k.y+=k.vy*dt;if(inv<=0&&Math.hypot(k.x-CFG.birdX,k.y-bird.y)<b.r+6){k.dead=1;hit('ball')}if(k.x<-20||k.y<-20||k.y>H)k.dead=1}
 balls=balls.filter(k=>!k.dead);pipes=pipes.filter(p=>p.x>-80);
 const last=pipes[pipes.length-1];if(last.x<W+20)addPipe(last.x+d.spacing)}
function updDeath(dt){dth.t+=dt;const T=dth.t;
 for(const p of parts){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=p.g*dt;p.l-=dt}parts=parts.filter(p=>p.l>0);
 if(S.diff==='medium'){if(dth.cause==='pipe'){dth.vy+=700*dt;dth.x+=dth.vx*dt;dth.y+=dth.vy*dt;dth.rot+=6*dt;if(dth.y>CFG.groundY-12){dth.y=CFG.groundY-12;dth.vy*=-.5}}
  else if(dth.cause==='ball'){dth.bx=Math.max(dth.bx-380*dt,-60);if(dth.bx<dth.x+20)dth.x=dth.bx-20}
  else if(T>.4)dth.y+=140*dt}
 else if(S.diff==='hard'){if(dth.ry<dth.y-14){dth.ry+=700*dt;if(dth.ry>=dth.y-14){dth.ry=dth.y-14;shake=.4;sfx(90,30,.5,'sawtooth',.2);for(let i=0;i<16;i++)parts.push({x:dth.x,y:dth.y+10,vx:rnd(-120,120),vy:rnd(-60,0),l:1,c:'#ccc',k:3,g:20})}}}
 if(T>CFG.deathTime)over()}
// ===== Render =====
function render(){const d=D(),c=ctx;c.save();
 if(shake>0||(dth&&S.diff==='hard'&&shake>0))c.translate(rnd(-5,5),rnd(-5,5));
 const g=c.createLinearGradient(0,0,0,H);g.addColorStop(0,d.sky[0]);g.addColorStop(1,d.sky[1]);c.fillStyle=g;c.fillRect(-10,-10,W+20,H+20);
 const sc=(st==='play'||st==='count')?t:(t||0);
 if(d.bg==='meadow'){c.fillStyle='#fff';for(let i=0;i<3;i++){const x=((i*170-sc*10)%(W+120)+W+120)%(W+120)-60;c.beginPath();c.arc(x,90+i*50,22,0,7);c.arc(x+22,95+i*50,18,0,7);c.arc(x-20,98+i*50,16,0,7);c.fill()}}
 else if(d.bg==='desert'){c.fillStyle='#ffe28a';c.beginPath();c.arc(260,420,50,0,7);c.fill();c.fillStyle='#b5651d';for(let i=0;i<4;i++){c.beginPath();c.moveTo(i*110-30,CFG.groundY);c.lineTo(i*110+30,CFG.groundY-70);c.lineTo(i*110+90,CFG.groundY);c.fill()}}
 else{c.fillStyle='#fff';for(let i=0;i<30;i++)c.fillRect((i*97)%W,(i*53)%380,2,2);c.fillStyle='#1b1f3d';for(let i=0;i<3;i++){c.beginPath();c.arc(60+i*130,70+i%2*40,40,0,7);c.arc(110+i*130,80+i%2*40,32,0,7);c.fill()}
  if(Math.sin(sc*1.3)>.96){c.fillStyle='rgba(255,255,255,.35)';c.fillRect(0,0,W,H)}}
 {const hc={meadow:['#9fe07a','#78c95a'],desert:['#e58b4a','#c96a3a'],storm:['#262b52','#1a1e3c']}[d.bg];for(let L=0;L<2;L++){c.fillStyle=hc[L];c.beginPath();c.moveTo(0,CFG.groundY);for(let x=0;x<=W;x+=12)c.lineTo(x,CFG.groundY-50-L*28-Math.sin((x+sc*(8+L*10))*.018+L*2)*(22+L*8));c.lineTo(W,CFG.groundY);c.fill()}}
 for(const p of pipes){const x=p.x,w=CFG.pipeW,top=p.gy-d.gap/2,bot=p.gy+d.gap/2;c.fillStyle=d.pipe;c.strokeStyle='#222';c.lineWidth=2;
  c.fillRect(x,0,w,top);c.strokeRect(x,-2,w,top+2);c.fillRect(x-4,top-20,w+8,20);c.strokeRect(x-4,top-20,w+8,20);
  c.fillRect(x,bot,w,CFG.groundY-bot);c.strokeRect(x,bot,w,CFG.groundY-bot);c.fillRect(x-4,bot,w+8,20);c.strokeRect(x-4,bot,w+8,20);
  c.fillStyle='rgba(0,0,0,.2)';c.fillRect(x+w-12,0,12,top);c.fillRect(x+w-12,bot,12,CFG.groundY-bot);c.fillStyle='rgba(255,255,255,.25)';c.fillRect(x+6,0,6,top);c.fillRect(x+6,bot,6,CFG.groundY-bot);
  if(st!=='menu'){const cy=p.gy+(p.side||1)*d.gap/2,cx=x+w/2;c.save();c.translate(cx,cy);c.rotate(p.ang);c.fillStyle=p.warn>0&&Math.floor(p.warn*20)%2?'#ff3b30':'#333';c.fillRect(0,-5,20,10);c.beginPath();c.arc(0,0,9,0,7);c.fill();c.restore();
   if(p.warn>0){c.fillStyle='#ff3b30';c.font='bold 22px sans-serif';c.textAlign='center';c.fillText('!',cx,cy-16*(p.side||1))}}}
 for(const k of balls){c.fillStyle='#222';c.beginPath();c.arc(k.x,k.y,6,0,7);c.fill();c.fillStyle='#777';c.beginPath();c.arc(k.x-2,k.y-2,2,0,7);c.fill()}
 c.fillStyle=d.ground;c.fillRect(0,CFG.groundY,W,H-CFG.groundY);c.fillStyle='rgba(0,0,0,.2)';for(let i=-1;i<12;i++){const x=((i*40-(t*d.speed))%40+40)%40+i*40-40;c.fillRect(x,CFG.groundY+10,20,6)}c.fillRect(0,CFG.groundY,W,4);
 if(d.bg==='meadow'){c.fillStyle='#5fb23a';for(let x=0;x<W;x+=9)c.fillRect(x,CFG.groundY-3,5,5)}
 if(dth)renderDeath(c,d);else if(bird){const b=B();if(!(inv>0&&Math.floor(inv*10)%2))drawBird(c,CFG.birdX,bird.y,S.type,S.color,Math.max(-.5,Math.min(1,bird.vy/500)),1,1,flapA>0?-4:0)}
 for(const p of parts)pDraw(c,p);
 ambDraw(c);
 c.restore();
 // HUD (not shaken)
 c.textAlign='center';c.lineWidth=6;c.strokeStyle='#222';c.fillStyle='#fff';c.font='bold 54px "Trebuchet MS",sans-serif';
 if(st!=='menu'){c.strokeText(score,W/2,70);c.fillText(score,W/2,70);for(let i=0;i<lives;i++){heart(c,22+i*26,26)}}
 if(st==='count'||st==='paused'&&false){c.font='bold 90px sans-serif';c.strokeText(Math.ceil(cnt),W/2,H/2);c.fillText(Math.ceil(cnt),W/2,H/2)}}
function heart(c,x,y){c.fillStyle='#ff3b5c';c.strokeStyle='#7a0a22';c.lineWidth=2;c.beginPath();c.moveTo(x,y+8);c.bezierCurveTo(x-16,y-4,x-6,y-14,x,y-5);c.bezierCurveTo(x+6,y-14,x+16,y-4,x,y+8);c.fill();c.stroke()}
function pDraw(c,p){c.globalAlpha=Math.min(1,p.l);c.fillStyle=p.c;if(p.k===1){for(let i=0;i<5;i++){c.beginPath();c.arc(p.x+Math.cos(i*1.26)*5,p.y+Math.sin(i*1.26)*5,4,0,7);c.fill()}c.fillStyle='#ffd23f';c.beginPath();c.arc(p.x,p.y,3,0,7);c.fill()}else if(p.k===0||p.k===2){c.beginPath();c.ellipse(p.x,p.y,p.k?5:4,2.5,p.x*.05,0,7);c.fill()}else{c.beginPath();c.arc(p.x,p.y,p.sm?3.5*Math.min(1,p.l*2):7,0,7);c.fill()}c.globalAlpha=1}
function renderDeath(c,d){const T=dth.t,col=S.color,ty=S.type;
 if(S.diff==='medium'){
  if(dth.cause==='pipe'){drawBird(c,dth.x,dth.y,ty,col,dth.rot,1,1,6);c.strokeStyle='#333';c.lineWidth=3;for(let s=-1;s<=1;s+=2){c.beginPath();c.moveTo(dth.x+s*4,dth.y+10);c.lineTo(dth.x+s*8+Math.sin(T*14)*4,dth.y+20);c.stroke()}}
  else if(dth.cause==='ball'){drawBird(c,dth.x,dth.y,ty,col,.3,1,1);c.fillStyle='#8a97a6';c.strokeStyle='#333';c.fillRect(dth.bx,dth.y-70,14,140);c.strokeRect(dth.bx,dth.y-70,14,140)}
  else{const up=dth.cause==='ceil';c.fillStyle='#cfd6dd';c.strokeStyle='#333';const h=Math.min(1,T*4)*40;for(let i=0;i<12;i++){const x=i*30+15,y=up?0:CFG.groundY;c.beginPath();c.moveTo(x-12,y);c.lineTo(x,y+(up?h:-h));c.lineTo(x+12,y);c.fill();c.stroke()}drawBird(c,dth.x,dth.y,ty,col,T>.4?1.2:0,1,1)}}
 else if(S.diff==='hard'){const sq=dth.ry>=dth.y-14;drawBird(c,dth.x,dth.y+(sq?8:0),ty,col,0,sq?1.5:1,sq?.3:1);
  c.fillStyle='#777';c.strokeStyle='#333';c.lineWidth=3;c.beginPath();c.moveTo(dth.x-30,dth.ry+30);c.lineTo(dth.x-34,dth.ry-8);c.lineTo(dth.x-10,dth.ry-30);c.lineTo(dth.x+26,dth.ry-22);c.lineTo(dth.x+34,dth.ry+14);c.lineTo(dth.x+10,dth.ry+30);c.closePath();c.fill();c.stroke();
  if(sq){c.fillStyle='#ffd23f';for(let i=0;i<3;i++){const a=T*6+i*2.1;c.fillText('★',dth.x+Math.cos(a)*28,dth.y-18+Math.sin(a)*8)}}}}
// ===== Loop (delta-time; frozen while paused) =====
let last=0;function loop(ts){const dt=Math.min(.033,(ts-last)/1000||0);last=ts;if(st==='menu'||st==='play'||st==='dying')ambUpdate(dt);if(st==='menu'){t+=dt;if(!bird)reset()}update(dt);render();requestAnimationFrame(loop)}
// ===== UI =====
function pv(){const c=$('pv').getContext('2d');c.clearRect(0,0,100,64);drawBird(c,50,34,S.type,S.color,0,1.3,1.3)}
function build(){const mk=(id,items,key,lab)=>{const el=$(id);el.innerHTML='';items.forEach(v=>{const b=document.createElement('button');if(id==='cols'){b.className='sw';b.style.background=v;b.setAttribute('aria-label','Color '+v)}else b.textContent=lab?lab(v):v;if(S[key]===v)b.classList.add('sel');b.onclick=()=>{S[key]=v;build();pv();if(key==='diff'){reset()}};el.appendChild(b)})};
 mk('cols',COLORS,'color');mk('types',Object.keys(CFG.birds),'type',v=>v[0].toUpperCase()+v.slice(1));mk('diffs',Object.keys(CFG.diff),'diff',v=>v[0].toUpperCase()+v.slice(1))}
function menu(){st='menu';hud(false);show('menu');build();pv();reset()}
$('play').onclick=startRun;$('retry').onclick=startRun;$('rst').onclick=startRun;$('res').onclick=resume;$('mm').onclick=menu;$('mm2').onclick=menu;
$('bp').onclick=e=>{e.stopPropagation();pause()};$('bm').onclick=e=>{e.stopPropagation();muted=!muted;$('bm').textContent=muted?'🔇':'🔊'};
document.addEventListener('keydown',e=>{if(e.code==='Space'){e.preventDefault();flap()}else if(e.code==='KeyP'||e.code==='Escape'){st==='paused'?resume():pause()}});
$('stage').addEventListener('pointerdown',e=>{if(e.target.closest('button')||e.target.closest('.ov.on'))return;flap()});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause()});window.addEventListener('blur',pause);
menu();requestAnimationFrame(loop);