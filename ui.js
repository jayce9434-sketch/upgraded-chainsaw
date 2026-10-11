(() => {
  const D=window.BUGBREAK_DATA;
  const SAVE_KEY='bugbreak-update1-save';
  const $=id=>document.getElementById(id);
  const now=()=>Date.now();
  const between=(a,b)=>now()>=Date.parse(a)&&now()<Date.parse(b);
  const seasonActive=id=>id==='halloween'?between(D.eventDates.halloweenStart,D.eventDates.halloweenEnd):id==='autumn'?between(D.eventDates.autumnStart,D.eventDates.autumnEnd):true;
  const defaultSave=()=>({
    version:9,gems:220,totalGems:220,candy:0,bestWave:0,bestHard:0,wins:0,hardWins:0,halloweenWins:0,autumnWins:0,
    selectedBug:'ant',selectedMode:'normal',playSide:'defender',unlocks:{halloweenWin:false,autumnWin:false},
    enemyXP:0,enemyLevel:1,enemyOwned:{'garden-ant':true,'grave-ant':true,'hay-mite':true},enemySelected:{normal:'garden-ant',hard:'garden-ant',halloween:'grave-ant',autumn:'hay-mite'},
    upgrades:Object.fromEntries(D.upgrades.map(u=>[u.id,0])),
    halloweenUpgrades:Object.fromEntries(D.halloweenUpgrades.map(u=>[u.id,0])),
    settings:{master:100,music:100,sfx:100,normalMusic:true,shake:true,perf:(('ontouchstart' in window)||navigator.maxTouchPoints>0)},dailyDay:'',dailyStreak:0,halloweenExpiredCleaned:false
  });
  function load(){
    try{
      const raw=JSON.parse(localStorage.getItem(SAVE_KEY)||'null');
      const d=defaultSave();
      if(!raw)return d;
      if((raw.version||0)<9&&!localStorage.getItem('bugbreak-update1-save-backup-pre-1-2')){try{localStorage.setItem('bugbreak-update1-save-backup-pre-1-2',JSON.stringify(raw))}catch{}}
      const s={...d,...raw,unlocks:{...d.unlocks,...(raw.unlocks||{})},upgrades:{...d.upgrades,...(raw.upgrades||{})},halloweenUpgrades:{...d.halloweenUpgrades,...(raw.halloweenUpgrades||{})},settings:{...d.settings,...(raw.settings||{})},enemyOwned:{...d.enemyOwned,...(raw.enemyOwned||{})},enemySelected:{...d.enemySelected,...(raw.enemySelected||{})}};s.version=9;
      if((('ontouchstart' in window)||navigator.maxTouchPoints>0)&&(raw.version||0)<8)s.settings.perf=true;
      if(!seasonActive('halloween')&&!s.halloweenExpiredCleaned){
        s.halloweenUpgrades=Object.fromEntries(D.halloweenUpgrades.map(u=>[u.id,0]));
        s.candy=0;s.halloweenExpiredCleaned=true;
      }
      return s;
    }catch{return defaultSave()}
  }
  let save=load();
  const persist=()=>{try{localStorage.setItem(SAVE_KEY,JSON.stringify(save))}catch{}};
  persist();
  const screens=[...document.querySelectorAll('.screen')];
  let toastTimer=0;
  function show(id){screens.forEach(s=>s.classList.toggle('active',s.id===id));}
  function toast(msg,ms=2200){const el=$('toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),ms)}
  function halloweenActive(){return seasonActive('halloween')}

  function cleanupExpiredSeason(){
    if(!halloweenActive()&&!save.halloweenExpiredCleaned){
      save.halloweenUpgrades=Object.fromEntries(D.halloweenUpgrades.map(u=>[u.id,0]));
      save.candy=0;save.halloweenExpiredCleaned=true;persist();
    }
  }
  function autumnActive(){return seasonActive('autumn')}
  function modeAvailable(mode){return !mode.seasonal||seasonActive(mode.seasonal)}
  function bugUnlocked(p){if(p.eventUnlock==='halloweenWin')return !!save.unlocks.halloweenWin;if(p.eventUnlock==='autumnWin')return !!save.unlocks.autumnWin;return true}
  function bugMini(p){return `<div class="mini-bug ${p.id}" style="--bug:${p.color}"><i class="wing w1"></i><i class="wing w2"></i><i class="leg l1"></i><i class="leg l2"></i><i class="leg l3"></i><i class="body"></i><i class="head"></i></div>`}
  function renderBugs(){
    const box=$('bugSelect');box.innerHTML='';
    for(const p of D.players){
      const ok=bugUnlocked(p),on=save.selectedBug===p.id;
      const b=document.createElement('button');b.type='button';b.className=`bug-card ${on?'selected':''} ${ok?'':'locked'} ${p.best?'best':''} ${p.eventBug?'event-bug':''}`;
      const label=p.eventBug&&!ok?(p.eventUnlock==='autumnWin'?'BEAT HARVEST':'BEAT HALLOWEEN'):p.newBug?'NEW':p.best?'APEX':'';
      b.innerHTML=`${label?`<span class="new-ribbon">${label}</span>`:''}${bugMini(p)}<b>${p.name}</b><small>${p.subtitle}</small>`;
      b.addEventListener('click',()=>{if(!ok)return toast(p.eventUnlock==='autumnWin'?'Beat Harvest Rush to unlock Harvest Cicada permanently.':'Beat Halloween Haunt Wave 20 to unlock Ghost Moth permanently.');save.selectedBug=p.id;persist();renderBugs();window.AudioSys.ui()});
      box.appendChild(b);
    }
    const p=D.players.find(x=>x.id===save.selectedBug&&bugUnlocked(x))||D.players[0];if(p.id!==save.selectedBug){save.selectedBug=p.id;persist()}
    $('bugDetail').innerHTML=`<div class="desc"><b>${p.name} · ${p.ability}</b><p>${p.desc}</p></div><div class="stat-pill"><small>HP</small><strong>${p.stats.hp}</strong></div><div class="stat-pill"><small>DAMAGE</small><strong>${p.stats.damage}</strong></div><div class="stat-pill"><small>SPEED</small><strong>${p.stats.speed}</strong></div><div class="stat-pill"><small>CRIT</small><strong>${Math.round(p.stats.crit*100)}%</strong></div>`;
    $('rosterCount').textContent=`${D.players.filter(bugUnlocked).length}/${D.players.length}`;
  }
  function enemyModeKey(mode=save.selectedMode){return mode==='hard'?'normal':mode}
  function enemyCatalog(mode=save.selectedMode){return D.enemyCatalog[enemyModeKey(mode)]||D.enemyCatalog.normal}
  function enemySpec(id){return [...D.enemies,...D.halloweenEnemies,...D.autumnEnemies,...D.miniBosses,...D.bosses,...D.halloweenBosses,...D.autumnBosses].find(x=>x.id===id)}
  function enemyXpNeed(level=save.enemyLevel){return 80+Math.max(0,level-1)*35}
  function addEnemyXp(n,quiet=false){n=Math.max(0,Math.round(n));save.enemyXP=(save.enemyXP||0)+n;let ups=0;while(save.enemyXP>=enemyXpNeed(save.enemyLevel)){save.enemyXP-=enemyXpNeed(save.enemyLevel);save.enemyLevel++;ups++}persist();if(ups)toast(`ENEMY LEVEL ${save.enemyLevel} unlocked.`);if(!quiet)syncMenu();return ups}
  function selectedEnemyEntry(mode=save.selectedMode){const cat=enemyCatalog(mode),key=enemyModeKey(mode),id=save.enemySelected[mode]||save.enemySelected[key]||cat[0]?.id;return cat.find(x=>x.id===id)||cat[0]}
  function enemyOwned(entry){return entry?.cost===0||!!save.enemyOwned[entry?.id]}
  function renderEnemyLoadout(){
    const box=$('enemySelect');if(!box)return;box.innerHTML='';const cat=enemyCatalog();const hard=save.selectedMode==='hard';let selected=selectedEnemyEntry();if(!enemyOwned(selected)){selected=cat.find(enemyOwned)||cat[0];save.enemySelected[save.selectedMode]=selected.id;persist()}
    for(const entry of cat){const spec=enemySpec(entry.id);if(!spec)continue;const owned=enemyOwned(entry),on=selected.id===entry.id;const b=document.createElement('button');b.type='button';b.className=`enemy-card ${on?'selected':''} ${owned?'':'locked'} ${hard?'hard':''} ${(save.selectedMode==='halloween'||save.selectedMode==='autumn')?'event':''}`;b.style.setProperty('--enemy',spec.color);b.innerHTML=`<span class="enemy-sigil"></span><b>${hard&&!entry.finalBoss?'RELIC '+spec.name.toUpperCase():spec.name}</b><small>${owned?'PERMANENTLY OWNED':entry.cost+' GEMS'} · Lv ${entry.level}</small><span class="${owned?'owned':'gate'}">${owned?'OWNED':'BUY'}</span><span class="gate">W${entry.wave}</span>`;b.addEventListener('click',()=>{if(!owned)return toast(`${spec.name} is not owned. Open Enemy Shop.`);if(save.enemyLevel<entry.level)return toast(`Enemy Level ${entry.level} required.`);save.enemySelected[save.selectedMode]=entry.id;persist();renderEnemyLoadout();window.AudioSys.ui()});box.appendChild(b)}
    const spec=enemySpec(selected.id);$('enemyLevelText').textContent=save.enemyLevel;$('enemyXpText').textContent=`${save.enemyXP} / ${enemyXpNeed()}`;$('enemyOwnedText').textContent=Object.values(save.enemyOwned||{}).filter(Boolean).length;$('enemyMetaLevel').textContent=save.enemyLevel;
    if(spec)$('enemyDetail').innerHTML=`<div class="desc"><b>${hard&&!selected.finalBoss?'RELIC '+spec.name.toUpperCase():spec.name}</b><p>${selected.finalBoss?'FINAL BOSS CLASS · ':selected.bossClass?'BOSS CLASS · ':''}Permanent ownership does not bypass progression. Requires Enemy Level ${selected.level} and Wave ${selected.wave} in ${save.selectedMode.toUpperCase()}.</p></div><div class="stat-pill"><small>HP</small><strong>${Math.round(spec.hp)}</strong></div><div class="stat-pill"><small>DAMAGE</small><strong>${Math.round(spec.damage)}</strong></div><div class="stat-pill"><small>SPEED</small><strong>${Math.round(spec.speed)}</strong></div>`
  }
  function renderEnemyShop(){const g=$('enemyShopGrid');if(!g)return;$('enemyShopGems').textContent=save.gems;$('enemyShopLevel').textContent=save.enemyLevel;$('enemyShopMode').textContent=save.selectedMode.toUpperCase();g.innerHTML='';for(const entry of enemyCatalog()){const spec=enemySpec(entry.id);if(!spec)continue;const owned=enemyOwned(entry),canLevel=save.enemyLevel>=entry.level,canBuy=owned||(canLevel&&save.gems>=entry.cost);const card=document.createElement('div');card.className=`enemy-shop-card ${owned?'owned':''} ${entry.finalBoss?'final':''} ${(save.selectedMode==='halloween'||save.selectedMode==='autumn')?'event':''}`;card.innerHTML=`<h4>${spec.name}</h4><p>${entry.finalBoss?'Final boss class. Only usable on the final wave.':entry.bossClass?'Boss-class enemy with a strict late-wave gate.':'Permanent Enemy Mode class.'}</p><div class="reqs"><span>LV ${entry.level}</span><span>WAVE ${entry.wave}+</span><span>${entry.cost?entry.cost+' GEMS':'FREE'}</span></div><button ${owned||!canBuy?'disabled':''}>${owned?'OWNED':!canLevel?`LV ${entry.level} REQUIRED`:`BUY · ${entry.cost} GEMS`}</button>`;card.querySelector('button').addEventListener('click',()=>{if(owned||!canBuy)return;save.gems-=entry.cost;save.enemyOwned[entry.id]=true;persist();renderEnemyShop();renderEnemyLoadout();syncMenu();window.AudioSys.sfx('gem',.45);toast(`${spec.name} permanently unlocked.`)});g.appendChild(card)}}
  function syncSide(){const enemy=save.playSide==='enemy';$('defenderSideBtn')?.classList.toggle('selected',!enemy);$('enemySideBtn')?.classList.toggle('selected',enemy);$('defenderLoadout')?.classList.toggle('hidden',enemy);$('enemyLoadout')?.classList.toggle('hidden',!enemy);$('shopBtn')?.classList.toggle('hidden',enemy);$('enemyShopBtn')?.classList.toggle('hidden',!enemy);if(enemy)renderEnemyLoadout();syncModeHero()}
  function renderModes(){
    const box=$('modeSelect');box.innerHTML='';
    for(const m of D.modes){
      const ok=modeAvailable(m),on=save.selectedMode===m.id;
      const b=document.createElement('button');b.type='button';b.className=`mode-card mode-${m.id} ${on?'selected':''} ${ok?'':'locked'}`;
      let meta=m.kicker;if(m.id==='halloween')meta=ok?'HALLOWEEN LIVE · 20 WAVES':'EVENT ENDED';if(m.id==='autumn')meta=ok?'AUTUMN LIVE · 25 WAVES':'EVENT ENDED';
      b.innerHTML=`<span class="mode-badge">${m.badge}</span><small>${meta}</small><b>${m.name}</b><p>${m.desc}</p>`;
      b.addEventListener('click',()=>{if(!ok)return toast(`${m.name} is not currently active.`);save.selectedMode=m.id;persist();renderModes();syncModeHero();if(save.playSide==='enemy')renderEnemyLoadout();window.AudioSys.ui()});box.appendChild(b);
    }
    if(!modeAvailable(D.modes.find(m=>m.id===save.selectedMode))){save.selectedMode='normal';persist();renderModes()}
  }
  function syncModeHero(){
    const m=D.modes.find(x=>x.id===save.selectedMode)||D.modes[0],enemy=save.playSide==='enemy';$('playBtn').textContent=enemy?(m.id==='normal'?'INVADE COLONY':m.id==='hard'?'ENTER RELIC NIGHTFALL':m.id==='halloween'?'HAUNT THE COLONY':'RAID THE HARVEST'):(m.id==='normal'?'START EXPEDITION':m.id==='hard'?'ENTER NIGHTFALL':m.id==='halloween'?'ENTER THE HAUNT':'START HARVEST RUSH');
    $('modeSummary').textContent=enemy?`Enemy Mode · ${m.desc} Smart colony bots defend the nest while your permanent enemy roster obeys XP and wave gates.`:m.desc;$('modeWave').textContent=`${m.waves} WAVES`;
  }
  function upCost(u,rank){return Math.round(u.base*(1+rank*.53+rank*rank*.035))}
  function candyCost(u,rank){return Math.round(u.base*(1+rank*.7))}
  function renderShop(){
    cleanupExpiredSeason();
    $('shopGems').textContent=save.gems;$('shopCandy').textContent=save.candy;
    const g=$('upgradeGrid');g.innerHTML='';
    for(const u of D.upgrades){const r=save.upgrades[u.id]||0,c=upCost(u,r),max=r>=u.max;const card=document.createElement('div');card.className=`upgrade ${u.newUpgrade?'new-upgrade':''}`;card.innerHTML=`<div class="up-top"><span class="up-icon">${u.icon}</span><span class="rank">LV ${r}/${u.max}</span></div><h4>${u.name}${u.newUpgrade?' · NEW':''}</h4><p>${u.desc}</p><button ${max||save.gems<c?'disabled':''}>${max?'MAXED':`${c} GEMS`}</button>`;card.querySelector('button').addEventListener('click',()=>{if(max||save.gems<c)return;save.gems-=c;save.upgrades[u.id]=r+1;persist();renderShop();syncMenu();window.AudioSys.sfx('gem',.35)});g.appendChild(card)}
    const seasonal=$('seasonalShop');const sg=$('halloweenUpgradeGrid');
    seasonal.classList.toggle('hidden',!halloweenActive());sg.innerHTML='';
    if(halloweenActive())for(const u of D.halloweenUpgrades){const r=save.halloweenUpgrades[u.id]||0,c=candyCost(u,r),max=r>=u.max;const card=document.createElement('div');card.className='upgrade seasonal-upgrade';card.innerHTML=`<div class="up-top"><span class="up-icon">${u.icon}</span><span class="rank">LV ${r}/${u.max}</span></div><h4>${u.name}</h4><p>${u.desc}</p><button ${max||save.candy<c?'disabled':''}>${max?'MAXED':`${c} CANDY`}</button>`;card.querySelector('button').addEventListener('click',()=>{if(max||save.candy<c)return;save.candy-=c;save.halloweenUpgrades[u.id]=r+1;persist();renderShop();syncMenu();window.AudioSys.sfx('candy',.6)});sg.appendChild(card)}
  }
  function syncMenu(){
    cleanupExpiredSeason();
    $('bestWave').textContent=save.bestWave;$('bestHard').textContent=save.bestHard;$('menuGems').textContent=save.gems;$('menuCandy').textContent=save.candy;$('candyMeta').classList.toggle('hidden',!halloweenActive());renderBugs();renderModes();renderDaily();syncModeHero();
    $('halloweenLivePill').classList.toggle('hidden',!halloweenActive());$('autumnLivePill').classList.toggle('hidden',!autumnActive());$('enemyMetaLevel').textContent=save.enemyLevel;syncSide();
  }
  function dayKey(){const d=new Date();return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`}
  function renderDaily(){const today=dayKey(),claimed=save.dailyDay===today,box=$('dailyCard');box.innerHTML=`<span><b>DAILY FORAGE</b> · ${claimed?'collected today':'+35 gems and +1 streak'}</span><button ${claimed?'disabled':''}>${claimed?'CLAIMED':'CLAIM'}</button>`;box.querySelector('button').addEventListener('click',()=>{if(claimed)return;save.dailyDay=today;save.dailyStreak=(save.dailyStreak||0)+1;save.gems+=35;save.totalGems+=35;persist();syncMenu();window.AudioSys.sfx('gem');toast('Daily forage: +35 gems')})}
  function settingsUI(){
    const s=save.settings;for(const [id,out,key] of [['masterVol','masterOut','master'],['musicVol','musicOut','music'],['sfxVol','sfxOut','sfx']]){const el=$(id);el.value=s[key];$(out).textContent=s[key]+'%';el.oninput=()=>{$(out).textContent=el.value+'%';s[key]=+el.value;window.AudioSys.update(s);persist()}}
    $('normalMusicToggle').checked=s.normalMusic;$('shakeToggle').checked=s.shake;$('perfToggle').checked=s.perf;
    $('normalMusicToggle').onchange=e=>{s.normalMusic=e.target.checked;window.AudioSys.update(s);persist()};$('shakeToggle').onchange=e=>{s.shake=e.target.checked;persist()};$('perfToggle').onchange=e=>{s.perf=e.target.checked;persist()};window.AudioSys.update(s)
  }
  function addGems(n){n=Math.max(0,Math.round(n));save.gems+=n;save.totalGems+=n;persist();syncMenu()}
  function addCandy(n){if(!halloweenActive())return;save.candy+=Math.max(0,Math.round(n));persist();syncMenu()}
  function recordWave(w,mode){if(mode==='normal'&&w>save.bestWave)save.bestWave=w;if(mode==='hard'&&w>save.bestHard)save.bestHard=w;persist();syncMenu()}
  function win(mode){
    if(mode==='normal'){save.wins++;save.bestWave=50}
    if(mode==='hard'){save.hardWins++;save.bestHard=50}
    if(mode==='halloween'){save.halloweenWins++;save.unlocks.halloweenWin=true}
    if(mode==='autumn'){save.autumnWins++;save.unlocks.autumnWin=true}
    persist();syncMenu();
  }
  function reset(){save=defaultSave();persist();settingsUI();syncMenu();toast('Save reset. Starter gems restored.')}

  $('defenderSideBtn')?.addEventListener('click',()=>{save.playSide='defender';persist();syncSide();window.AudioSys.ui()});$('enemySideBtn')?.addEventListener('click',()=>{save.playSide='enemy';persist();syncSide();window.AudioSys.ui()});
  $('enemyShopBtn')?.addEventListener('click',()=>{renderEnemyShop();show('enemyShop');window.AudioSys.ui()});$('enemyShopClose')?.addEventListener('click',()=>show(window.BUGBREAK_GAME?.isRunning?.()?'pause':'menu'));
  $('shopBtn').addEventListener('click',()=>{renderShop();show('shop');window.AudioSys.ui()});document.querySelector('[data-close="shop"]').addEventListener('click',()=>show(window.BUGBREAK_GAME?.isRunning?.()?'pause':'menu'));
  $('settingsBtn').addEventListener('click',()=>{settingsUI();show('settings');window.AudioSys.ui()});$('settingsClose').addEventListener('click',()=>show(window.BUGBREAK_GAME?.isRunning?.()?'pause':'menu'));
  $('resetBtn').addEventListener('click',()=>{if(confirm('Reset BUGBREAK progress, event rewards and upgrades?'))reset()});$('pauseShopBtn').addEventListener('click',()=>{renderShop();show('shop')});$('pauseSettingsBtn').addEventListener('click',()=>{settingsUI();show('settings')});$('roundShopBtn').addEventListener('click',()=>window.BUGBREAK_GAME?.openRoundShop?.());
  settingsUI();syncMenu();
  window.UI={show,toast,renderShop,syncMenu,addGems,addCandy,recordWave,win,persist,halloweenActive,autumnActive,seasonActive,get save(){return save},set save(v){save=v;persist()},get selectedBug(){return save.selectedBug},get selectedMode(){return save.selectedMode},get settings(){return save.settings},get upgrades(){return save.upgrades},get halloweenUpgrades(){return save.halloweenUpgrades},get playSide(){return save.playSide},get enemyLevel(){return save.enemyLevel},get enemyXP(){return save.enemyXP},get selectedEnemy(){return selectedEnemyEntry()},enemyCatalog,enemySpec,enemyOwned,enemyXpNeed,addEnemyXp,renderEnemyLoadout,renderEnemyShop,upCost};
})();
