(() => {
  const canvas=document.getElementById('game'),ctx=canvas.getContext('2d',{alpha:false});
  const D=window.BUGBREAK_DATA,UI=window.UI,A=window.AudioSys,ART=window.BUGBREAK_ART,$=id=>document.getElementById(id);
  const W=1280,H=720,CX=640,CY=360,isTouch=('ontouchstart'in window)||navigator.maxTouchPoints>0;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const angleTo=(a,b)=>Math.atan2(b.y-a.y,b.x-a.x);
  const norm=(x,y)=>{const d=Math.hypot(x,y)||1;return{x:x/d,y:y/d}};
  const rand=(a,b)=>a+Math.random()*(b-a),pick=a=>a[(Math.random()*a.length)|0];

  let running=false,paused=false,mode='normal',hard=false,maxWave=50,wave=0,nextWave=0,waveClock=0,last=0,raf=0;
  let nest=null,enemyPlayer=null,attackers=[],bots=[],shots=[],fx=[],texts=[];
  let keys={},joy={x:0,y:0},lastDir={x:1,y:0},attackCd=0,dashCd=0,specialCd=0,respawn=0,playerDead=false;
  let xpRun=0,gemsRun=0,damageRun=0,botKills=0,enemyClass=null,finalThemePlaying=false;
  const botNames=['MossBite','LeafGuard','DirtKing','PetalRush','RootWall','SunWing'];

  function modeData(){return D.modes.find(m=>m.id===mode)||D.modes[0]}
  function biomeFor(){return ART.getBiomeFor(mode,Math.max(1,wave||1))}
  function modePool(){return mode==='halloween'?D.halloweenEnemies:mode==='autumn'?D.autumnEnemies:D.enemies}
  function specFor(id){return UI.enemySpec(id)}
  function entryFor(id){return UI.enemyCatalog(mode).find(e=>e.id===id)}
  function finalBossSpec(){return mode==='halloween'?D.halloweenBosses.at(-1):mode==='autumn'?D.autumnBosses.at(-1):D.bosses.at(-1)}
  function finalTheme(){return mode==='hard'?'final-hard.mp3':mode==='halloween'?'final-halloween.mp3':mode==='autumn'?'final-autumn.mp3':'final-normal.mp3'}
  function eventFlags(spec){return {hard,haunted:mode==='halloween',autumn:mode==='autumn',boss:D.bosses.includes(spec)||D.halloweenBosses.includes(spec)||D.autumnBosses.includes(spec),miniBoss:D.miniBosses.includes(spec)}}
  function edgePos(){const side=(Math.random()*4)|0;if(side===0)return{x:rand(30,W-30),y:95};if(side===1)return{x:W-28,y:rand(110,H-45)};if(side===2)return{x:rand(30,W-30),y:H-30};return{x:28,y:rand(110,H-45)}}
  function hideScreens(){document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'))}
  function setHudVisible(on){$('hud').classList.toggle('hidden',!on);$('mobileControls').classList.toggle('hidden',!(on&&isTouch));$('evolutionHud')?.classList.toggle('hidden',on);$('enemyModeHud')?.classList.toggle('hidden',!on)}

  function legalEntry(){
    const selected=UI.selectedEnemy,cat=UI.enemyCatalog(mode);
    const legal=e=>UI.enemyOwned(e)&&UI.enemyLevel>=e.level&&wave>=e.wave;
    if(selected&&legal(selected))return selected;
    const available=cat.filter(legal).sort((a,b)=>b.wave-a.wave||b.level-a.level);
    return available[0]||cat[0];
  }
  function spawnControlled(initial=false){
    const entry=legalEntry(),spec=specFor(entry.id),flags=eventFlags(spec),p=edgePos();enemyClass=entry;
    const progression=1+(wave-1)*(hard?.012:.009),bossScale=entry.finalBoss?1.05:entry.bossClass?0.72:0.58,hardScale=hard?1.18:1;
    const hp=spec.hp*progression*bossScale*hardScale,damage=spec.damage*(1+(wave-1)*.006)*(hard?1.08:1)*(entry.finalBoss?1.05:entry.bossClass?.92:.86);
    enemyPlayer={spec,x:p.x,y:p.y,r:Math.max(15,spec.size*(entry.finalBoss?.76:entry.bossClass?.86:.82)),angle:angleTo(p,nest),hp,maxHp:hp,damage,speed:spec.speed*(hard?1.02:1),attack:.1,phase:0,spawn:0,stun:0,mark:0,dead:false,...flags,controlled:true,entry};
    playerDead=false;respawn=0;specialCd=0;dashCd=0;attackCd=0;
    const selected=UI.selectedEnemy;if(!initial&&selected&&selected.id!==entry.id){const s=specFor(selected.id);UI.toast(`${s?.name||'Selected class'} unlocks at Wave ${selected.wave} / Enemy Lv ${selected.level}. Spawned as ${spec.name}.`,2600)}
    if(entry.finalBoss||entry.bossClass)A.sfx('boss',.55);
  }
  function spawnAttacker(spec,delay=0,scale=.58){
    const p=edgePos(),flags=eventFlags(spec),prog=1+(wave-1)*(hard?.011:.008),hp=spec.hp*prog*scale*(hard?1.13:1),damage=spec.damage*(1+(wave-1)*.005)*scale*(hard?1.07:1);
    attackers.push({spec,x:p.x,y:p.y,r:Math.max(12,spec.size*.78),angle:angleTo(p,nest),hp,maxHp:hp,damage,speed:spec.speed*(hard?1.02:1),attack:rand(.2,.7),spawn:delay,stun:0,phase:Math.random()*6.28,dead:false,...flags});
  }
  function makeBot(type,i){
    const p=D.players.find(x=>x.id===type)||D.players[0],ang=i/3*Math.PI*2;
    const scale=1+Math.min(.55,wave*.009),hp=p.stats.hp*scale*(hard?1.06:1),damage=p.stats.damage*(1+Math.min(.7,wave*.012));
    return {name:botNames[(wave+i)%botNames.length],type:p.id,color:p.color,x:CX+Math.cos(ang)*(110+i*18),y:CY+Math.sin(ang)*(85+i*16),r:19,hp,maxHp:hp,damage,speed:p.stats.speed*.78,range:['dragonfly','bee','firefly'].includes(p.id)?190:88,attack:rand(.1,.5),ability:rand(2.5,5),respawn:0,dead:false,angle:ang,role:i===0?'warden':i===1?'ranger':'hunter',guard:0,dodge:0,skill:p.ability};
  }
  function resetBots(){
    let roster=wave<12?['ant','bee','ladybug']:wave<28?['termite','dragonfly','spider']:['ladybug','firefly','spider'];
    if(mode==='halloween')roster=['ghost-moth','firefly','spider'];
    if(mode==='autumn'&&UI.save.unlocks?.autumnWin)roster=['harvest-cicada','bee','spider'];
    bots=roster.map(makeBot);
  }
  function start(m=UI.selectedMode||'normal'){
    if(running)stop(false);mode=m;if(mode==='halloween'&&!UI.halloweenActive())mode='normal';if(mode==='autumn'&&!UI.autumnActive())mode='normal';hard=mode==='hard';maxWave=modeData().waves;
    running=true;paused=false;wave=0;nextWave=.7;waveClock=0;attackers=[];bots=[];shots=[];fx=[];texts=[];xpRun=0;gemsRun=0;damageRun=0;botKills=0;enemyPlayer=null;playerDead=false;finalThemePlaying=false;
    nest={x:CX,y:CY,r:58,maxHp:(mode==='hard'?3300:mode==='halloween'?2600:mode==='autumn'?2850:3000),hp:0,shield:0};nest.hp=nest.maxHp;
    hideScreens();setHudVisible(true);$('modeHud').textContent=`ENEMY · ${modeData().badge==='EVENT'?modeData().name:modeData().badge}`;$('waveMax').textContent='/'+maxWave;$('candyHud').classList.add('hidden');$('bossBanner').classList.remove('show');
    $('abilityName').textContent='ENEMY SPECIAL';$('repairBtn').innerHTML='SWITCH<br><small>CLASS</small>';$('enemyModeHud').classList.remove('hidden');
    ART.setScene(mode,1,nest);A.prewarm();A.playNormal(mode,1);if(hard)A.sfx('night',.65);if(mode==='halloween')A.sfx('haunt',.65);UI.toast(`Enemy Mode · ${modeData().name}. Smart colony defenders deployed.`,2300);last=performance.now();cancelAnimationFrame(raf);raf=requestAnimationFrame(loop);
  }
  function stop(showMenu=true){running=false;paused=false;cancelAnimationFrame(raf);A.stopAll();setHudVisible(false);$('repairBtn').innerHTML='REPAIR<br><small>12</small>';if(showMenu){UI.show('menu');UI.syncMenu()}}
  function startWave(){
    wave++;if(wave>maxWave)return end(false);waveClock=(wave===maxWave?32:Math.min(25,15+wave*.22));ART.setScene(mode,wave,nest);resetBots();attackers=[];shots=[];fx=[];texts=[];
    const pool=modePool().filter(e=>e.from<=wave),count=Math.min(UI.settings.perf?10:15,3+Math.floor(wave*.32));
    for(let i=0;i<count;i++){const high=pool.slice(Math.max(0,pool.length-5)),spec=Math.random()<.68?pick(high.length?high:pool):pick(pool);spawnAttacker(spec,i*.18)}
    if(mode==='normal'||mode==='hard'){const schedule=[8,18,28,38,48],idx=schedule.indexOf(wave);if(idx>=0)spawnAttacker(D.miniBosses[idx],.7,.52)}
    const intended=legalEntry();
    if(mode==='halloween'){const b=D.halloweenBosses.find(x=>x.wave===wave);if(b&&intended?.id!==b.id)spawnAttacker(b,.8,wave===20?.65:.55)}
    if(mode==='autumn'&&wave===25&&intended?.id!==D.autumnBosses[0].id)spawnAttacker(D.autumnBosses[0],.8,.65);
    if((mode==='normal'||mode==='hard')&&wave===50&&intended?.id!==D.bosses.at(-1).id)spawnAttacker(D.bosses.at(-1),.8,.64);
    if(wave===maxWave){A.playBoss(finalTheme());finalThemePlaying=true;banner('FINAL DEFENSE',finalBossSpec().name)}else{A.stopBoss(mode,musicIndex());A.playNormal(mode,musicIndex())}
    spawnControlled(wave===1);A.sfx('wave',.4);UI.toast(`Enemy Wave ${wave} · ${biomeFor().name}`);updateHUD();
  }
  function musicIndex(){const list=mode==='halloween'?D.halloweenBiomes:mode==='autumn'?D.autumnBiomes:D.biomes;return Math.max(1,list.indexOf(biomeFor())+1)}
  function banner(tag,name){$('bossName').textContent=String(name).toUpperCase();$('bossTag').textContent=tag;$('bossBanner').classList.add('show');setTimeout(()=>$('bossBanner').classList.remove('show'),3200)}

  function hurtControlled(n){if(!enemyPlayer||playerDead)return;enemyPlayer.hp-=n;addText(enemyPlayer.x,enemyPlayer.y-28,`-${Math.round(n)}`,'#ff8b82');if(enemyPlayer.hp<=0){enemyPlayer.hp=0;playerDead=true;respawn=2.6;A.sfx('death',.35);UI.toast('Defenders eliminated you. Respawning...',1500)}}
  function hurtBot(b,n,fromPlayer=false){if(b.dead)return;b.hp-=n;addText(b.x,b.y-26,`-${Math.round(n)}`,fromPlayer?'#ffd276':'#ff9d86');if(fromPlayer){damageRun+=n;const gain=Math.max(1,Math.round(n*.035));xpRun+=gain;UI.addEnemyXp(gain,true)}if(b.hp<=0){b.dead=true;b.respawn=5.5;botKills++;if(fromPlayer){const bonus=18+Math.floor(wave*.4);xpRun+=bonus;UI.addEnemyXp(bonus,true);UI.addGems(2);gemsRun+=2;A.sfx('gem',.25)}}}
  function hurtNest(n,fromPlayer=false){nest.hp=Math.max(0,nest.hp-n);if(fromPlayer){damageRun+=n;const gain=Math.max(1,Math.round(n*.018));xpRun+=gain;UI.addEnemyXp(gain,true)}if(nest.hp<=0)end(true)}
  function killAttacker(a){a.dead=true}

  function controlledAttack(){
    if(!running||paused||playerDead||attackCd>0)return;attackCd=.42/(enemyClass?.bossClass?0.9:1);A.sfx('bite',.5);const range=enemyClass?.finalBoss?115:enemyClass?.bossClass?98:75;const nearby=bots.filter(b=>!b.dead&&dist(enemyPlayer,b)<range+b.r).sort((a,b)=>dist(enemyPlayer,a)-dist(enemyPlayer,b));
    if(nearby.length){for(const b of nearby.slice(0,enemyClass?.finalBoss?3:1))hurtBot(b,enemyPlayer.damage*(enemyClass?.finalBoss?1.05:1),true)}else if(dist(enemyPlayer,nest)<range+nest.r){hurtNest(enemyPlayer.damage*.72,true);addText(nest.x,nest.y-62,`-${Math.round(enemyPlayer.damage*.72)}`,'#f1aa74')}else burst(enemyPlayer.x+lastDir.x*28,enemyPlayer.y+lastDir.y*28,enemyPlayer.spec.color,3)
  }
  function controlledDash(){if(!running||paused||playerDead||dashCd>0)return;dashCd=1.8;A.sfx('dash',.45);const v=inputVec(),d=Math.hypot(v.x,v.y)>.1?norm(v.x,v.y):lastDir,ox=enemyPlayer.x,oy=enemyPlayer.y;enemyPlayer.x=clamp(enemyPlayer.x+d.x*135,24,W-24);enemyPlayer.y=clamp(enemyPlayer.y+d.y*135,86,H-24);for(const b of bots)if(!b.dead&&lineDist(b.x,b.y,ox,oy,enemyPlayer.x,enemyPlayer.y)<b.r+24)hurtBot(b,enemyPlayer.damage*.72,true);burst(enemyPlayer.x,enemyPlayer.y,hard?'#90a7ff':enemyPlayer.spec.color,8)}
  function controlledSpecial(){
    if(!running||paused||playerDead||specialCd>0)return;specialCd=enemyClass?.finalBoss?7.8:enemyClass?.bossClass?7:5.8;A.sfx('special',.55);const ai=enemyPlayer.spec.ai;
    if(enemyClass?.finalBoss||enemyClass?.bossClass){for(const b of bots)if(!b.dead&&dist(enemyPlayer,b)<210+b.r)hurtBot(b,enemyPlayer.damage*1.8,true);if(dist(enemyPlayer,nest)<230)hurtNest(enemyPlayer.damage*1.1,true);burst(enemyPlayer.x,enemyPlayer.y,hard?'#93a6ff':enemyPlayer.spec.color,18)}
    else if(['flier','elite-flier','dive','sniper','artillery'].includes(ai)){const target=nearestBot();if(target)shots.push({x:enemyPlayer.x,y:enemyPlayer.y,vx:Math.cos(angleTo(enemyPlayer,target))*310,vy:Math.sin(angleTo(enemyPlayer,target))*310,r:7,life:2.2,damage:enemyPlayer.damage*1.7,color:enemyPlayer.spec.color,playerShot:true})}
    else if(['tank','heavy','bruiser','rammer','charger'].includes(ai)){enemyPlayer.hp=Math.min(enemyPlayer.maxHp,enemyPlayer.hp+enemyPlayer.maxHp*.26);enemyPlayer.guard=3.8;burst(enemyPlayer.x,enemyPlayer.y,'#e1be74',12)}
    else {const target=nearestBot();if(target){const a=angleTo(enemyPlayer,target);enemyPlayer.x=clamp(target.x-Math.cos(a)*(target.r+26),24,W-24);enemyPlayer.y=clamp(target.y-Math.sin(a)*(target.r+26),86,H-24);hurtBot(target,enemyPlayer.damage*2.25,true)}else if(dist(enemyPlayer,nest)<250)hurtNest(enemyPlayer.damage*1.3,true)}
  }
  function cycleClass(){if(!running||paused)return;const legal=UI.enemyCatalog(mode).filter(e=>UI.enemyOwned(e)&&UI.enemyLevel>=e.level&&wave>=e.wave);if(legal.length<2)return UI.toast('No other owned enemy is available at this wave.');const cur=legal.findIndex(e=>e.id===enemyClass?.id),next=legal[(cur+1)%legal.length];UI.save.enemySelected[mode]=next.id;UI.persist();UI.renderEnemyLoadout();UI.toast(`${specFor(next.id).name} selected for next spawn.`)}

  function nearestBot(from=enemyPlayer){let best=null,bd=1e9;for(const b of bots)if(!b.dead){const d=dist(from,b);if(d<bd){bd=d;best=b}}return best}
  function highestThreat(bot){
    const live=attackers.filter(a=>!a.dead&&a.spawn<=0);let best=enemyPlayer&&!playerDead?enemyPlayer:null,score=best?threatScore(best,bot):9999;
    for(const a of live){const s=threatScore(a,bot);if(s<score){score=s;best=a}}return best
  }
  function threatScore(e,b){let d=dist(e,nest)*.65+dist(e,b)*.35;if(e.controlled)d-=65;if(e.boss)d-=100;if(e.miniBoss)d-=55;return d}
  function botAttackTarget(b,target){
    const d=dist(b,target);if(d>b.range+target.r)return;const damage=b.damage*(b.type==='spider'&&target.hp/target.maxHp<.35?1.8:1);if(target.controlled)hurtControlled(damage);else{target.hp-=damage;if(target.hp<=0)killAttacker(target)};shots.push({x:b.x,y:b.y,vx:0,vy:0,r:3,life:.18,beam:true,x2:target.x,y2:target.y,color:'#a9e1ba'});
  }
  function updateBot(b,dt,i){
    if(b.dead){b.respawn-=dt;if(b.respawn<=0){const fresh=makeBot(b.type,i);Object.assign(b,fresh)}return}b.attack-=dt;b.ability-=dt;b.guard=Math.max(0,b.guard-dt);const target=highestThreat(b);if(!target)return;
    const d=dist(b,target),a=angleTo(b,target);b.angle=a;let desired=b.role==='ranger'?145:b.role==='warden'?72:92;
    let mx=0,my=0;if(d>desired+28){mx=Math.cos(a);my=Math.sin(a)}else if(d<desired-22){mx=-Math.cos(a);my=-Math.sin(a)}else{const orbit=(i%2?1:-1);mx=Math.cos(a+orbit*Math.PI/2)*.65;my=Math.sin(a+orbit*Math.PI/2)*.65}
    const nestD=dist(b,nest);if(b.role==='warden'&&nestD>150){const na=angleTo(b,nest);mx=mx*.45+Math.cos(na)*.55;my=my*.45+Math.sin(na)*.55}
    if(target.controlled&&enemyClass?.bossClass&&d<145){const strafe=(i%2?1:-1);mx+=Math.cos(a+strafe*Math.PI/2)*.55;my+=Math.sin(a+strafe*Math.PI/2)*.55}
    const n=norm(mx,my);b.x=clamp(b.x+n.x*b.speed*dt,25,W-25);b.y=clamp(b.y+n.y*b.speed*dt,90,H-25);
    if(b.attack<=0&&d<b.range+target.r){b.attack=b.role==='ranger'?.55:.72;botAttackTarget(b,target)}
    if(b.ability<=0){b.ability=6+Math.random()*3;if(b.type==='termite'&&nest.hp<nest.maxHp*.7){nest.hp=Math.min(nest.maxHp,nest.hp+115+wave*2);burst(nest.x,nest.y,'#8dd6c6',8)}else if(b.type==='ladybug'&&d<100){b.guard=2.8;if(target.controlled)hurtControlled(b.damage*1.25);else{target.hp-=b.damage*1.25;if(target.hp<=0)killAttacker(target)}}else if(b.type==='spider'&&target.controlled&&d<200){enemyPlayer.stun=Math.max(enemyPlayer.stun||0,1.2);hurtControlled(b.damage*1.4)}else if(['bee','dragonfly','firefly','ghost-moth','harvest-cicada'].includes(b.type)&&d<260){if(target.controlled)hurtControlled(b.damage*1.55);else{target.hp-=b.damage*1.55;if(target.hp<=0)killAttacker(target)}}}
  }
  function updateAttacker(a,dt){
    if(a.dead)return;if(a.spawn>0){a.spawn-=dt;return}if(a.stun>0){a.stun-=dt;return}a.attack-=dt;a.phase+=dt;let target=nest;const liveBots=bots.filter(b=>!b.dead);const close=liveBots.sort((x,y)=>dist(a,x)-dist(a,y))[0];if(close&&dist(a,close)<145)target=close;let ang=angleTo(a,target);a.angle=ang;let sp=a.speed;if(['flier','dive','skitter'].includes(a.spec.ai))ang+=Math.sin(a.phase*4)*.2;a.x+=Math.cos(ang)*sp*dt;a.y+=Math.sin(ang)*sp*dt;const d=dist(a,target);if(d<a.r+(target.r||20)+8&&a.attack<=0){a.attack=.9;if(target===nest)hurtNest(a.damage*.45,false);else hurtBot(target,a.damage,false)}}
  function updateShot(s,dt){s.life-=dt;if(s.beam)return;s.x+=s.vx*dt;s.y+=s.vy*dt;if(s.playerShot){for(const b of bots)if(!b.dead&&dist(s,b)<s.r+b.r){hurtBot(b,s.damage,true);s.life=0;break}}}

  function update(dt){
    if(paused)return;attackCd=Math.max(0,attackCd-dt);dashCd=Math.max(0,dashCd-dt);specialCd=Math.max(0,specialCd-dt);if(enemyPlayer)enemyPlayer.stun=Math.max(0,(enemyPlayer.stun||0)-dt);
    if(nextWave>0){nextWave-=dt;if(nextWave<=0)startWave();return}
    waveClock-=dt;
    if(playerDead){respawn-=dt;if(respawn<=0)spawnControlled(false)}else if(enemyPlayer){const v=inputVec();if(Math.hypot(v.x,v.y)>.08&&!(enemyPlayer.stun>0)){const n=norm(v.x,v.y);lastDir=n;enemyPlayer.angle=Math.atan2(n.y,n.x);enemyPlayer.x=clamp(enemyPlayer.x+n.x*enemyPlayer.speed*dt,24,W-24);enemyPlayer.y=clamp(enemyPlayer.y+n.y*enemyPlayer.speed*dt,86,H-24)}}
    for(let i=0;i<bots.length;i++)updateBot(bots[i],dt,i);for(const a of attackers)updateAttacker(a,dt);attackers=attackers.filter(a=>!a.dead);for(const s of shots)updateShot(s,dt);shots=shots.filter(s=>s.life>0);for(const f of fx){f.life-=dt;f.x+=f.vx*dt;f.y+=f.vy*dt;f.vx*=.92;f.vy*=.92}fx=fx.filter(f=>f.life>0);for(const x of texts){x.life-=dt;x.y-=23*dt}texts=texts.filter(x=>x.life>0);
    if(nest.hp<=0)return end(true);
    if(waveClock<=0&&attackers.length===0){if(wave>=maxWave)return end(false);nest.hp=Math.min(nest.maxHp,nest.hp+nest.maxHp*.08);const reward=4+Math.floor(wave*.23);UI.addGems(reward);gemsRun+=reward;const xpg=10+Math.floor(wave*.8);UI.addEnemyXp(xpg,true);xpRun+=xpg;nextWave=2.1;UI.toast(`Enemy Wave ${wave} survived · +${xpg} Enemy XP · +${reward} Gems`,1600)}
    updateHUD();
  }
  function inputVec(){return{x:(keys.ArrowRight||keys.KeyD?1:0)-(keys.ArrowLeft||keys.KeyA?1:0)+joy.x,y:(keys.ArrowDown||keys.KeyS?1:0)-(keys.ArrowUp||keys.KeyW?1:0)+joy.y}}
  function lineDist(px,py,x1,y1,x2,y2){const dx=x2-x1,dy=y2-y1,l2=dx*dx+dy*dy||1;let q=((px-x1)*dx+(py-y1)*dy)/l2;q=clamp(q,0,1);return Math.hypot(px-(x1+q*dx),py-(y1+q*dy))}
  function addText(x,y,text,color){texts.push({x,y,text,color,life:.9})}
  function burst(x,y,color,n=8){if(UI.settings.perf)n=Math.min(5,n);for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,sp=rand(20,95);fx.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,r:rand(1.4,3.4),color,life:rand(.28,.65)})}}

  function end(enemyWin){
    if(!running)return;running=false;cancelAnimationFrame(raf);setHudVisible(false);A.stopAll();A.sfx(enemyWin?'victory':'death',.65);const stats=`<b>ENEMY MODE · ${modeData().name}</b><br>Wave ${wave}/${maxWave}<br>${botKills} bot players defeated<br>${Math.round(damageRun)} damage dealt<br>${xpRun} Enemy XP earned<br>${gemsRun} Gems earned<br>Enemy Level ${UI.enemyLevel}`;
    if(enemyWin){$('victoryKicker').textContent='ENEMY MODE';$('victoryTitle').textContent='COLONY BREACHED';$('victoryCopy').textContent='The smart defenders finally broke. Your enemy roster keeps every purchase and all Enemy XP.';$('victoryStats').innerHTML=stats;UI.show('victory')}else{$('runStats').innerHTML=stats;UI.show('gameover')}
    UI.syncMenu();
  }
  function updateHUD(){
    if(!running)return;const hp=enemyPlayer&&!playerDead?enemyPlayer.hp:0,max=enemyPlayer?.maxHp||1;$('hpBar').style.width=`${clamp(hp/max*100,0,100)}%`;$('hpText').textContent=playerDead?`RESPAWN ${Math.max(0,respawn).toFixed(1)}s`:`${Math.ceil(hp)}/${Math.ceil(max)}`;$('nestBar').style.width=`${clamp(nest.hp/nest.maxHp*100,0,100)}%`;$('nestText').textContent=`${Math.ceil(nest.hp)}/${Math.ceil(nest.maxHp)}`;$('waveText').textContent=wave;$('enemyCount').textContent=`${attackers.length} allies · ${bots.filter(b=>!b.dead).length} bots`;$('crumbsText').textContent=Math.max(0,Math.ceil(waveClock))+'s';$('gemsText').textContent=gemsRun;$('levelText').textContent=UI.enemyLevel;$('xpText').textContent=`${UI.enemyXP}/${UI.enemyXpNeed()}`;$('xpBar').style.width=`${clamp(UI.enemyXP/UI.enemyXpNeed()*100,0,100)}%`;$('eventPill').textContent=hard?'RELIC NIGHTFALL':mode==='halloween'?'HAUNT INVASION':mode==='autumn'?'HARVEST RAID':'ENEMY UPRISING';$('comboText').textContent=`x${botKills}`;$('contractHud').innerHTML=`<b>SMART DEFENDERS</b><br>${bots.filter(b=>!b.dead).map(b=>b.name).join(' · ')||'Respawning...'}`;$('abilityState').textContent=specialCd<=0?'READY':`${specialCd.toFixed(1)}s`;$('abilityState').style.color=specialCd<=0?'#b5e270':'#aaa';const s=enemyPlayer?.spec;$('enemyClassHud').textContent=s?(hard&&!enemyClass?.finalBoss?'RELIC '+s.name.toUpperCase():s.name.toUpperCase()):'RESPAWNING';$('enemyProgressHud').textContent=`ENEMY LV ${UI.enemyLevel} · OWNED PERMANENTLY · WAVE GATE ${enemyClass?.wave||1}`;
  }

  function draw(){
    ART.drawBackdrop(nest);
    for(const a of attackers)ART.drawEnemy(a);
    for(const b of bots)drawBot(b);
    if(enemyPlayer&&!playerDead){ART.drawEnemy(enemyPlayer);ctx.save();ctx.strokeStyle=hard?'#9bb0ff':mode==='halloween'?'#d7a6ff':mode==='autumn'?'#efb665':'#ffda78';ctx.lineWidth=3;ctx.beginPath();ctx.arc(enemyPlayer.x,enemyPlayer.y,enemyPlayer.r+9,0,Math.PI*2);ctx.stroke();ctx.restore()}
    for(const s of shots)drawShot(s);for(const f of fx){ctx.globalAlpha=clamp(f.life*2,0,1);ctx.fillStyle=f.color;ctx.beginPath();ctx.arc(f.x,f.y,f.r,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1}for(const x of texts){ctx.globalAlpha=clamp(x.life*1.4,0,1);ctx.fillStyle=x.color;ctx.font='800 12px system-ui';ctx.textAlign='center';ctx.fillText(x.text,x.x,x.y);ctx.globalAlpha=1}
  }
  function drawBot(b){
    if(b.dead){ctx.save();ctx.globalAlpha=.35;ctx.strokeStyle='#98b39d';ctx.lineWidth=2;ctx.beginPath();ctx.arc(b.x,b.y,15,0,Math.PI*2);ctx.stroke();ctx.restore();return}ART.drawInsect(b.type,b.x,b.y,b.angle,1,b.color,false,b.guard>0,false,'');ctx.save();ctx.font='800 10px system-ui';ctx.textAlign='center';ctx.fillStyle='#e9f1e9';ctx.strokeStyle='rgba(0,0,0,.7)';ctx.lineWidth=3;ctx.strokeText(b.name,b.x,b.y-31);ctx.fillText(b.name,b.x,b.y-31);ctx.fillStyle='rgba(0,0,0,.65)';ctx.fillRect(b.x-24,b.y-25,48,4);ctx.fillStyle='#7ee095';ctx.fillRect(b.x-24,b.y-25,48*clamp(b.hp/b.maxHp,0,1),4);ctx.restore()}
  function drawShot(s){ctx.save();if(s.beam){ctx.globalAlpha=clamp(s.life*5,0,.75);ctx.strokeStyle=s.color;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(s.x,s.y);ctx.lineTo(s.x2,s.y2);ctx.stroke()}else{ctx.fillStyle=s.color;ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill()}ctx.restore()}
  function loop(now){if(!running)return;const dt=Math.min(.033,(now-last)/1000||.016);last=now;update(dt);draw();if(running)raf=requestAnimationFrame(loop)}
  function togglePause(){if(!running)return;paused=!paused;if(paused)UI.show('pause');else{hideScreens();last=performance.now()}}

  window.addEventListener('keydown',e=>{if(!running)return;keys[e.code]=true;if(e.code==='Space'){e.preventDefault();controlledAttack()}else if(e.code==='ShiftLeft'||e.code==='ShiftRight')controlledDash();else if(e.code==='KeyE')controlledSpecial();else if(e.code==='KeyR')cycleClass();else if(e.code==='Escape')togglePause()});window.addEventListener('keyup',e=>keys[e.code]=false);
  $('biteBtn')?.addEventListener('pointerdown',controlledAttack);$('dashBtn')?.addEventListener('pointerdown',controlledDash);$('specialBtn')?.addEventListener('pointerdown',controlledSpecial);$('repairBtn')?.addEventListener('pointerdown',cycleClass);$('pauseBtn')?.addEventListener('click',()=>{if(running)togglePause()});$('resumeBtn')?.addEventListener('click',()=>{if(running)togglePause()});$('quitBtn')?.addEventListener('click',()=>{if(running)stop(true)});
  const stick=$('stickBase'),knob=$('stickKnob');let stickId=null,stickRect=null;
  function stickMove(e){if(!running||stickId!==e.pointerId)return;const x=e.clientX-(stickRect.left+stickRect.width/2),y=e.clientY-(stickRect.top+stickRect.height/2),n=norm(x,y),m=Math.min(1,Math.hypot(x,y)/(stickRect.width*.42));joy.x=n.x*m;joy.y=n.y*m;knob.style.transform=`translate(${joy.x*34}px,${joy.y*34}px)`}
  stick?.addEventListener('pointerdown',e=>{if(!running)return;stickId=e.pointerId;stick.setPointerCapture(e.pointerId);stickRect=stick.getBoundingClientRect();stickMove(e)});stick?.addEventListener('pointermove',stickMove);const stickEnd=e=>{if(stickId!==e.pointerId)return;stickId=null;joy.x=joy.y=0;knob.style.transform=''};stick?.addEventListener('pointerup',stickEnd);stick?.addEventListener('pointercancel',stickEnd);

  window.ENEMY_MODE={start,stop,isRunning:()=>running,debug:{setWave(n){if(!running)start(mode);wave=Math.max(0,Math.min(maxWave-1,n-1));nextWave=.01},forceWave(n){if(!running)start(mode);wave=Math.max(0,Math.min(maxWave-1,n-1));nextWave=0;startWave();return enemyClass?.id},getState:()=>({running,mode,wave,maxWave,enemyClass:enemyClass?.id,enemyLevel:UI.enemyLevel,enemyXP:UI.enemyXP,bots:bots.map(b=>({type:b.type,hp:b.hp,dead:b.dead})),nest:{hp:nest?.hp,maxHp:nest?.maxHp},attackers:attackers.length})}};
})();
