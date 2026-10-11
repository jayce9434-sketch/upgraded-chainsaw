(() => {
  const canvas=document.getElementById('game');
  const ctx=canvas.getContext('2d',{alpha:false});
  const D=window.BUGBREAK_DATA,UI=window.UI,A=window.AudioSys;
  const W=1280,H=720,CX=640,CY=360,$=id=>document.getElementById(id);
  const worldLayer=document.createElement('canvas');worldLayer.width=W;worldLayer.height=H;const worldCtx=worldLayer.getContext('2d',{alpha:false});let worldDirty=true,worldBuilding=false;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const lerp=(a,b,t)=>a+(b-a)*t;
  const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const rand=(a,b)=>a+Math.random()*(b-a);
  const pick=a=>a[(Math.random()*a.length)|0];
  const angleTo=(a,b)=>Math.atan2(b.y-a.y,b.x-a.x);
  const norm=(x,y)=>{const d=Math.hypot(x,y)||1;return{x:x/d,y:y/d}};
  const isTouch=('ontouchstart'in window)||navigator.maxTouchPoints>0;

  let running=false,paused=false,last=performance.now(),t=0,screenShake=0,shakeX=0,shakeY=0,hudTick=0;
  let mode='normal',maxWave=50,hard=false;
  let player,nest,enemies=[],projectiles=[],particles=[],pickups=[],clouds=[],texts=[],decor=[],ambient=[],wave=0,nextWave=0,boss=null;
  let crumbs=0,gemsRun=0,candyRun=0,kills=0,combo=0,comboTimer=0,level=1,xp=0,xpNeed=55,runStart=0,contract=null,contractDone=false,eventName='CALM YARD';
  let keys={},joy={x:0,y:0},attackTimer=0,dashTimer=0,specialTimer=0,guardTimer=0,speedBuff=0,attackSpeedBuff=0;
  let pendingRelic=false,choiceOpen=false,biteCount=0,lastDir={x:1,y:0};
  let biome=D.biomes[0],bgSeed=1,miniSpawned=new Set();

  function selected(){return D.players.find(p=>p.id===UI.selectedBug)||D.players[0]}
  function modeData(){return D.modes.find(m=>m.id===mode)||D.modes[0]}
  function seasonalRank(id){return UI.halloweenActive()?(UI.halloweenUpgrades[id]||0):0}
  function mkStats(base){
    const u=UI.upgrades,hpBoost=1+.09*(u.health||0)+.10*seasonalRank('lanternshell');
    return {
      maxHp:base.hp*hpBoost,hp:base.hp*hpBoost,
      speed:base.speed*(1+.045*(u.speed||0)+.02*(u.metabolic||0)+.05*seasonalRank('witchwing')),
      damage:base.damage*(1+.10*(u.bite||0)+.08*seasonalRank('candyfang')),
      cooldown:base.cooldown*Math.pow(.95,u.cooldown||0),
      crit:base.crit+.018*(u.crit||0)+.03*seasonalRank('witchwing'),
      critMult:1.65+.10*(u.critdmg||0),lifesteal:.01*(u.lifesteal||0),armor:0,regen:0,range:70,repairPower:1,
      doubleHit:0,gemMult:1+.05*(u.gem||0),crumbMult:1,splash:0,dashPower:1,bossDamage:1+.06*(u.bossbreak||0),execute:1,stun:0,nestBoost:1,waveCrumbs:0,chain:false,biteRate:1+.04*(u.metabolic||0)
    };
  }
  function startRun(forceMode){
    A.prewarm();mode=forceMode||UI.selectedMode||'normal';if(mode==='halloween'&&!UI.halloweenActive())mode='normal';if(mode==='autumn'&&!UI.autumnActive())mode='normal';
    const md=D.modes.find(m=>m.id===mode)||D.modes[0];maxWave=md.waves;hard=mode==='hard';
    const p=selected(),stats=mkStats(p.stats),nu=UI.upgrades.nest||0,seasonNest=.12*seasonalRank('graveward');
    player={x:CX-75,y:CY+48,r:19,type:p.id,color:p.color,stats,angle:0,mark:0,invuln:0,web:0,mutations:[],relics:[]};
    nest={x:CX,y:CY,r:56,maxHp:1180*(1+.11*nu+seasonNest)*(hard?.92:1),hp:0,shield:0};nest.hp=nest.maxHp;
    enemies=[];projectiles=[];particles=[];pickups=[];clouds=[];texts=[];ambient=[];wave=0;nextWave=.85;boss=null;pendingRelic=false;choiceOpen=false;miniSpawned=new Set();
    crumbs=58+(UI.upgrades.crumbs||0)*12;gemsRun=0;candyRun=0;kills=0;combo=0;comboTimer=0;level=1;xp=0;xpNeed=55;attackTimer=0;dashTimer=0;specialTimer=0;guardTimer=0;speedBuff=0;attackSpeedBuff=0;biteCount=0;hudTick=0;
    running=true;paused=false;runStart=performance.now();contract=makeContract();contractDone=false;eventName=mode==='hard'?'NIGHTFALL':'CALM YARD';
    biome=getBiome(1);generateDecor(1);UI.show('menu');document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));$('hud').classList.remove('hidden');if(isTouch)$('mobileControls').classList.remove('hidden');
    $('waveMax').textContent='/'+maxWave;$('modeHud').textContent=md.badge==='EVENT'?md.name.replace('HALLOWEEN ','').replace('HARVEST ',''):md.badge;$('candyHud').classList.toggle('hidden',mode!=='halloween');
    updateHUD();A.playNormal(mode,1);if(mode==='hard')A.sfx('night',.65);if(mode==='halloween')A.sfx('haunt',.7);UI.toast(`${p.name} entered ${md.name}.`,2200);requestAnimationFrame(loop);
  }
  function quitRun(){running=false;paused=false;$('hud').classList.add('hidden');$('mobileControls').classList.add('hidden');A.stopAll();UI.show('menu');UI.syncMenu();drawIdle()}
  function makeContract(){
    const arr=[
      {name:'COMBO HUNTER',desc:'Reach a x14 combo',reward:20,test:()=>combo>=14},
      {name:'NEST WARDEN',desc:`Clear Wave ${Math.min(10,maxWave)} with nest above 70%`,reward:24,test:()=>wave>=Math.min(10,maxWave)&&nest.hp/nest.maxHp>.7},
      {name:'PREDATOR BREAKER',desc:'Defeat 35 enemies',reward:22,test:()=>kills>=35},
      {name:'GEM FORAGER',desc:'Earn 28 Gems this expedition',reward:18,test:()=>gemsRun>=28}
    ];return pick(arr)
  }
  function checkContract(){if(!contractDone&&contract?.test()){contractDone=true;UI.addGems(contract.reward);gemsRun+=contract.reward;A.sfx('gem');UI.toast(`Contract complete: +${contract.reward} Gems`);particlesBurst(player.x,player.y,'#d9ef8c',30)}}
  function getBiome(w=wave){
    const list=mode==='halloween'?D.halloweenBiomes:mode==='autumn'?D.autumnBiomes:D.biomes;
    return list.find(b=>w>=b.from&&w<=b.to)||list.at(-1);
  }
  function musicIndex(){if(mode==='halloween')return D.halloweenBiomes.indexOf(biome)+1;if(mode==='autumn')return D.autumnBiomes.indexOf(biome)+1;return Math.min(5,Math.max(1,D.biomes.indexOf(biome)+1))}
  function generateDecor(seed){
    worldDirty=true;bgSeed=seed;decor=[];ambient=[];let s=(seed*9301+49297)%233280;const rr=()=>{s=(s*9301+49297)%233280;return s/233280};
    const count=UI.settings.perf?34:68;
    for(let i=0;i<count;i++){
      let type='blade';const q=rr();if(mode==='halloween')type=q<.23?'deadgrass':q<.42?'pumpkin':q<.57?'tomb':q<.72?'web':q<.86?'mush':'stone';
      else if(mode==='autumn')type=q<.34?'leaf':q<.56?'autumnleaf':q<.7?'acorn':q<.84?'mush':'stone';
      else type=q<.42?'blade':q<.59?'leaf':q<.75?'flower':q<.88?'stone':'mush';
      decor.push({type,x:rr()*W,y:80+rr()*(H-112),r:4+rr()*11,a:rr()*Math.PI*2,h:rr()});
    }
    const ac=UI.settings.perf?4:14;for(let i=0;i<ac;i++)ambient.push({x:rr()*W,y:80+rr()*(H-100),phase:rr()*6.28,size:1+rr()*2.5});
  }
  function bossForWave(){
    if(mode==='halloween')return D.halloweenBosses.find(x=>x.wave===wave);
    if(mode==='autumn')return D.autumnBosses.find(x=>x.wave===wave);
    return D.bosses.find(x=>x.wave===wave);
  }
  function miniForWave(){
    if(mode==='halloween')return null;
    const schedule=mode==='autumn'?[5,10,15,20]:[8,18,28,38,48];const i=schedule.indexOf(wave);return i>=0?D.miniBosses[Math.min(i,D.miniBosses.length-1)]:null;
  }
  function startWave(){
    wave++;UI.recordWave(wave,mode);const prev=biome;biome=getBiome();if(!prev||biome.name!==prev.name)generateDecor(wave);
    if(mode==='hard')eventName=wave%8===0?'NIGHT HUNT':wave%6===0?'MOONFALL':'NIGHTFALL';
    else if(mode==='halloween')eventName=wave%5===0?'WITCHING HOUR':wave%4===0?'GHOST SWARM':'HAUNTED YARD';
    else if(mode==='autumn')eventName=wave%6===0?'LEAFSTORM':wave%5===0?'HARVEST FRENZY':'AUTUMN WIND';
    else eventName=wave%9===0?'PREDATOR AMBUSH':wave%7===0?'POLLEN RUSH':wave%11===0?'NIGHT CHILL':'CALM YARD';
    crumbs+=player.stats.waveCrumbs;const b=bossForWave();
    if(b){spawnBoss(b)}else{
      const basePool=mode==='halloween'?D.halloweenEnemies:mode==='autumn'?D.autumnEnemies:D.enemies;
      const pool=basePool.filter(e=>e.from<=wave);
      const density=hard?1.10:mode==='halloween'?0.92:mode==='autumn'?0.96:1;
      const eventBonus=(eventName.includes('AMBUSH')||eventName.includes('SWARM')||eventName.includes('FRENZY'))?3:0;
      const slope=mode==='halloween'?.72:mode==='autumn'?.70:hard?.88:1.0;
      let count=Math.round((4.5+wave*slope+eventBonus)*density);
      const cap=UI.settings.perf?(mode==='hard'?22:20):(mode==='hard'?27:mode==='halloween'?22:mode==='autumn'?23:27);count=Math.min(cap,count);
      for(let i=0;i<count;i++){const high=pool.slice(Math.max(0,pool.length-(hard?7:5)));const spec=Math.random()<.66?pick(high.length?high:pool):pick(pool);spawnEnemy(spec,i*.16)}
      const mini=miniForWave();if(mini&&!miniSpawned.has(mini.id)){miniSpawned.add(mini.id);spawnMiniBoss(mini,1.1)}
      boss=null;A.stopBoss(mode,musicIndex());A.playNormal(mode,musicIndex());UI.toast(`Wave ${wave} · ${biome.name}`)
    }
    A.sfx('wave',.38);updateHUD();
  }
  function edgePos(){const side=(Math.random()*4)|0;if(side===0)return{x:rand(20,W-20),y:92};if(side===1)return{x:W-20,y:rand(95,H-55)};if(side===2)return{x:rand(20,W-20),y:H-28};return{x:20,y:rand(95,H-55)}}
  function enemyScale(){return 1+(wave-1)*(hard?.034:mode==='halloween'?.028:mode==='autumn'?.029:.033)}
  function spawnEnemy(spec,delay=0){
    const p=edgePos(),scale=enemyScale(),hm=hard?{hp:1.28,speed:1.065,damage:1.22}:{hp:1,speed:1,damage:1};
    const seasonal=mode==='halloween'?{hp:.96,speed:.98,damage:.94}:mode==='autumn'?{hp:.98,speed:.98,damage:.96}:{hp:1,speed:1,damage:1};
    enemies.push({id:Math.random().toString(36).slice(2),spec,x:p.x,y:p.y,hp:spec.hp*scale*hm.hp*seasonal.hp,maxHp:spec.hp*scale*hm.hp*seasonal.hp,speed:spec.speed*(1+wave*.003)*hm.speed*seasonal.speed,damage:spec.damage*(1+wave*.017)*hm.damage*seasonal.damage,r:spec.size*(hard?1.02:1),angle:angleTo(p,nest),attack:rand(.2,.8),spawn:delay,stun:0,mark:0,phase:Math.random()*6.28,charge:0,shot:rand(1.1,2.5),elite:Math.random()<Math.min(hard?.20:.14,wave*.003),dead:false,hard,haunted:mode==='halloween',autumn:mode==='autumn'});
  }
  function spawnMiniBoss(spec,delay=0){
    const p=edgePos(),scale=(hard?1.22:1)*(1+wave*.009);
    const e={id:'mini-'+spec.id+'-'+wave,spec,x:p.x,y:p.y,hp:spec.hp*scale,maxHp:spec.hp*scale,speed:spec.speed*(hard?1.07:1),damage:spec.damage*(hard?1.20:1),r:spec.size,angle:angleTo(p,nest),attack:.8,spawn:delay,stun:0,mark:0,phase:0,charge:0,shot:1.2,elite:true,miniBoss:true,dead:false,hard,haunted:false,autumn:mode==='autumn'};enemies.push(e);A.sfx('boss',.55);banner(spec.rank,spec.name);UI.toast(`${spec.name} joined the wave.`,1900)
  }
  function spawnBoss(spec){
    const p=edgePos(),scale=1+(wave-5)*.018,hardMult=hard?1.34:1;boss={spec};const e={id:'boss-'+spec.id,spec,x:p.x,y:p.y,hp:spec.hp*scale*hardMult,maxHp:spec.hp*scale*hardMult,speed:spec.speed*(hard?1.07:1),damage:spec.damage*(hard?1.23:1),r:spec.size,angle:angleTo(p,nest),attack:1.2,spawn:.35,stun:0,mark:0,phase:0,charge:0,shot:1.1,elite:true,boss:true,dead:false,hard,haunted:mode==='halloween',autumn:mode==='autumn'};enemies.push(e);A.sfx('boss');
    let theme=spec.theme;if(hard){const idx=D.bosses.findIndex(b=>b.id===spec.id);if(idx>=0)theme=`hard-boss-${idx+1}.mp3`}if(wave===maxWave)theme=mode==='hard'?'final-hard.mp3':mode==='halloween'?'final-halloween.mp3':mode==='autumn'?'final-autumn.mp3':'final-normal.mp3';A.playBoss(theme);banner(spec.tag,spec.name);UI.toast(`${spec.name} has entered ${biome.name}`,2300)
  }
  function banner(tag,name){$('bossName').textContent=name.toUpperCase();$('bossTag').textContent=tag;$('bossBanner').classList.add('show');setTimeout(()=>$('bossBanner').classList.remove('show'),3500)}
  function gainXp(n){xp+=n;while(xp>=xpNeed&&!choiceOpen){xp-=xpNeed;level++;xpNeed=Math.round(55+level*18+level*level*1.2);openMutation()}updateHUD()}
  function openMutation(){
    choiceOpen=true;paused=true;A.sfx('level');
    const options=[...D.mutations].sort(()=>Math.random()-.5).slice(0,3),box=$('cards');box.innerHTML='';
    for(const m of options){const b=document.createElement('button');b.className='choice mutation-picked';b.innerHTML=`<span class="choice-mark">✦</span><div><h4>${m.name}</h4><p>${m.desc}</p></div>`;b.addEventListener('click',()=>{const beforeNest=player.stats.nestBoost||1;m.apply(player.stats);player.mutations.push(m.id);const afterNest=player.stats.nestBoost||1;if(afterNest>beforeNest&&nest){const ratio=afterNest/beforeNest;nest.maxHp*=ratio;nest.hp=Math.min(nest.maxHp,nest.hp+nest.maxHp*(ratio-1));}choiceOpen=false;paused=false;hideScreens();updateHUD();particlesBurst(player.x,player.y,'#d8f48f',26);UI.toast(`${m.name} mutated — your insect changed`);last=performance.now()});box.appendChild(b)}UI.show('levelup')}
  function openRelic(){
    choiceOpen=true;paused=true;const options=[...D.relics].sort(()=>Math.random()-.5).slice(0,3),box=$('relicCards');box.innerHTML='';
    for(const r of options){const b=document.createElement('button');b.className='choice relic-picked';b.innerHTML=`<span class="choice-mark">◆</span><div><h4>${r.name}</h4><p>${r.desc}</p></div>`;b.addEventListener('click',()=>{const beforeNest=player.stats.nestBoost||1;r.apply(player.stats);player.relics.push(r.id);const afterNest=player.stats.nestBoost||1;if(afterNest>beforeNest&&nest){const ratio=afterNest/beforeNest;nest.maxHp*=ratio;nest.hp=Math.min(nest.maxHp,nest.hp+nest.maxHp*(ratio-1));}if(r.id==='queen'){nest.maxHp*=1.3;nest.hp=nest.maxHp}choiceOpen=false;paused=false;pendingRelic=false;hideScreens();nextWave=2.6;updateHUD();particlesBurst(player.x,player.y,'#b8a0ff',34);UI.toast(`${r.name} bonded — relic is visible on your insect`);last=performance.now()});box.appendChild(b)}UI.show('relic')}
  function hideScreens(){document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'))}

  function hurtPlayer(n){if(player.invuln>0)return;let armor=player.stats.armor+(guardTimer>0?.4:0);n*=1-clamp(armor,0,.72);player.stats.hp-=n;player.invuln=.18;screenShake+=Math.min(14,n*.12);A.sfx('hit',.35);addText(player.x,player.y-30,`-${Math.round(n)}`,'#ff8179');if(player.stats.hp<=0){player.stats.hp=0;endRun(false)}}
  function hurtNest(n){if(nest.shield>0)n*=.45;nest.hp-=n;screenShake+=Math.min(9,n*.04);if(nest.hp<=0){nest.hp=0;endRun(false)}}
  function damageEnemy(e,n,crit=false,stun=0){if(!e||e.dead)return;let mult=(e.boss||e.miniBoss)?player.stats.bossDamage:1;if(e.hp/e.maxHp<.25)mult*=player.stats.execute;if(e.mark>0)mult*=1.22;n*=mult;e.hp-=n;e.stun=Math.max(e.stun,stun);addText(e.x,e.y-e.r-8,`${crit?'CRIT ':''}${Math.round(n)}`,crit?'#ffe67e':'#f1f1d9');particlesBurst(e.x,e.y,e.spec.color,crit?10:5);if(player.stats.lifesteal>0)player.stats.hp=Math.min(player.stats.maxHp,player.stats.hp+n*player.stats.lifesteal);if(e.hp<=0)killEnemy(e)}
  function killEnemy(e){
    if(e.dead)return;e.dead=true;kills++;combo++;comboTimer=3.2;const reward=Math.max(1,Math.round((e.spec.reward||4)*player.stats.crumbMult));crumbs+=reward;gainXp(Math.round((e.spec.xp||10)*(e.boss?1.15:1)));
    if(Math.random()<((e.boss||e.miniBoss)?1:.13*player.stats.gemMult)){const g=e.boss?Math.round(11+wave*.9):e.miniBoss?5:1;UI.addGems(g);gemsRun+=g;A.sfx('gem',.38);pickups.push({x:e.x,y:e.y,type:'gem',life:1.4,r:8})}
    if(mode==='halloween'){const c=e.boss?45:e.miniBoss?12:Math.random()<.34?1+(Math.random()<.14?1:0):0;if(c){UI.addCandy(c);candyRun+=c;A.sfx('candy',.22);pickups.push({x:e.x+10,y:e.y-6,type:'candy',life:1.5,r:8})}}
    if(e.boss){const bonus=Math.round(e.spec.reward||25);UI.addGems(bonus);gemsRun+=bonus;pendingRelic=wave<maxWave;A.stopBoss(mode,musicIndex());particlesBurst(e.x,e.y,mode==='halloween'?'#d8a4ff':'#ffd66e',60);screenShake=24}
    else if(e.miniBoss){UI.addGems(4);gemsRun+=4;particlesBurst(e.x,e.y,'#f6ce78',32);screenShake=12}
    else particlesBurst(e.x,e.y,e.spec.color,13);checkContract();
  }
  function addText(x,y,text,color){texts.push({x,y,text,color,life:1})}
  function particlesBurst(x,y,color,n=8){if(UI.settings.perf)n=Math.ceil(n*.28);n=Math.min(n,UI.settings.perf?8:18);const room=(UI.settings.perf?90:180)-particles.length;if(room<=0)return;n=Math.min(n,room);for(let i=0;i<n;i++){const a=Math.random()*6.28,s=rand(22,125);particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,r:rand(1.2,3.6),color,life:rand(.28,.72)})}}
  function nearest(range=9999){let best=null,bd=range;for(const e of enemies){if(e.dead||e.spawn>0)continue;const d=dist(player,e);if(d<bd){bd=d;best=e}}return best}
  function bite(){
    if(!running||paused||attackTimer>0)return;attackTimer=(attackSpeedBuff>0?.21:.34)/Math.max(.5,player.stats.biteRate||1);A.sfx('bite',.58);const range=player.stats.range;const targets=enemies.filter(e=>!e.dead&&e.spawn<=0&&dist(player,e)<range+e.r).sort((a,b)=>dist(player,a)-dist(player,b)).slice(0,2);if(!targets.length){particlesBurst(player.x+lastDir.x*35,player.y+lastDir.y*35,'#cbd7be',3);return}biteCount++;
    for(const [i,e] of targets.entries()){const crit=Math.random()<player.stats.crit;let n=player.stats.damage*(crit?player.stats.critMult:1)*(i?.7:1);damageEnemy(e,n,crit,Math.random()<player.stats.stun?.35:0);if(player.stats.doubleHit&&Math.random()<player.stats.doubleHit)damageEnemy(e,n*.7,false);if(player.stats.splash)for(const o of enemies)if(o!==e&&!o.dead&&dist(o,e)<58)damageEnemy(o,n*player.stats.splash,false);if(player.stats.chain&&biteCount%5===0){const chain=enemies.filter(o=>o!==e&&!o.dead&&dist(o,e)<185).slice(0,3);chain.forEach((o,j)=>damageEnemy(o,n*(.75-j*.13),true,.2))}}
  }
  function dash(){if(!running||paused||dashTimer>0)return;dashTimer=1.7;A.sfx('dash',.5);const move=inputVec(),d=Math.hypot(move.x,move.y)>.1?norm(move.x,move.y):lastDir,ox=player.x,oy=player.y;player.x=clamp(player.x+d.x*120,30,W-30);player.y=clamp(player.y+d.y*120,95,H-30);player.invuln=.29;for(const e of enemies)if(!e.dead&&lineDist(e.x,e.y,ox,oy,player.x,player.y)<e.r+27)damageEnemy(e,player.stats.damage*.95*player.stats.dashPower,false,.15);particlesBurst(player.x,player.y,'#8ccbc4',16);screenShake+=4}
  function special(){
    if(!running||paused||specialTimer>0)return;specialTimer=player.stats.cooldown;A.sfx('special',.68);const id=player.type,d=lastDir;
    if(id==='ant'){for(const e of enemies)if(!e.dead&&dist(player,e)<130+e.r)damageEnemy(e,player.stats.damage*2.45,true,.48);speedBuff=4}
    else if(id==='termite'){nest.hp=Math.min(nest.maxHp,nest.hp+nest.maxHp*.2*player.stats.repairPower);nest.shield=7;clouds.push({x:nest.x,y:nest.y,r:96,life:7,type:'wall'})}
    else if(id==='ladybug'){guardTimer=5.2;for(const e of enemies)if(!e.dead&&dist(player,e)<95+e.r)damageEnemy(e,player.stats.damage*1.45,false,.55)}
    else if(id==='fly'){const ox=player.x,oy=player.y;player.x=clamp(player.x+d.x*205,25,W-25);player.y=clamp(player.y+d.y*205,90,H-25);for(const e of enemies)if(!e.dead&&lineDist(e.x,e.y,ox,oy,player.x,player.y)<e.r+50)damageEnemy(e,player.stats.damage*2.65,true,.38);speedBuff=3}
    else if(id==='mosquito'){const e=nearest(330);if(e){const a=angleTo(player,e);player.x=e.x-Math.cos(a)*(e.r+24);player.y=e.y-Math.sin(a)*(e.r+24);const n=player.stats.damage*3.3;damageEnemy(e,n,true,.55);player.stats.hp=Math.min(player.stats.maxHp,player.stats.hp+n*.44)}}
    else if(id==='dragonfly'){for(const e of enemies)if(!e.dead&&pointLineForward(e,player,d,360,54))damageEnemy(e,player.stats.damage*2.5,true,.5)}
    else if(id==='bee'){const e=nearest(390);if(e){const a=angleTo(player,e);player.x=clamp(e.x-Math.cos(a)*(e.r+28),25,W-25);player.y=clamp(e.y-Math.sin(a)*(e.r+28),90,H-25);e.mark=7;damageEnemy(e,player.stats.damage*3.45,true,.7)}}
    else if(id==='stinkbug'){clouds.push({x:player.x,y:player.y,r:142,life:7.5,type:'toxic',tick:0});for(const e of enemies)if(!e.dead&&dist(player,e)<146+e.r)e.stun=Math.max(e.stun,.5)}
    else if(id==='spider'){const around=enemies.filter(e=>!e.dead&&dist(player,e)<200+e.r);for(const e of around){e.stun=Math.max(e.stun,2.5);damageEnemy(e,player.stats.damage*(e.hp/e.maxHp<.35?4.2:2.2),true,1.35)}player.invuln=.7}
    else if(id==='firefly'){for(const e of enemies)if(!e.dead&&dist(player,e)<230+e.r)damageEnemy(e,player.stats.damage*2.8,true,1.6);attackSpeedBuff=5;clouds.push({x:player.x,y:player.y,r:170,life:2.4,type:'light'})}
    else if(id==='ghost-moth'){player.invuln=1.4;const targets=enemies.filter(e=>!e.dead).sort((a,b)=>dist(player,a)-dist(player,b)).slice(0,6);targets.forEach((e,i)=>{projectiles.push({x:player.x,y:player.y,vx:0,vy:0,r:8,life:2.2,color:'#cdbaff',damage:player.stats.damage*(1.7+i*.05),homing:e,spectral:true})});clouds.push({x:player.x,y:player.y,r:155,life:2,type:'ghost'})}
    else if(id==='harvest-cicada'){for(const e of enemies)if(!e.dead&&dist(player,e)<245+e.r)damageEnemy(e,player.stats.damage*2.65,true,1.25);attackSpeedBuff=5.5;speedBuff=5.5;clouds.push({x:player.x,y:player.y,r:175,life:2.8,type:'harvest'})}
    particlesBurst(player.x,player.y,player.color,28);screenShake+=8;
  }
  function pointLineForward(e,p,d,len,width){const vx=e.x-p.x,vy=e.y-p.y,proj=vx*d.x+vy*d.y;if(proj<0||proj>len)return false;return Math.abs(vx*d.y-vy*d.x)<width+e.r}
  function lineDist(px,py,x1,y1,x2,y2){const dx=x2-x1,dy=y2-y1,l2=dx*dx+dy*dy||1;let q=((px-x1)*dx+(py-y1)*dy)/l2;q=clamp(q,0,1);return Math.hypot(px-(x1+q*dx),py-(y1+q*dy))}
  function repair(){if(!running||paused||crumbs<12||dist(player,nest)>155)return UI.toast(crumbs<12?'Need 12 crumbs':'Move closer to the nest');crumbs-=12;const amount=88*player.stats.repairPower*(1+.12*(UI.upgrades.repair||0));nest.hp=Math.min(nest.maxHp,nest.hp+amount);A.sfx('repair',.6);particlesBurst(nest.x,nest.y,'#8dd6c6',13);addText(nest.x,nest.y-55,`+${Math.round(amount)}`,'#8ee8ce');updateHUD()}
  function inputVec(){return{x:(keys.ArrowRight||keys.KeyD?1:0)-(keys.ArrowLeft||keys.KeyA?1:0)+joy.x,y:(keys.ArrowDown||keys.KeyS?1:0)-(keys.ArrowUp||keys.KeyW?1:0)+joy.y}}

  function update(dt){
    t+=dt;if(paused)return;attackTimer=Math.max(0,attackTimer-dt);dashTimer=Math.max(0,dashTimer-dt);specialTimer=Math.max(0,specialTimer-dt);player.invuln=Math.max(0,player.invuln-dt);guardTimer=Math.max(0,guardTimer-dt);speedBuff=Math.max(0,speedBuff-dt);attackSpeedBuff=Math.max(0,attackSpeedBuff-dt);nest.shield=Math.max(0,nest.shield-dt);comboTimer=Math.max(0,comboTimer-dt);if(comboTimer<=0)combo=0;
    if(player.stats.regen>0)player.stats.hp=Math.min(player.stats.maxHp,player.stats.hp+player.stats.maxHp*player.stats.regen*dt);
    const v=inputVec();if(Math.hypot(v.x,v.y)>.08){const n=norm(v.x,v.y);lastDir=n;player.angle=Math.atan2(n.y,n.x);const sp=player.stats.speed*(speedBuff>0?1.28:1);player.x=clamp(player.x+n.x*sp*dt,24,W-24);player.y=clamp(player.y+n.y*sp*dt,86,H-24)}
    if(nextWave>0){nextWave-=dt;if(nextWave<=0)startWave()}
    for(const c of clouds){c.life-=dt;c.tick=(c.tick||0)-dt;if(c.type==='toxic'&&c.tick<=0){c.tick=.42;for(const e of enemies)if(!e.dead&&dist(c,e)<c.r+e.r){e.stun=Math.max(e.stun,.2);damageEnemy(e,player.stats.damage*.36,false)}}}clouds=clouds.filter(c=>c.life>0);
    for(const e of enemies)updateEnemy(e,dt);enemies=enemies.filter(e=>!e.dead);
    for(const p of projectiles)updateProjectile(p,dt);projectiles=projectiles.filter(p=>p.life>0);
    for(const p of particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.94;p.vy*=.94}particles=particles.filter(p=>p.life>0);
    for(const p of pickups){p.life-=dt;p.y-=10*dt}pickups=pickups.filter(p=>p.life>0);
    for(const d of texts){d.life-=dt;d.y-=25*dt}texts=texts.filter(d=>d.life>0);if(texts.length>70)texts=texts.slice(-70);if(pickups.length>55)pickups=pickups.slice(-55);if(clouds.length>18)clouds=clouds.slice(-18);
    if(!enemies.length&&wave>0&&nextWave<=0&&!choiceOpen){if(wave>=maxWave)return endRun(true);if(pendingRelic)return openRelic();const reward=Math.round((2+wave*.32)*(hard?1.35:mode==='autumn'?1.2:1));UI.addGems(reward);gemsRun+=reward;if(mode==='halloween'){const c=3+Math.floor(wave/3);UI.addCandy(c);candyRun+=c}crumbs+=10+Math.floor(wave*.45);$('waveReward').textContent=`Wave ${wave} clear · +${reward} Gems${mode==='halloween'?` · +${3+Math.floor(wave/3)} Candy`:''}`;$('waveReward').style.opacity=1;setTimeout(()=>$('waveReward').style.opacity=0,1200);nextWave=2.45;checkContract()}
    checkContract();screenShake=Math.max(0,screenShake-dt*22);const sh=UI.settings.shake?screenShake:0;shakeX=rand(-sh,sh);shakeY=rand(-sh,sh);hudTick-=dt;if(hudTick<=0){hudTick=.10;updateHUD()}
  }
  function updateEnemy(e,dt){
    if(e.spawn>0){e.spawn-=dt;return}if(e.stun>0){e.stun-=dt;return}e.attack-=dt;e.shot-=dt;e.mark=Math.max(0,e.mark-dt);e.phase+=dt;
    const target=dist(e,player)<(e.boss?350:e.miniBoss?260:190)?player:nest;let a=angleTo(e,target);e.angle=a;let sp=e.speed;
    if(['skitter','flier','elite-flier','dive','dobson'].includes(e.spec.ai))a+=Math.sin(e.phase*(e.spec.ai==='skitter'?7:3.2))*.4;
    if(e.spec.ai==='leaper')sp*=.65+Math.max(0,Math.sin(e.phase*4))*1.4;
    if(['charger','rammer','boss1','boss2','boss4'].includes(e.spec.ai)){e.charge=Math.min(1,e.charge+dt*.52);if(e.charge>.72)sp*=2.05}
    if(e.spec.ai==='burrow'){const phase=Math.sin(e.phase*2.4);if(phase<-.5){sp*=1.8;e.invBurrow=true}else e.invBurrow=false}
    if(['artillery','sniper'].includes(e.spec.ai)&&dist(e,target)<(e.spec.ai==='sniper'?340:270)){sp=0;if(e.shot<=0){e.shot=e.spec.ai==='sniper'?2.05:2.65;fireEnemyProjectile(e,target,e.spec.ai==='sniper'?1.4:1)}}
    if(e.miniBoss)miniBossAI(e,target);
    if(e.boss){bossAI(e,target);if(e.dead)return;sp*=1+Math.sin(e.phase*.9)*.06}
    e.x+=Math.cos(a)*sp*dt;e.y+=Math.sin(a)*sp*dt;const d=dist(e,target),rr=e.r+(target.r||20);if(d<rr+8&&e.attack<=0){e.attack=e.boss?.72:e.miniBoss?.82:1;if(target===player)hurtPlayer(e.damage);else hurtNest(e.damage)}
  }
  function miniBossAI(e,target){if(e.shot>0)return;const n=Number(e.spec.id.replace('boss',''))||1;if(n>=3){e.shot=n===5?1.25:1.8;for(let i=0;i<Math.min(5,n);i++)fireEnemyProjectile(e,target,.75+i*.12,(i-(Math.min(5,n)-1)/2)*.15)}}
  function bossAI(e,target){
    const id=e.spec.ai;if(e.shot>0)return;
    const shooters=['widow','waspqueen','hornetboss','watertitan','overlord','pumpkinwidow','gravemantis','hollowqueen','harveststag'];
    if(shooters.includes(id)){e.shot=id==='overlord'||id==='hollowqueen'?1.05:id==='hornetboss'?1.3:1.65;const count=id==='overlord'||id==='hollowqueen'?7:id==='waspqueen'||id==='pumpkinwidow'?5:3;for(let i=0;i<count;i++)fireEnemyProjectile(e,target,.8+i*.09,(i-(count-1)/2)*.13)}
  }
  function fireEnemyProjectile(e,target,power=1,offset=0){if(projectiles.length>(UI.settings.perf?55:95))return;const a=angleTo(e,target)+offset,s=145*(hard?1.07:1);projectiles.push({x:e.x,y:e.y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,r:e.boss?8:6,life:3.6,color:e.spec.color,damage:e.damage*.55*power,enemy:true})}
  function updateProjectile(p,dt){
    p.life-=dt;if(p.homing){if(p.homing.dead){p.life=0;return}const a=angleTo(p,p.homing);p.vx=lerp(p.vx,Math.cos(a)*250,Math.min(1,dt*7));p.vy=lerp(p.vy,Math.sin(a)*250,Math.min(1,dt*7));p.x+=p.vx*dt;p.y+=p.vy*dt;if(dist(p,p.homing)<p.homing.r+p.r){damageEnemy(p.homing,p.damage,true,.4);p.life=0}return}
    p.x+=p.vx*dt;p.y+=p.vy*dt;if(p.enemy&&dist(p,player)<player.r+p.r){hurtPlayer(p.damage);p.life=0}else if(p.enemy&&dist(p,nest)<nest.r*.72+p.r){hurtNest(p.damage*.65);p.life=0}if(p.x<-30||p.x>W+30||p.y<60||p.y>H+30)p.life=0
  }
  function endRun(win){
    if(!running)return;running=false;paused=false;$('hud').classList.add('hidden');$('mobileControls').classList.add('hidden');A.stopAll();A.sfx(win?'victory':'death',.7);const secs=Math.max(1,Math.round((performance.now()-runStart)/1000));
    const stats=`<b>${modeData().name}</b><br>Wave ${wave}/${maxWave}<br>${kills} predators defeated<br>${gemsRun} Gems earned${mode==='halloween'?`<br>${candyRun} Candy Corn earned`:''}<br>Level ${level}<br>${Math.floor(secs/60)}m ${secs%60}s`;
    if(win){
      UI.win(mode);let title='CAMPAIGN CLEARED',copy='The backyard belongs to the colony.';
      if(mode==='hard'){title='NIGHTFALL CONQUERED';copy='Every Nightmare predator fell before sunrise. Hard Mode cleared.'}
      if(mode==='halloween'){title='THE HAUNT IS BROKEN';copy='Hollow Queen is defeated. Ghost Moth is now permanently unlocked.'}
      if(mode==='autumn'){title='HARVEST RUSH CLEARED';const bonus=120;UI.addGems(bonus);gemsRun+=bonus;copy=`Harvest Stag fell. Harvest Cicada is now permanently unlocked. Completion bonus: +${bonus} Gems.`}
      $('victoryTitle').textContent=title;$('victoryKicker').textContent=modeData().name;$('victoryCopy').textContent=copy;$('victoryStats').innerHTML=stats;UI.show('victory');
    }else{$('runStats').innerHTML=stats;UI.show('gameover')}
    UI.syncMenu();
  }
  function updateHUD(){
    if(!player||!nest)return;$('hpBar').style.width=`${clamp(player.stats.hp/player.stats.maxHp*100,0,100)}%`;$('hpText').textContent=`${Math.ceil(player.stats.hp)}/${Math.ceil(player.stats.maxHp)}`;$('nestBar').style.width=`${clamp(nest.hp/nest.maxHp*100,0,100)}%`;$('nestText').textContent=`${Math.ceil(nest.hp)}/${Math.ceil(nest.maxHp)}`;$('waveText').textContent=wave;$('enemyCount').textContent=`${enemies.length} left`;$('crumbsText').textContent=crumbs;$('gemsText').textContent=gemsRun;$('candyText').textContent=candyRun;$('levelText').textContent=level;$('xpText').textContent=`${Math.floor(xp)}/${xpNeed}`;$('xpBar').style.width=`${clamp(xp/xpNeed*100,0,100)}%`;$('eventPill').textContent=eventName;$('comboText').textContent=`x${combo}`;$('contractHud').innerHTML=`<b>${contractDone?'CONTRACT COMPLETE':contract?.name||'CONTRACT'}</b><br>${contractDone?'Reward secured':contract?.desc||''}`;const p=selected();$('abilityName').textContent=p.ability.toUpperCase();$('abilityState').textContent=specialTimer<=0?'READY':`${specialTimer.toFixed(1)}s`;$('abilityState').style.color=specialTimer<=0?'#b5e270':'#aaa';const ev=$('evolutionText');if(ev){const muts=(player.mutations||[]).map(id=>D.mutations.find(m=>m.id===id)?.name).filter(Boolean),rels=(player.relics||[]).map(id=>D.relics.find(r=>r.id===id)?.name).filter(Boolean);ev.textContent=[...muts.slice(-3),...rels.slice(-2)].join(' · ')||'BASE FORM';}
  }

  function rebuildWorldLayer(){worldBuilding=true;drawWorld();worldCtx.clearRect(0,0,W,H);worldCtx.drawImage(canvas,0,0);worldBuilding=false;worldDirty=false}
  function drawCachedWorld(){if(worldDirty)rebuildWorldLayer();ctx.drawImage(worldLayer,0,0)}
  function draw(){ctx.save();ctx.translate(shakeX,shakeY);drawCachedWorld();if(mode==='autumn')drawAutumnSet();if(nest)drawNest(nest);drawAmbient();for(const c of clouds)drawCloud(c);for(const p of pickups)drawPickup(p);for(const e of enemies)drawEnemy(e);for(const p of projectiles)drawProjectile(p);if(player)drawPlayer(player);for(const p of particles)drawParticle(p);for(const d of texts)drawText(d);ctx.restore()}
  function drawWorld(){
    const b=biome||D.biomes[0],night=hard||mode==='halloween';
    const g=ctx.createLinearGradient(0,0,W,H);g.addColorStop(0,b.ground2);g.addColorStop(.52,b.ground);g.addColorStop(1,night?'#03070c':'#06150d');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    if(night)drawNightSky(b);else drawSunlight(b);
    drawFence(night);drawPath(b);drawPond(b,night);for(const d of decor)drawDecor(d,b);if(mode==='halloween')drawHalloweenSet();if(mode==='autumn'&&!worldBuilding)drawAutumnSet();drawLog();if(!worldBuilding){if(nest)drawNest(nest);else drawNest({x:CX,y:CY,r:56,maxHp:1,hp:1,shield:0});drawAmbient()}
  }
  function drawSunlight(b){const rg=ctx.createRadialGradient(880,50,10,880,50,600);rg.addColorStop(0,'rgba(255,230,146,.16)');rg.addColorStop(1,'rgba(255,230,146,0)');ctx.fillStyle=rg;ctx.fillRect(0,0,W,H)}
  function drawNightSky(b){
    const moonX=1040,moonY=132;const rg=ctx.createRadialGradient(moonX,moonY,8,moonX,moonY,420);rg.addColorStop(0,hard?'rgba(113,145,255,.28)':'rgba(181,143,255,.23)');rg.addColorStop(1,'rgba(15,18,40,0)');ctx.fillStyle=rg;ctx.fillRect(0,0,W,H);
    ctx.fillStyle=hard?'rgba(202,216,255,.85)':'rgba(229,213,255,.75)';ctx.beginPath();ctx.arc(moonX,moonY,35,0,6.28);ctx.fill();ctx.fillStyle=hard?'#111a31':'#251c34';ctx.beginPath();ctx.arc(moonX+14,moonY-8,34,0,6.28);ctx.fill();
    if(!UI.settings.perf){ctx.fillStyle='rgba(214,228,255,.65)';for(let i=0;i<38;i++){const x=(i*191+bgSeed*73)%W,y=82+((i*97+bgSeed*31)%(H-130));ctx.globalAlpha=.25+.5*Math.abs(Math.sin(t*.8+i));ctx.fillRect(x,y,1.4,1.4)}ctx.globalAlpha=1}
  }
  function drawFence(night){ctx.fillStyle=night?'#171824':'#2b2b1d';ctx.fillRect(0,0,W,72);for(let x=-20;x<W;x+=42){ctx.fillStyle=x%84===0?(night?'#29273a':'#473927'):(night?'#222232':'#3a3223');roundRect(x,0,32,73,3,true);ctx.strokeStyle=night?'rgba(130,148,210,.1)':'rgba(224,197,126,.12)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+7,0);ctx.lineTo(x+5,70);ctx.stroke()}ctx.fillStyle=night?'rgba(45,65,91,.25)':'rgba(86,125,55,.25)';ctx.fillRect(0,62,W,10)}
  function drawPath(b){ctx.strokeStyle=b.path;ctx.lineWidth=120;ctx.lineCap='round';ctx.globalAlpha=.74;ctx.beginPath();ctx.moveTo(-60,590);ctx.bezierCurveTo(220,520,330,300,560,370);ctx.bezierCurveTo(820,470,920,325,1340,260);ctx.stroke();ctx.globalAlpha=1;ctx.strokeStyle='rgba(239,226,168,.11)';ctx.lineWidth=3;ctx.setLineDash([6,13]);ctx.beginPath();ctx.moveTo(-60,590);ctx.bezierCurveTo(220,520,330,300,560,370);ctx.bezierCurveTo(820,470,920,325,1340,260);ctx.stroke();ctx.setLineDash([])}
  function drawPond(b,night){if(b.name.includes('Porch'))return;const pg=ctx.createRadialGradient(145,150,10,145,150,180);pg.addColorStop(0,night?'rgba(70,88,143,.6)':'rgba(76,154,158,.58)');pg.addColorStop(1,night?'rgba(23,42,67,.7)':'rgba(34,89,97,.64)');ctx.fillStyle=pg;ctx.strokeStyle=night?'rgba(154,170,242,.22)':'rgba(150,228,211,.28)';ctx.lineWidth=4;ctx.beginPath();ctx.ellipse(145,150,168,111,-.12,0,6.28);ctx.fill();ctx.stroke();if(!UI.settings.perf){ctx.strokeStyle=night?'rgba(188,199,255,.08)':'rgba(213,250,231,.08)';for(let i=0;i<5;i++){ctx.beginPath();ctx.ellipse(145,150,80+i*20,45+i*11,-.12,0,6.28);ctx.stroke()}}}
  function drawHalloweenSet(){
    ctx.save();ctx.globalAlpha=.55;for(let i=0;i<6;i++){const x=900+i*45,y=520+Math.sin(i)*18;ctx.strokeStyle='#b8a8cb';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y-40);ctx.stroke();ctx.fillStyle='#cbc1d4';ctx.beginPath();ctx.moveTo(x-13,y-40);ctx.lineTo(x+13,y-40);ctx.lineTo(x+10,y-62);ctx.lineTo(x-10,y-62);ctx.closePath();ctx.fill()}ctx.restore()
  }
  function drawAutumnSet(){if(UI.settings.perf)return;for(let i=0;i<14;i++){const x=(i*101+t*24)%W,y=90+((i*67+t*14)%560);ctx.save();ctx.translate(x,y);ctx.rotate(t+i);ctx.fillStyle=i%2?'rgba(214,111,44,.45)':'rgba(234,175,64,.45)';ctx.beginPath();ctx.ellipse(0,0,7,3,0,0,6.28);ctx.fill();ctx.restore()}}
  function drawLog(){ctx.save();ctx.translate(1060,585);ctx.rotate(-.16);ctx.fillStyle=mode==='halloween'?'#422434':'#5e331f';roundRect(-120,-33,240,66,28,true);ctx.strokeStyle='#21120d';ctx.lineWidth=5;roundRect(-120,-33,240,66,28,false,true);for(let i=-95;i<90;i+=30){ctx.strokeStyle='rgba(30,15,8,.4)';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(i,-26);ctx.lineTo(i+5,28);ctx.stroke()}ctx.fillStyle=mode==='halloween'?'#7a4b62':'#98633b';ctx.beginPath();ctx.arc(118,0,29,0,6.28);ctx.fill();ctx.strokeStyle='#4c2919';ctx.lineWidth=4;ctx.stroke();ctx.restore()}
  function drawDecor(d,b){
    ctx.save();ctx.translate(d.x,d.y);ctx.rotate(d.a);
    if(d.type==='blade'||d.type==='deadgrass'){ctx.strokeStyle=d.type==='deadgrass'?`rgba(116,89,70,${.25+d.h*.25})`:`rgba(92,151,67,${.18+d.h*.23})`;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(0,7);ctx.quadraticCurveTo(2,-10,5,-19);ctx.stroke()}
    else if(d.type==='leaf'||d.type==='autumnleaf'){ctx.fillStyle=d.type==='autumnleaf'?(d.h>.5?'rgba(213,114,48,.58)':'rgba(233,171,62,.55)'):`rgba(72,129,59,${.2+d.h*.34})`;ctx.beginPath();ctx.ellipse(0,0,d.r*.9,d.r*.38,0,0,6.28);ctx.fill();ctx.strokeStyle='rgba(24,32,20,.3)';ctx.beginPath();ctx.moveTo(-d.r*.7,0);ctx.lineTo(d.r*.7,0);ctx.stroke()}
    else if(d.type==='flower'){const cols=['#e5c969','#dd8ab6','#92c9dd','#e0a25e'];ctx.fillStyle=cols[Math.floor(d.h*cols.length)%cols.length];for(let i=0;i<5;i++){ctx.rotate(1.256);ctx.beginPath();ctx.ellipse(0,-d.r*.6,d.r*.28,d.r*.5,0,0,6.28);ctx.fill()}ctx.fillStyle='#ecd66d';ctx.beginPath();ctx.arc(0,0,d.r*.25,0,6.28);ctx.fill()}
    else if(d.type==='stone'||d.type==='tomb'){ctx.fillStyle=d.type==='tomb'?'rgba(92,91,102,.82)':'rgba(53,76,68,.72)';ctx.strokeStyle='rgba(10,22,18,.65)';ctx.lineWidth=2;if(d.type==='tomb'){ctx.beginPath();ctx.roundRect(-d.r*.8,-d.r*1.5,d.r*1.6,d.r*2.3,d.r*.5);ctx.fill();ctx.stroke();ctx.strokeStyle='rgba(195,192,206,.25)';ctx.beginPath();ctx.moveTo(0,-d.r);ctx.lineTo(0,d.r*.3);ctx.moveTo(-d.r*.4,-d.r*.35);ctx.lineTo(d.r*.4,-d.r*.35);ctx.stroke()}else{ctx.beginPath();ctx.ellipse(0,0,d.r*1.5,d.r,0,0,6.28);ctx.fill();ctx.stroke()}}
    else if(d.type==='mush'){ctx.fillStyle=mode==='halloween'?'#7b4a91':'#c36b4c';ctx.beginPath();ctx.arc(0,0,d.r,Math.PI,0);ctx.fill();ctx.fillStyle='#d4c49d';ctx.fillRect(-2,0,4,d.r*1.4)}
    else if(d.type==='pumpkin'){ctx.fillStyle='#cf6827';ctx.beginPath();ctx.ellipse(0,0,d.r*1.25,d.r,0,0,6.28);ctx.fill();ctx.strokeStyle='#8c3e1d';ctx.lineWidth=1.5;for(const k of [-.5,0,.5]){ctx.beginPath();ctx.ellipse(k*d.r,0,d.r*.35,d.r*.85,0,0,6.28);ctx.stroke()}ctx.fillStyle='#526b2e';ctx.fillRect(-1,-d.r-5,3,6)}
    else if(d.type==='web'){ctx.strokeStyle='rgba(218,211,235,.22)';ctx.lineWidth=1;for(let i=0;i<5;i++){const a=i*1.256;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(a)*d.r*2,Math.sin(a)*d.r*2);ctx.stroke()}for(let r=.5;r<2;r+=.45){ctx.beginPath();ctx.arc(0,0,d.r*r,0,6.28);ctx.stroke()}}
    else if(d.type==='acorn'){ctx.fillStyle='#82542e';ctx.beginPath();ctx.ellipse(0,2,d.r*.65,d.r,0,0,6.28);ctx.fill();ctx.fillStyle='#4d3825';ctx.fillRect(-d.r*.7,-d.r*.6,d.r*1.4,d.r*.45)}ctx.restore()
  }
  function drawAmbient(){if(UI.settings.perf)return;for(const a of ambient){const glow=hard?'#829cff':mode==='halloween'?'#ba85ff':mode==='autumn'?'#f0a14b':'#9ce878';ctx.globalAlpha=.15+.35*Math.max(0,Math.sin(t*1.5+a.phase));ctx.fillStyle=glow;ctx.beginPath();ctx.arc(a.x+Math.sin(t+a.phase)*7,a.y+Math.cos(t*.8+a.phase)*5,a.size,0,6.28);ctx.fill()}ctx.globalAlpha=1}
  function drawNest(n){
    ctx.save();ctx.translate(n.x,n.y);if(n.shield>0){ctx.strokeStyle='rgba(105,220,196,.62)';ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,n.r+26+Math.sin(t*3)*4,0,6.28);ctx.stroke()}
    ctx.fillStyle='rgba(0,0,0,.22)';ctx.beginPath();ctx.ellipse(8,19,84,40,0,0,6.28);ctx.fill();const g=ctx.createRadialGradient(-12,-12,4,0,0,73);g.addColorStop(0,mode==='halloween'?'#7d5c66':'#9b7549');g.addColorStop(.55,mode==='halloween'?'#513747':'#6c482e');g.addColorStop(1,'#2e1c15');ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(0,0,72,43,0,0,6.28);ctx.fill();ctx.strokeStyle='#24150f';ctx.lineWidth=5;ctx.stroke();ctx.fillStyle='#120c09';ctx.beginPath();ctx.ellipse(0,-4,36,20,0,0,6.28);ctx.fill();ctx.strokeStyle='#080604';ctx.lineWidth=3;ctx.stroke();for(let i=0;i<9;i++){const a=i*2.399;ctx.fillStyle=mode==='halloween'?'#9c6e83':'#b18757';ctx.beginPath();ctx.arc(Math.cos(a)*60,Math.sin(a)*31,3,0,6.28);ctx.fill()}if(mode==='halloween'){ctx.fillStyle='#ea7e35';ctx.globalAlpha=.5+.25*Math.sin(t*3);ctx.beginPath();ctx.arc(0,-4,9,0,6.28);ctx.fill();ctx.globalAlpha=1}ctx.restore()
  }
  function drawPlayer(p){
    drawPlayerEvolutionBack(p);drawInsect(p.type,p.x,p.y,p.angle,1,p.color,false,p.invuln>0,false);drawPlayerEvolutionFront(p);
    if(p.mark>0){ctx.strokeStyle='#ffdb63';ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,29,0,6.28);ctx.stroke()}
  }
  function drawPlayerEvolutionBack(p){
    const u=UI.upgrades||{},m=new Set(p.mutations||[]),r=new Set(p.relics||[]);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);
    const aura=(UI.halloweenActive()&&(UI.halloweenUpgrades.candyfang||0)>0)?'#ff9138':r.has('moonstone')?'#8ca2ff':r.has('amber')?'#8ff0a6':r.has('void')?'#a881ff':null;
    if(aura){ctx.globalAlpha=.22+.08*Math.sin(t*4);ctx.strokeStyle=aura;ctx.lineWidth=5;ctx.beginPath();ctx.ellipse(-2,0,34+Math.sin(t*3)*2,27,0,0,6.28);ctx.stroke();ctx.globalAlpha=1}
    if((u.speed||0)>0||m.has('runner')||m.has('phase')){ctx.strokeStyle=m.has('phase')?'#8ddfff':'rgba(190,235,137,.55)';ctx.lineWidth=2;for(const sy of [-1,1])for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(-16-i*3,sy*(8+i*2));ctx.lineTo(-34-i*7,sy*(11+i*4));ctx.stroke()}}
    if(m.has('shock')||r.has('storm')||r.has('fireprism')){ctx.strokeStyle='#e8f27a';ctx.lineWidth=2;ctx.globalAlpha=.65+.25*Math.sin(t*9);for(let i=0;i<3;i++){const a=t*2+i*2.1;ctx.beginPath();ctx.moveTo(Math.cos(a)*27,Math.sin(a)*20);ctx.lineTo(Math.cos(a+.3)*34,Math.sin(a+.3)*25);ctx.lineTo(Math.cos(a+.55)*29,Math.sin(a+.55)*21);ctx.stroke()}ctx.globalAlpha=1}ctx.restore()
  }
  function drawPlayerEvolutionFront(p){
    const u=UI.upgrades||{},m=new Set(p.mutations||[]),r=new Set(p.relics||[]);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);
    const armor=(u.health||0)+((m.has('shell')||m.has('prism')||m.has('armor'))?3:0)+(r.has('void')?3:0);if(armor>0){ctx.strokeStyle=armor>6?'#d5e2d0':'rgba(205,224,196,.7)';ctx.lineWidth=Math.min(4,1.5+armor*.18);for(const xx of [-13,-2,9]){ctx.beginPath();ctx.arc(xx,0,10+Math.min(5,armor*.25),-1.05,1.05);ctx.stroke()}}
    const mand=(u.bite||0)+((m.has('feral')||m.has('razor')||m.has('twin'))?4:0)+(r.has('royalmandible')?5:0);if(mand>0){ctx.strokeStyle=mand>8?'#f4d46b':'#c9d09a';ctx.lineWidth=2.2;const len=9+Math.min(10,mand);for(const sy of [-1,1]){ctx.beginPath();ctx.moveTo(26,sy*5);ctx.lineTo(26+len,sy*(10+mand*.22));ctx.lineTo(31+len,sy*(5+mand*.12));ctx.stroke()}}
    if((u.crit||0)>0||m.has('fang')||m.has('heavycrit')||m.has('twin')){ctx.fillStyle='#ff7a72';ctx.shadowColor='#ff514c';ctx.shadowBlur=8;ctx.beginPath();ctx.arc(22,-4,2.8,0,6.28);ctx.arc(22,4,2.8,0,6.28);ctx.fill();ctx.shadowBlur=0}
    if((u.bossbreak||0)>0||m.has('boss')||m.has('hunter')){ctx.strokeStyle='#e6c26b';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(8,-15);ctx.lineTo(13,-23);ctx.lineTo(18,-15);ctx.lineTo(23,-23);ctx.lineTo(28,-14);ctx.stroke()}
    if((u.metabolic||0)>0){ctx.fillStyle='#a9d66c';ctx.globalAlpha=.82;const n=Math.min(5,1+Math.floor((u.metabolic||0)/2));for(let i=0;i<n;i++){const x=-16+i*8;ctx.beginPath();ctx.moveTo(x,-13);ctx.lineTo(x+4,-21-Math.min(6,u.metabolic||0));ctx.lineTo(x+8,-13);ctx.closePath();ctx.fill()}ctx.globalAlpha=1}
    if((u.lifesteal||0)>0||m.has('vamp')||m.has('bloodcarapace')||r.has('blood')){ctx.fillStyle='#b43e55';ctx.globalAlpha=.8;ctx.beginPath();ctx.arc(-17,0,4.5,0,6.28);ctx.fill();ctx.globalAlpha=1}
    const relics=[...(p.relics||[])].slice(-4),rc=['#ffd778','#a98cff','#7ee4e0','#ff778c'];relics.forEach((id,i)=>{const a=t*(1.2+i*.15)+i*1.57,rad=31+i*4;ctx.fillStyle=rc[i%rc.length];ctx.shadowColor=rc[i%rc.length];ctx.shadowBlur=8;ctx.beginPath();ctx.moveTo(Math.cos(a)*rad,Math.sin(a)*rad-4);ctx.lineTo(Math.cos(a)*rad+4,Math.sin(a)*rad);ctx.lineTo(Math.cos(a)*rad,Math.sin(a)*rad+4);ctx.lineTo(Math.cos(a)*rad-4,Math.sin(a)*rad);ctx.closePath();ctx.fill();ctx.shadowBlur=0});
    if(UI.halloweenActive()&&(UI.halloweenUpgrades.lanternshell||0)>0){ctx.strokeStyle='#ff9c45';ctx.globalAlpha=.55;ctx.lineWidth=2;ctx.beginPath();ctx.arc(-10,0,17,0,6.28);ctx.stroke();ctx.globalAlpha=1}ctx.restore()
  }
  function bodyGradient(color,x0=-16){const g=ctx.createLinearGradient(x0,-14,20,14);g.addColorStop(0,mix(color,'#fff',.28));g.addColorStop(.45,color);g.addColorStop(1,mix(color,'#000',.35));return g}
  const spriteCache=new Map();
  function bugSprite(type,color,nightmare=false,eventArt=''){
    const key=[type,color,nightmare?1:0,eventArt].join('|');if(spriteCache.has(key))return spriteCache.get(key);
    const c=document.createElement('canvas');c.width=c.height=192;const g=c.getContext('2d');g.translate(96,96);g.lineCap='round';g.lineJoin='round';
    const base=nightmare?mix(color,'#243b93',.48):color,dark=mix(base,'#000',.58),dark2=mix(base,'#000',.35),light=mix(base,'#fff',.34),hi=mix(base,'#fff',.62);
    const fillEllipse=(x,y,rx,ry,fill,stroke=dark,lw=3)=>{g.fillStyle=fill;g.strokeStyle=stroke;g.lineWidth=lw;g.beginPath();g.ellipse(x,y,rx,ry,0,0,Math.PI*2);g.fill();if(lw)g.stroke()};
    const grad=(x1,y1,x2,y2,a=light,b=base,c2=dark2)=>{const q=g.createLinearGradient(x1,y1,x2,y2);q.addColorStop(0,a);q.addColorStop(.48,b);q.addColorStop(1,c2);return q};
    const leg=(x,y,x2,y2,x3,y3,lw=5)=>{g.strokeStyle=dark;g.lineWidth=lw;g.beginPath();g.moveTo(x,y);g.lineTo(x2,y2);g.lineTo(x3,y3);g.stroke();g.strokeStyle=mix(base,'#fff',.12);g.lineWidth=Math.max(1,lw*.22);g.beginPath();g.moveTo(x,y);g.lineTo(x2,y2);g.stroke()};
    const eye=(x,y,r=3)=>{g.fillStyle=nightmare?'#b8c5ff':'#090d0b';g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.fill();if(!nightmare){g.fillStyle='rgba(255,255,255,.72)';g.beginPath();g.arc(x-1,y-1,r*.34,0,Math.PI*2);g.fill()}};
    // soft contact shadow baked into the sprite
    g.fillStyle='rgba(0,0,0,.20)';g.beginPath();g.ellipse(-4,25,43,12,0,0,Math.PI*2);g.fill();
    const winged=['fly','mosquito','dragonfly','bee','firefly','ghost-moth','moth','harvest-cicada'].includes(type);
    // legs with joints, varied by anatomy
    if(type==='spider'){
      for(const sy of [-1,1])for(let i=0;i<4;i++){const x=-12+i*9,yy=sy*(9+i*1.5);leg(x,yy,x+(i-1.5)*5,sy*(25+i*4),x+(i-1.5)*12,sy*(37+i*4),5.5)}
    }else if(type==='centipede'){
      for(let i=0;i<8;i++){const x=30-i*10;for(const sy of [-1,1])leg(x,sy*5,x-3,sy*15,x-8,sy*20,2.8)}
    }else{
      for(const sy of [-1,1])for(let i=0;i<3;i++){const x=-11+i*15;leg(x,sy*7,x-7+i*4,sy*(21+i*3),x-13+i*5,sy*(31+i*3),4.2)}
    }
    // translucent wings + veins
    if(winged){
      const wingFill=type==='ghost-moth'?'rgba(214,198,255,.52)':type==='firefly'?'rgba(194,222,204,.42)':type==='harvest-cicada'?'rgba(239,179,92,.42)':'rgba(202,234,238,.46)';
      const long=type==='dragonfly'?46:type==='ghost-moth'||type==='moth'?38:type==='harvest-cicada'?40:31,wide=type==='ghost-moth'||type==='moth'?16:type==='harvest-cicada'?14:10;
      for(const sy of [-1,1]){g.save();g.rotate(sy*(type==='dragonfly'?.06:.13));g.fillStyle=wingFill;g.strokeStyle='rgba(230,250,248,.34)';g.lineWidth=2;g.beginPath();g.moveTo(-10,sy*7);g.bezierCurveTo(-4,sy*(19+wide),long*.75,sy*(19+wide),long,sy*8);g.bezierCurveTo(long*.55,sy*5,8,sy*4,-10,sy*7);g.fill();g.stroke();g.strokeStyle='rgba(53,79,82,.32)';g.lineWidth=1;for(let k=0;k<3;k++){g.beginPath();g.moveTo(-5,sy*(7+k*2));g.lineTo(12+k*9,sy*(9+wide*.55));g.stroke()}g.restore()}
    }
    // species bodies
    if(type==='ladybug'){
      fillEllipse(-11,0,31,24,grad(-28,-18,20,20,mix('#e9433d','#fff',.38),'#e9433d','#771b1b'),'#3a1717',4);g.strokeStyle='#341517';g.lineWidth=3;g.beginPath();g.moveTo(-10,-23);g.lineTo(-10,23);g.stroke();g.fillStyle='#191617';for(const q of [[-26,-10],[-1,-11],[-25,10],[0,10],[-12,-2]]){g.beginPath();g.arc(q[0],q[1],4,0,Math.PI*2);g.fill()}
    }else if(type==='termite'){
      fillEllipse(-24,0,25,17,grad(-42,-15,-8,15,'#fff1c6','#e7cf9d','#b79263'),'#7c633f',3);fillEllipse(4,0,20,16,grad(-8,-14,22,14,'#f5dfb0','#d8bb82','#a57a47'),'#765736',3);
    }else if(type==='spider'){
      fillEllipse(-21,0,25,23,grad(-40,-18,-5,20,light,base,dark),'#171217',4);g.fillStyle=nightmare?'#8598ff':mix(base,'#fff',.28);g.beginPath();g.moveTo(-32,-6);g.lineTo(-14,0);g.lineTo(-32,7);g.closePath();g.fill();fillEllipse(10,0,18,17,grad(-2,-13,24,13,light,base,dark),'#171217',4);
    }else if(type==='stinkbug'){
      g.fillStyle=grad(-36,-25,28,25);g.strokeStyle=dark;g.lineWidth=4;g.beginPath();g.moveTo(-40,0);g.quadraticCurveTo(-28,-29,4,-25);g.quadraticCurveTo(35,-18,38,0);g.quadraticCurveTo(35,18,4,25);g.quadraticCurveTo(-28,29,-40,0);g.fill();g.stroke();g.strokeStyle=mix(base,'#fff',.25);g.lineWidth=1.6;g.beginPath();g.moveTo(-30,0);g.lineTo(27,0);g.moveTo(-8,-21);g.lineTo(10,21);g.moveTo(-7,21);g.lineTo(11,-21);g.stroke();
    }else if(type==='firefly'){
      fillEllipse(-16,0,33,17,grad(-45,-15,15,15,'#555240','#36352b','#171812'),'#171711',4);g.shadowColor='#ffe86a';g.shadowBlur=18;fillEllipse(-34,0,14,14,grad(-46,-10,-23,10,'#fff4a0','#f5d349','#b47a12'),'#574511',2);g.shadowBlur=0;
    }else if(type==='ghost-moth'||type==='moth'){
      fillEllipse(-11,0,30,14,grad(-35,-13,20,13,light,base,dark),'#544967',3);g.fillStyle=type==='ghost-moth'?'rgba(235,223,255,.38)':'rgba(226,215,182,.24)';g.beginPath();g.arc(-17,0,7,0,Math.PI*2);g.fill();
    }else if(type==='harvest-cicada'){
      fillEllipse(-15,0,34,18,grad(-45,-16,18,16,'#f2b65f',base,'#6f3e1f'),'#4a2d20',4);g.strokeStyle='#f0c36f';g.lineWidth=2;for(let x=-35;x<12;x+=10){g.beginPath();g.moveTo(x,-13);g.lineTo(x-4,13);g.stroke()}g.fillStyle='#8f5d2e';g.beginPath();g.arc(-32,0,7,0,Math.PI*2);g.fill();
    }else if(type==='centipede'){
      for(let i=0;i<8;i++){const x=31-i*10;fillEllipse(x,0,9,8,grad(x-7,-6,x+7,6,mix(base,'#fff',.22-i*.01),base,dark2),dark,2.5)}
    }else if(type==='flea'){
      fillEllipse(-2,0,25,17,grad(-24,-15,18,15,light,base,dark),dark,4);g.strokeStyle=light;g.lineWidth=1.4;for(let x=-15;x<15;x+=8){g.beginPath();g.moveTo(x,-12);g.lineTo(x-4,12);g.stroke()}
    }else if(type==='earwig'){
      fillEllipse(-10,0,34,13,grad(-40,-11,22,11,light,base,dark),dark,4);g.strokeStyle=dark;g.lineWidth=5;for(const sy of [-1,1]){g.beginPath();g.moveTo(-42,sy*4);g.quadraticCurveTo(-58,sy*22,-65,sy*5);g.stroke()}
    }else if(type==='mantis'){
      fillEllipse(-12,0,29,11,grad(-38,-10,19,10,light,base,dark),dark,4);g.strokeStyle=dark;g.lineWidth=7;for(const sy of [-1,1]){g.beginPath();g.moveTo(4,sy*7);g.lineTo(29,sy*34);g.lineTo(45,sy*22);g.stroke();g.strokeStyle=light;g.lineWidth=1.4;g.beginPath();g.moveTo(29,sy*34);g.lineTo(42,sy*22);g.stroke();g.strokeStyle=dark;g.lineWidth=7}
    }else if(type==='scorpion'){
      fillEllipse(-8,0,28,19,grad(-32,-16,18,16,light,base,dark),dark,4);g.strokeStyle=dark;g.lineWidth=7;g.beginPath();g.moveTo(-34,0);g.bezierCurveTo(-55,-22,-49,-46,-28,-49);g.bezierCurveTo(-12,-52,-11,-36,-19,-30);g.stroke();for(const sy of [-1,1]){g.beginPath();g.moveTo(12,sy*12);g.lineTo(37,sy*28);g.lineTo(49,sy*18);g.stroke()}
    }else if(type==='stag'||type==='beetle'){
      fillEllipse(-15,0,30,22,grad(-42,-18,10,18,light,base,dark),dark,4);g.strokeStyle=mix(base,'#fff',.15);g.lineWidth=1.8;g.beginPath();g.moveTo(-15,-20);g.lineTo(-15,20);g.stroke();
    }else if(type==='assassin'){
      g.fillStyle=grad(-42,-18,28,18);g.strokeStyle=dark;g.lineWidth=4;g.beginPath();g.moveTo(-40,0);g.lineTo(-17,-19);g.lineTo(18,-14);g.lineTo(37,0);g.lineTo(18,14);g.lineTo(-17,19);g.closePath();g.fill();g.stroke();
    }else if(type==='dobson'){
      fillEllipse(-14,0,33,13,grad(-42,-12,18,12,light,base,dark),dark,4);g.strokeStyle=dark;g.lineWidth=5;for(const sy of [-1,1]){g.beginPath();g.moveTo(22,sy*5);g.quadraticCurveTo(49,sy*12,56,sy*2);g.stroke()}
    }else if(type==='cricket'||type==='hopper'){
      fillEllipse(-13,0,30,18,grad(-41,-15,18,15,light,base,dark),dark,4);for(const sy of [-1,1])leg(-25,sy*10,-48,sy*31,-61,sy*14,7);
    }else if(type==='roach'){
      fillEllipse(-12,0,34,20,grad(-42,-18,18,18,light,base,dark),dark,4);g.strokeStyle=mix(base,'#fff',.18);g.lineWidth=1.4;for(let x=-31;x<18;x+=10){g.beginPath();g.moveTo(x,-15);g.lineTo(x-4,15);g.stroke()}
    }else{
      fillEllipse(-21,0,24,18,grad(-43,-16,-2,16,light,base,dark),dark,4);fillEllipse(5,0,19,16,grad(-8,-14,25,14,mix(base,'#fff',.25),base,dark),dark,4);
    }
    // thorax/head and signature anatomy
    if(type!=='centipede'){
      const hr=type==='spider'?13:type==='mantis'?12:15;fillEllipse(27,0,hr,hr*.9,grad(16,-12,39,12,hi,base,dark2),dark,3.5);
    }
    if(type==='bee'){g.strokeStyle='#332414';g.lineWidth=6;for(const x of [-21,-6,9]){g.beginPath();g.moveTo(x,-14);g.lineTo(x,14);g.stroke()}g.fillStyle='#e2b636';g.strokeStyle=dark;g.lineWidth=3;g.beginPath();g.moveTo(-48,0);g.lineTo(-61,-6);g.lineTo(-61,6);g.closePath();g.fill();g.stroke()}
    if(type==='mosquito'){g.strokeStyle='#442438';g.lineWidth=3;g.beginPath();g.moveTo(39,0);g.lineTo(64,0);g.stroke()}
    if(type==='dragonfly'){g.fillStyle=base;g.strokeStyle=dark;g.lineWidth=3;g.beginPath();g.roundRect(-49,-8,68,16,8);g.fill();g.stroke()}
    if(type==='stag'){g.strokeStyle=dark;g.lineWidth=5;for(const sy of [-1,1]){g.beginPath();g.moveTo(37,sy*5);g.lineTo(57,sy*18);g.lineTo(52,sy*2);g.lineTo(65,sy*9);g.stroke()}}
    if(type==='assassin'){g.strokeStyle=dark;g.lineWidth=4;g.beginPath();g.moveTo(40,0);g.lineTo(60,0);g.stroke()}
    // event costume details are part of the actual enemy sprite, not a recolor aura
    if(eventArt){
      g.save();
      if(eventArt==='grave-ant'){g.fillStyle='#ddd8cc';g.fillRect(-28,-4,44,7);g.fillRect(-18,-12,7,24)}
      else if(eventArt==='candle-moth'){g.fillStyle='#ffdf72';g.shadowColor='#ffb53d';g.shadowBlur=14;g.beginPath();g.moveTo(-28,-13);g.quadraticCurveTo(-18,-34,-9,-13);g.closePath();g.fill();g.shadowBlur=0}
      else if(eventArt==='bone-spider'){g.strokeStyle='#ece7dc';g.lineWidth=3;for(const sy of [-1,1]){g.beginPath();g.moveTo(-33,sy*8);g.lineTo(10,sy*8);g.stroke()}}
      else if(eventArt==='pumpkin-beetle'){g.fillStyle='#ffb13f';g.strokeStyle='#7d3717';g.lineWidth=3;g.beginPath();g.arc(-15,0,20,0,Math.PI*2);g.fill();g.stroke();g.strokeStyle='#8b471f';for(const x of [-23,-15,-7]){g.beginPath();g.moveTo(x,-17);g.lineTo(x,17);g.stroke()}}
      else if(eventArt==='witch-fly'){g.fillStyle='#5e346f';g.beginPath();g.moveTo(18,-17);g.lineTo(35,-42);g.lineTo(47,-15);g.closePath();g.fill();g.fillRect(15,-16,35,5)}
      else if(eventArt==='ghost-roach'){g.globalAlpha=.35;g.fillStyle='#d8fffa';g.beginPath();g.ellipse(-7,0,45,26,0,0,Math.PI*2);g.fill();g.globalAlpha=1}
      else if(eventArt==='lantern-wasp'){g.fillStyle='#ffb63f';g.shadowColor='#ff8c2f';g.shadowBlur=12;g.beginPath();g.arc(-23,0,11,0,Math.PI*2);g.fill();g.shadowBlur=0}
      else if(eventArt==='hollow-scarab'){g.strokeStyle='#d2a9ff';g.lineWidth=4;g.beginPath();g.arc(-13,0,18,0,Math.PI*2);g.stroke();g.beginPath();g.moveTo(-13,-15);g.lineTo(-13,15);g.stroke()}
      else if(eventArt==='hay-mite'){g.strokeStyle='#e7c16a';g.lineWidth=2;for(let i=0;i<8;i++){const a=i*Math.PI/4;g.beginPath();g.moveTo(-17,0);g.lineTo(-17+Math.cos(a)*27,Math.sin(a)*27);g.stroke()}}
      else if(eventArt==='corn-borer'){g.fillStyle='#efcf58';for(let x=-33;x<15;x+=10){g.beginPath();g.arc(x,0,4,0,Math.PI*2);g.fill()}}
      else if(eventArt==='orchard-beetle'){g.fillStyle='#cf493a';for(const q of [[-28,-8],[-10,9],[2,-10]]){g.beginPath();g.arc(q[0],q[1],3,0,Math.PI*2);g.fill()}}
      else if(eventArt==='cider-wasp'){g.fillStyle='#f5c268';g.beginPath();g.arc(-22,0,8,0,Math.PI*2);g.fill()}
      else if(eventArt==='scarecrow-hopper'){g.strokeStyle='#d8bd70';g.lineWidth=4;g.beginPath();g.moveTo(-37,-18);g.lineTo(26,17);g.moveTo(-37,18);g.lineTo(26,-17);g.stroke()}
      else if(eventArt==='amber-centipede'){g.fillStyle='rgba(255,190,70,.28)';g.beginPath();g.ellipse(-4,0,56,20,0,0,Math.PI*2);g.fill()}
      g.restore();
    }
    if(type!=='centipede'){eye(34,-5,type==='spider'?3.2:3);eye(34,5,type==='spider'?3.2:3);g.strokeStyle=dark;g.lineWidth=2.5;g.beginPath();g.moveTo(34,-10);g.lineTo(50,-22);g.moveTo(34,10);g.lineTo(50,22);g.stroke()}
    if(nightmare){g.strokeStyle='#7e94ff';g.lineWidth=2;g.shadowColor='#6179ff';g.shadowBlur=8;g.beginPath();g.moveTo(-36,-12);g.lineTo(-20,0);g.lineTo(-36,12);g.stroke();g.beginPath();g.moveTo(-12,-17);g.lineTo(-2,-30);g.lineTo(7,-17);g.stroke();g.shadowBlur=0}
    spriteCache.set(key,c);return c;
  }
  function drawInsect(type,x,y,a,s,color,enemy=false,flash=false,nightmare=false,eventArt=''){
    const spr=bugSprite(type,color,nightmare,eventArt);ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.scale(s,s);ctx.globalAlpha=flash?.58:1;const sz=52;ctx.drawImage(spr,-sz,-sz,sz*2,sz*2);ctx.restore();
  }
  function drawEnemy(e){
    ctx.save();if(e.spawn>0)ctx.globalAlpha=clamp(1-e.spawn*2,0,1);drawEnemyShape(e);
    if(e.hp<e.maxHp||e.boss||e.miniBoss){const w=e.boss?130:e.miniBoss?92:Math.max(34,e.r*2.3),h=e.boss?9:e.miniBoss?7:4;ctx.fillStyle='rgba(0,0,0,.68)';ctx.fillRect(e.x-w/2,e.y-e.r-19,w,h);ctx.fillStyle=e.boss?(e.haunted?'#c493ff':'#e55a4d'):e.miniBoss?'#e8b95e':'#d88962';ctx.fillRect(e.x-w/2,e.y-e.r-19,w*clamp(e.hp/e.maxHp,0,1),h)}if(e.mark>0){ctx.strokeStyle='#ffd76a';ctx.lineWidth=2;ctx.beginPath();ctx.arc(e.x,e.y,e.r+9,0,6.28);ctx.stroke()}ctx.restore()
  }
  function drawEnemyShape(e){
    const id=e.spec.id||e.spec.ai,s=e.boss?e.r/50:e.miniBoss?e.r/40:e.r/18;
    if(e.boss){drawBoss(e);return}if(e.miniBoss){drawMiniBoss(e);return}
    const typeMap={
      'garden-ant':'ant','fire-ant':'ant','flea':'flea','spider-mite':'spider','earwig':'earwig','rove-beetle':'beetle','centipede':'centipede','wasp':'bee','robber-fly':'fly','wolf-spider':'spider','assassin-bug':'assassin','bombardier':'beetle','hornet':'bee','mantis-nymph':'mantis','water-bug':'beetle','scorpion':'scorpion','stag-beetle':'stag','hunter-dragonfly':'dragonfly','dobsonfly':'dobson','mole-cricket':'cricket',
      'grave-ant':'ant','candle-moth':'moth','bone-spider':'spider','pumpkin-beetle':'beetle','witch-fly':'fly','ghost-roach':'roach','lantern-wasp':'bee','hollow-scarab':'beetle',
      'hay-mite':'spider','corn-borer':'centipede','orchard-beetle':'beetle','cider-wasp':'bee','scarecrow-hopper':'hopper','amber-centipede':'centipede'
    };
    const type=typeMap[id]||'ant',eventArt=e.spec.art||'';
    drawInsect(type,e.x,e.y,e.angle,s,e.spec.color,true,false,e.hard,eventArt);drawVariantMarks(e)
  }
  function drawVariantMarks(e){
    if(e.haunted){ctx.save();ctx.translate(e.x,e.y);ctx.globalAlpha=.65;ctx.strokeStyle='#b99cff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,e.r+5+Math.sin(t*4+e.phase)*2,0,6.28);ctx.stroke();ctx.restore()}
    if(e.autumn){ctx.save();ctx.translate(e.x,e.y-e.r*.6);ctx.rotate(e.phase*.5);ctx.fillStyle='#e3903e';ctx.beginPath();ctx.ellipse(0,0,5,2.5,0,0,6.28);ctx.fill();ctx.restore()}
  }
  function drawMiniBoss(e){
    const n=Number(e.spec.id.replace('boss',''))||1;
    const types=['earwig','mantis','spider','bee','centipede'],type=types[n-1]||'beetle';
    drawInsect(type,e.x,e.y,e.angle,(e.r/18)*1.03,e.spec.color,true,false,e.hard,'');
    ctx.save();ctx.translate(e.x,e.y);ctx.rotate(e.angle);const rr=e.r+10;
    ctx.strokeStyle=e.hard?'rgba(125,150,255,.82)':'rgba(255,213,118,.78)';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,rr,-1.05,1.05);ctx.stroke();
    ctx.fillStyle=e.hard?'#aebaff':'#f6d477';for(let i=0;i<n;i++){const a=-.7+i*(1.4/Math.max(1,n-1));ctx.beginPath();ctx.moveTo(Math.cos(a)*rr,Math.sin(a)*rr);ctx.lineTo(Math.cos(a)*(rr+10),Math.sin(a)*(rr+10));ctx.lineTo(Math.cos(a+.09)*rr,Math.sin(a+.09)*rr);ctx.closePath();ctx.fill()}
    ctx.restore()
  }
  function drawBoss(e){
    const id=e.spec.ai;
    const typeMap={mantis:'mantis',widow:'spider',waspqueen:'bee',centiking:'centipede',rhino:'stag',assassinboss:'assassin',hornetboss:'bee',scorpionboss:'scorpion',watertitan:'beetle',overlord:'mantis',pumpkinwidow:'spider',gravemantis:'mantis',hollowqueen:'ghost-moth',harveststag:'stag'};
    const type=typeMap[id]||'beetle';
    const eventArt=id==='pumpkinwidow'?'pumpkin-beetle':id==='hollowqueen'?'candle-moth':id==='harveststag'?'orchard-beetle':'';
    drawInsect(type,e.x,e.y,e.angle,(e.r/18)*.72,e.spec.color,true,false,e.hard,eventArt);
    ctx.save();ctx.translate(e.x,e.y);ctx.rotate(e.angle);
    const r=e.r,accent=e.haunted?'#cf9dff':e.hard?'#91a5ff':id==='harveststag'?'#f2b95e':'#ffd17a';
    // boss-only crown / armored silhouette
    ctx.strokeStyle=accent;ctx.lineWidth=3;ctx.globalAlpha=.86;ctx.beginPath();ctx.arc(0,0,r+9,-1.15,1.15);ctx.stroke();ctx.globalAlpha=1;
    ctx.fillStyle=accent;for(const a of [-.78,-.26,.26,.78]){ctx.beginPath();ctx.moveTo(Math.cos(a)*(r+3),Math.sin(a)*(r+3));ctx.lineTo(Math.cos(a)*(r+16),Math.sin(a)*(r+16));ctx.lineTo(Math.cos(a+.08)*(r+4),Math.sin(a+.08)*(r+4));ctx.closePath();ctx.fill()}
    ctx.fillStyle='rgba(255,255,255,.18)';for(const x of [-22,-5,12]){ctx.beginPath();ctx.ellipse(x,-r*.42,11,3,-.15,0,Math.PI*2);ctx.fill()}
    if(id==='gravemantis'){ctx.strokeStyle='#d8d5cb';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-25,-r*.5);ctx.lineTo(20,r*.45);ctx.moveTo(-10,r*.52);ctx.lineTo(30,-r*.45);ctx.stroke()}
    if(id==='hollowqueen'){ctx.strokeStyle='#eee4ff';ctx.lineWidth=2;ctx.globalAlpha=.62;for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(-10,0,r+18+i*7,0,Math.PI*2);ctx.stroke()}ctx.globalAlpha=1}
    if(id==='pumpkinwidow'){ctx.fillStyle='#ffbe4b';ctx.beginPath();ctx.arc(-r*.32,0,7,0,Math.PI*2);ctx.fill();ctx.fillStyle='#3d2114';ctx.beginPath();ctx.moveTo(-r*.39,-3);ctx.lineTo(-r*.25,0);ctx.lineTo(-r*.39,3);ctx.closePath();ctx.fill()}
    if(id==='harveststag'){ctx.strokeStyle='#f0c26d';ctx.lineWidth=6;for(const sy of [-1,1]){ctx.beginPath();ctx.moveTo(r*.45,sy*9);ctx.lineTo(r*.72,sy*30);ctx.lineTo(r*.64,sy*6);ctx.lineTo(r*.82,sy*17);ctx.stroke()}}
    ctx.restore()
  }
  function drawCloud(c){ctx.save();ctx.globalAlpha=clamp(c.life/2,0,.5);ctx.fillStyle=c.type==='toxic'?'#88a65b':c.type==='light'?'#ffe878':c.type==='ghost'?'#c8a9ff':c.type==='harvest'?'#e8a84f':'#6fc8ab';for(let i=0;i<10;i++){const a=i*2.399+t*.2;ctx.beginPath();ctx.arc(c.x+Math.cos(a)*c.r*.45,c.y+Math.sin(a)*c.r*.45,c.r*.34,0,6.28);ctx.fill()}ctx.restore()}
  function drawProjectile(p){ctx.save();if(!UI.settings.perf){ctx.shadowColor=p.color;ctx.shadowBlur=p.spectral?8:4}ctx.fillStyle=p.color;ctx.beginPath();if(p.spectral){ctx.moveTo(p.x,p.y-p.r);ctx.quadraticCurveTo(p.x+p.r,p.y,p.x,p.y+p.r);ctx.quadraticCurveTo(p.x-p.r,p.y,p.x,p.y-p.r)}else ctx.arc(p.x,p.y,p.r,0,6.28);ctx.fill();ctx.restore()}
  function drawParticle(p){ctx.globalAlpha=clamp(p.life*2,0,1);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,6.28);ctx.fill();ctx.globalAlpha=1}
  function drawPickup(p){ctx.save();ctx.translate(p.x,p.y);ctx.rotate(t*3);ctx.fillStyle=p.type==='candy'?'#ef9844':'#93e4df';ctx.shadowColor=p.type==='candy'?'#ffb767':'#8ce5e0';ctx.shadowBlur=UI.settings.perf?0:5;if(p.type==='candy'){ctx.beginPath();ctx.moveTo(-9,-3);ctx.lineTo(-4,-8);ctx.lineTo(4,-5);ctx.lineTo(9,-9);ctx.lineTo(8,0);ctx.lineTo(3,7);ctx.lineTo(-6,6);ctx.closePath();ctx.fill()}else{ctx.beginPath();ctx.moveTo(0,-8);ctx.lineTo(7,0);ctx.lineTo(0,8);ctx.lineTo(-7,0);ctx.closePath();ctx.fill()}ctx.restore()}
  function drawText(d){ctx.globalAlpha=clamp(d.life*1.4,0,1);ctx.fillStyle=d.color;ctx.font='800 12px system-ui';ctx.textAlign='center';ctx.strokeStyle='rgba(0,0,0,.72)';ctx.lineWidth=3;ctx.strokeText(d.text,d.x,d.y);ctx.fillText(d.text,d.x,d.y);ctx.globalAlpha=1}
  function mix(hex1,hex2,tv){const color=s=>{if(s.startsWith('rgb')){const n=s.match(/\d+/g)?.map(Number)||[0,0,0];return(n[0]<<16)|(n[1]<<8)|n[2]}return parseInt(s.replace('#','').padEnd(6,'0').slice(0,6),16)};const a=color(hex1),b=color(hex2),ar=a>>16,ag=a>>8&255,ab=a&255,br=b>>16,bg=b>>8&255,bb=b&255;return `rgb(${Math.round(lerp(ar,br,tv))},${Math.round(lerp(ag,bg,tv))},${Math.round(lerp(ab,bb,tv))})`}
  function roundRect(x,y,w,h,r,fill,stroke=false){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill)ctx.fill();if(stroke)ctx.stroke()}

  function loop(now){if(!running){drawIdle();return}const dt=Math.min(.033,(now-last)/1000||.016);last=now;update(dt);draw();if(running)requestAnimationFrame(loop)}
  function drawIdle(){mode=UI.selectedMode||'normal';hard=mode==='hard';biome=getBiome(1);if(!nest)nest={x:CX,y:CY,r:56,maxHp:1,hp:1,shield:0};generateDecor(1);drawCachedWorld();if(mode==='autumn')drawAutumnSet();drawNest(nest);drawAmbient();ctx.save();ctx.globalAlpha=.96;drawInsect('firefly',470,405,-.18,1.5,'#f4c94a');drawInsect('spider',745,295,2.7,1.3,'#6f4f75',false,false,hard);drawInsect('ghost-moth',850,470,-2.5,1.25,'#c9b8ff');ctx.restore()}

  window.addEventListener('keydown',e=>{keys[e.code]=true;if(!running)return;if(e.code==='Space'){e.preventDefault();bite()}else if(e.code==='ShiftLeft'||e.code==='ShiftRight')dash();else if(e.code==='KeyE')special();else if(e.code==='KeyR')repair();else if(e.code==='Escape')togglePause()});window.addEventListener('keyup',e=>keys[e.code]=false);
  $('playBtn').addEventListener('click',()=>UI.playSide==='enemy'?window.ENEMY_MODE?.start?.(UI.selectedMode):startRun());$('againBtn').addEventListener('click',()=>UI.playSide==='enemy'?window.ENEMY_MODE?.start?.(mode):startRun(mode));$('victoryAgainBtn').addEventListener('click',()=>UI.playSide==='enemy'?window.ENEMY_MODE?.start?.(mode):startRun(mode));$('menuBtn').addEventListener('click',()=>{UI.show('menu');drawIdle()});$('victoryMenuBtn').addEventListener('click',()=>{UI.show('menu');drawIdle()});
  $('pauseBtn').addEventListener('click',togglePause);$('resumeBtn').addEventListener('click',togglePause);$('quitBtn').addEventListener('click',quitRun);$('biteBtn').addEventListener('pointerdown',bite);$('dashBtn').addEventListener('pointerdown',dash);$('specialBtn').addEventListener('pointerdown',special);$('repairBtn').addEventListener('pointerdown',repair);
  function togglePause(){if(!running||choiceOpen)return;paused=!paused;if(paused)UI.show('pause');else{hideScreens();last=performance.now()}}
  function openRoundShop(){if(!running)return;paused=true;UI.renderShop();UI.show('shop')}
  const stick=$('stickBase'),knob=$('stickKnob');let stickId=null,stickRect=null;
  function stickMove(e){if(stickId!==e.pointerId)return;const x=e.clientX-(stickRect.left+stickRect.width/2),y=e.clientY-(stickRect.top+stickRect.height/2),n=norm(x,y),m=Math.min(1,Math.hypot(x,y)/(stickRect.width*.42));joy.x=n.x*m;joy.y=n.y*m;knob.style.transform=`translate(${joy.x*34}px,${joy.y*34}px)`}
  stick.addEventListener('pointerdown',e=>{stickId=e.pointerId;stick.setPointerCapture(e.pointerId);stickRect=stick.getBoundingClientRect();stickMove(e)});stick.addEventListener('pointermove',stickMove);const stickEnd=e=>{if(stickId!==e.pointerId)return;stickId=null;joy.x=joy.y=0;knob.style.transform=''};stick.addEventListener('pointerup',stickEnd);stick.addEventListener('pointercancel',stickEnd);
  window.addEventListener('resize',drawIdle);generateDecor(1);drawIdle();
  window.BUGBREAK_ART={canvas,ctx,drawInsect,drawEnemyShape,drawNest,drawCloud,drawProjectile,drawParticle,drawText,drawVariantMarks,particlesBurst,addText,roundRect,
    setScene(m='normal',w=1,n=null){mode=m;hard=m==='hard';biome=getBiome(w);if(n)nest=n;generateDecor(w);worldDirty=true},
    drawBackdrop(n=null){if(n)nest=n;drawCachedWorld();if(mode==='autumn')drawAutumnSet();if(n)drawNest(n);drawAmbient()},
    drawEnemy,drawBoss,drawMiniBoss,getBiomeFor(m,w){const old=mode;mode=m;const b=getBiome(w);mode=old;return b},typeForEnemy(id){const map={'garden-ant':'ant','fire-ant':'ant','flea':'flea','spider-mite':'spider','earwig':'earwig','rove-beetle':'beetle','centipede':'centipede','wasp':'bee','robber-fly':'fly','wolf-spider':'spider','assassin-bug':'assassin','bombardier':'beetle','hornet':'bee','mantis-nymph':'mantis','water-bug':'beetle','scorpion':'scorpion','stag-beetle':'stag','hunter-dragonfly':'dragonfly','dobsonfly':'dobson','mole-cricket':'cricket','grave-ant':'ant','candle-moth':'moth','bone-spider':'spider','pumpkin-beetle':'beetle','witch-fly':'fly','ghost-roach':'roach','lantern-wasp':'bee','hollow-scarab':'beetle','hay-mite':'spider','corn-borer':'centipede','orchard-beetle':'beetle','cider-wasp':'bee','scarecrow-hopper':'hopper','amber-centipede':'centipede'};return map[id]||'ant'}};

  window.BUGBREAK_GAME={
    startRun,isRunning:()=>running,openRoundShop,togglePause,
    debug:{
      startMode:m=>{if(running)quitRun();UI.save={...UI.save,selectedMode:m};UI.syncMenu();startRun(m)},
      spawnWave:()=>{if(running){enemies=[];nextWave=.01}},
      setWave:n=>{wave=clamp(+n||1,0,maxWave-1);enemies=[];nextWave=.01},
      boss:n=>{if(!running)startRun();if(mode==='halloween'){const b=D.halloweenBosses[clamp((+n||1)-1,0,2)];wave=b.wave-1}else if(mode==='autumn'){wave=24}else wave=clamp((+n||1)*5-1,0,49);enemies=[];nextWave=.01},
      mini:n=>{if(!running)startRun();spawnMiniBoss(D.miniBosses[clamp((+n||1)-1,0,4)])},
      mutation:id=>{if(!running)startRun();const m=D.mutations.find(x=>x.id===id)||D.mutations[0],before=player.stats.nestBoost||1;m.apply(player.stats);player.mutations.push(m.id);const after=player.stats.nestBoost||1;if(after>before){const q=after/before;nest.maxHp*=q;nest.hp*=q}updateHUD();return m.name},
      relic:id=>{if(!running)startRun();const r=D.relics.find(x=>x.id===id)||D.relics[0],before=player.stats.nestBoost||1;r.apply(player.stats);player.relics.push(r.id);const after=player.stats.nestBoost||1;if(after>before){const q=after/before;nest.maxHp*=q;nest.hp*=q}updateHUD();return r.name},
      win:()=>endRun(true),
      getState:()=>({mode,wave,maxWave,enemies:enemies.length,enemySample:enemies[0]?{name:enemies[0].spec.name,hp:enemies[0].maxHp,damage:enemies[0].damage,hard:!!enemies[0].hard,miniBoss:!!enemies[0].miniBoss,boss:!!enemies[0].boss}:null,miniBosses:enemies.filter(e=>e.miniBoss).map(e=>e.spec.id),bosses:enemies.filter(e=>e.boss).map(e=>e.spec.id),level,xp,player,nest,candyRun,gemsRun})
    }
  };
})();
