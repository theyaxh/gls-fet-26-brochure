/**
 * Hybrid Tri-Fold + Booklet Flipbook Viewer
 *
 * STATES:
 *  0: COVER       → page1+3 composite (single centered page)
 *  1: FLIP_COVER  → page1 flips left → [page2 L, page3 R]
 *  2: TRIFOLD     → page3 flips right → [page2 L, page4 C, page 25 R]
 *  3: COLLAPSE    → page 25 folds behind → [page5 L, page6 R]
 *  4-12: BOOK     → [7,8] [9,10] ... [23,24]
 *  13: BACK_COVER → last leaf flips → page 26 single centered
 *  Loop: entire book flips 180° back to cover
 */
(function () {
  'use strict';

  const ANIM = 900, ASPECT = 0.707;
  const S = { COVER:0, FLIP:1, TRI:2, COLLAPSE:3 };
  const BOOK_START = 4;
  const SPREADS = [[7,8],[9,10],[11,12],[13,14],[15,16],[17,18],[19,20],[21,22],[23,24]];
  const BACK = BOOK_START + SPREADS.length; // 13
  const TOTAL = 26;

  const $ = id => document.getElementById(id);
  const viewer=$('viewer'), bookC=$('book-container'), book=$('book');
  const flap=$('leaf-flap'), center=$('panel-center'), cover=$('leaf-cover'), triR=$('leaf-trifold-right');
  const navP=$('nav-prev'), navN=$('nav-next'), ctr=$('page-counter');
  const btnFS=$('btn-fullscreen'), btnZI=$('btn-zoom-in'), btnZO=$('btn-zoom-out');
  const icFE=$('icon-fs-enter'), icFX=$('icon-fs-exit');

  let state=S.COVER, anim=false, zoom=1, std=[], pW=400, pH=566, shadows=[];

  // Audio
  let ac=null;
  function ia(){if(!ac)try{ac=new(window.AudioContext||window.webkitAudioContext)}catch(e){}}
  function snd(){if(!ac)return;try{const n=ac.currentTime,d=.3,r=ac.sampleRate,l=r*d,b=ac.createBuffer(1,l,r),a=b.getChannelData(0);for(let i=0;i<l;i++){const t=i/l;a[i]=(Math.random()*2-1)*(t<.05?t/.05:Math.pow(1-(t-.05)/.95,4))*.22}const s=ac.createBufferSource();s.buffer=b;const f=ac.createBiquadFilter();f.type='bandpass';f.frequency.value=2200;f.Q.value=.8;const g=ac.createGain();g.gain.setValueAtTime(.3,n);g.gain.exponentialRampToValueAtTime(.001,n+d);s.connect(f);f.connect(g);g.connect(ac.destination);s.start(n);s.stop(n+d)}catch(e){}}

  // Size
  function sz(){const w=Math.min((innerHeight-120)*ASPECT,(innerWidth-120)/3);return{w:Math.max(Math.round(w),120),h:Math.max(Math.round(w/ASPECT),170)}}
  function ap(){const s=sz();pW=s.w;pH=s.h;book.style.height=pH+'px';[flap,center,cover,triR,...std].forEach(e=>{if(e){e.style.width=pW+'px';e.style.height=pH+'px'}})}

  // Build standard leaves: [6,7], [8,9], ..., [22,23], [24, 26]
  // 10 pairs. Last pair has page 26 as back face (back cover).
  function buildStd(){
    std.forEach(e=>e.remove()); std=[];
    // pairs: [6,7],[8,9],[10,11],[12,13],[14,15],[16,17],[18,19],[20,21],[22,23],[24, 26]
    const pairs=[];
    for(let i=6;i<=22;i+=2) pairs.push([i, i+1]);
    pairs.push([24, 26]); // back cover on the back of page 24

    pairs.forEach((p,idx)=>{
      const lf=document.createElement('div');
      lf.className='leaf standard-leaf';
      lf.style.width=pW+'px'; lf.style.height=pH+'px';
      lf.style.transformOrigin='left center';

      const fr=document.createElement('div'); fr.className='leaf-face leaf-front';
      const fi=document.createElement('img');
      fi.src='pages/page '+p[0]+'.png';
      fi.alt='Page '+p[0]; fi.draggable=false; if(idx>2)fi.loading='lazy';
      fr.appendChild(fi);

      const bk=document.createElement('div'); bk.className='leaf-face leaf-back';
      const bName = `page ${p[1]}.png`;
      const bi=document.createElement('img');
      bi.src='pages/'+bName; bi.alt='Page '+p[1]; bi.draggable=false;
      if(idx>2)bi.loading='lazy';
      bk.appendChild(bi);

      lf.appendChild(fr); lf.appendChild(bk);
      book.appendChild(lf); std.push(lf);
    });
  }

  // Shadows
  function clrS(){shadows.forEach(e=>e.remove());shadows=[]}
  function addS(x){const s=document.createElement('div');s.className='spine-shadow';s.style.left=(x-7)+'px';book.appendChild(s);shadows.push(s)}

  // Set leaf position helper
  function setL(el, left, origin, rot, z, op){
    el.style.left=left+'px';
    el.style.transformOrigin=origin;
    el.style.transform='rotateY('+rot+'deg)';
    el.style.zIndex=z;
    el.style.opacity=op;
    el.style.pointerEvents=op>0?'auto':'none';
  }

  // ═══════════════════════════════════
  // RENDER
  // ═══════════════════════════════════
  function render(){
    clrS();

    // Book width
    let bw;
    if(state===S.COVER||state===BACK) bw=pW;
    else if(state===S.TRI) bw=pW*3;
    else bw=pW*2;
    book.style.width=bw+'px';

    // -- FLAP (page1/page2) --
    // COVER: at [0,pW], rot=0, page1 front visible, z=110 (on top of cover)
    // FLIP: flipped from spine, page2 visible on LEFT
    //   left=pW, origin=left, rot=-180 → visual [0,pW], back(page2) visible
    // TRI: same as FLIP
    // COLLAPSE+: hidden
    if(state===S.COVER){
      setL(flap, 0, 'left center', 0, 110, 1);
    } else if(state===S.FLIP||state===S.TRI){
      setL(flap, pW, 'left center', -180, 15, 1);
    } else {
      setL(flap, pW, 'left center', -180, 2, 0);
    }

    // -- CENTER (page4, static) --
    // Only visible in TRIFOLD at center position [pW, 2*pW]
    setL(center, pW, 'left center', 0, state===S.TRI?10:1, state===S.TRI?1:0);

    // -- COVER (page3/page 25) --
    // COVER: at [0,pW], rot=0, page3 visible, z=100 (under flap)
    // FLIP: slides to right, at [pW,2*pW], rot=0, page3 on right
    // TRI: flips RIGHT from its right edge
    //   left=pW, origin=right(=pW local), rot=180
    //   Formula: visual = [pW + 2*pW - pW, pW + 2*pW] = [2*pW, 3*pW]
    //   Back(page 25) visible at [2*pW, 3*pW] — RIGHT panel ✓
    // COLLAPSE+: hidden
    if(state===S.COVER){
      setL(cover, 0, 'left center', 0, 100, 1);
    } else if(state===S.FLIP){
      setL(cover, pW, 'left center', 0, 80, 1);
    } else if(state===S.TRI){
      setL(cover, pW, 'right center', 180, 70, 1);
    } else {
      setL(cover, pW, 'right center', 180, 2, 0);
    }

    // -- TRIFOLD-RIGHT (page 25 front / page 5 back) --
    // TRI: at [2*pW, 3*pW], rot=0, page 25 on right
    //   But wait — leaf-cover already shows page 25 at [2*pW,3*pW] in TRI state.
    //   We can't have BOTH. The leaf-cover's back IS page 25. So leaf-trifold-right
    //   is only needed for its page 5 back face in COLLAPSE state.
    //   In TRI state: trifold-right hidden (cover's back shows page 25).
    //   In COLLAPSE: trifold-right appears as flipped leaf (page 5 on left).
    //     left=pW, origin=left, rot=-180 → visual [0,pW], back(page 5) on left ✓
    //   BOOK states: keep visible (page 5 stays on left behind stacked leaves)
    if(state<=S.TRI){
      setL(triR, pW, 'left center', 0, 1, 0);
    } else if(state===S.COLLAPSE){
      setL(triR, pW, 'left center', -180, 18, 1);
    } else {
      // Keep visible but behind everything (page 5 on left)
      setL(triR, pW, 'left center', -180, 3, state<BACK?1:0);
    }

    // -- STANDARD LEAVES --
    // 10 leaves: std[0]=[6,7], std[1]=[8,9], ..., std[8]=[22,23], std[9]=[24, 26]
    // Visible spread = back-of-last-flipped (left) + front-of-first-unflipped (right)
    // COLLAPSE(state 3): 0 flipped → triR=page 5 left, std[0]=page 6 right → [5,6]
    // State 4: 1 flipped → std[0].back=7 left, std[1].front=8 right → [7,8]
    // State 12: 9 flipped → std[8].back=23 left, std[9].front=24 right → [23,24]
    // State 13=BACK: 10 flipped → std[9].back=page 26 left → single page back cover

    let nf = 0;
    if(state >= S.COLLAPSE) nf = state - S.COLLAPSE;
    if(state >= BACK) nf = std.length;

    const stdVis = (state >= S.COLLAPSE);

    std.forEach((lf,i)=>{
      lf.style.transformOrigin='left center';
      lf.style.left = pW+'px';
      if(i < nf){
        lf.style.transform='rotateY(-180deg)';
        lf.style.zIndex = 20+i;
      } else {
        lf.style.transform='rotateY(0deg)';
        lf.style.zIndex = 20+(std.length-i);
      }
      // Visible in all book states (COLLAPSE through last book spread)
      // In BACK state: only show the last leaf (flipped, showing page 26)
      if(state===BACK){
        lf.style.opacity = (i===std.length-1) ? '1' : '0';
        if(i===std.length-1) lf.style.zIndex = 100;
      } else {
        lf.style.opacity = stdVis ? '1' : '0';
      }
      lf.style.pointerEvents = stdVis ? 'auto' : 'none';
    });

    // Shadows
    if(state===S.FLIP||state===S.COLLAPSE||(state>=BOOK_START&&state<BACK)) addS(pW);
    if(state===S.TRI){ addS(pW); addS(pW*2); }

    updateCtr(); updateNav(); preload();
  }

  function updateCtr(){
    let t='';
    if(state===S.COVER) t='Cover';
    else if(state===S.FLIP) t='Pages 2, 3';
    else if(state===S.TRI) t='Inside Spread';
    else if(state===S.COLLAPSE) t='5–6 / '+TOTAL;
    else if(state===BACK) t='Back Cover';
    else{const i=state-BOOK_START;if(i>=0&&i<SPREADS.length)t=SPREADS[i][0]+'–'+SPREADS[i][1]+' / '+TOTAL}
    ctr.textContent=t;
  }
  function updateNav(){navN.classList.add('show');navP.classList.toggle('show',state>S.COVER)}
  function preload(){
    const pre=[],n=state+1;
    if(n===S.FLIP)pre.push('page 2.png','page 3.png');
    else if(n===S.TRI)pre.push('page 4.png','page 25.png');
    else if(n===S.COLLAPSE)pre.push('page 5.png','page 6.png');
    else if(n>=BOOK_START&&n<BACK){const i=n-BOOK_START;if(i<SPREADS.length)pre.push(`page ${SPREADS[i][0]}.png`,`page ${SPREADS[i][1]}.png`)}
    else if(n===BACK)pre.push('page 26.png');
    pre.forEach(f=>{const i=new Image();i.src='pages/'+f});
  }

  // Active leaf for animation
  function activeLeaf(dir){
    if(dir==='next'){
      if(state===S.COVER) return flap;
      if(state===S.FLIP) return cover;
      if(state===S.TRI) return triR; // triR appears and flips behind
      const i=state-S.COLLAPSE;
      if(i>=0&&i<std.length) return std[i];
    } else {
      if(state===S.FLIP) return flap;
      if(state===S.TRI) return cover;
      if(state===S.COLLAPSE) return triR;
      const i=state-S.COLLAPSE-1;
      if(i>=0&&i<std.length) return std[i];
    }
    return null;
  }

  // State transitions
  function next(){
    if(anim)return;
    if(state>=BACK){loop();return}
    anim=true; ia(); snd();
    const lf=activeLeaf('next');
    if(lf){lf.classList.add('flipping');lf.style.zIndex=200}
    state++;
    render();
    setTimeout(()=>{if(lf)lf.classList.remove('flipping');render();anim=false},ANIM);
  }
  function prev(){
    if(anim||state<=S.COVER)return;
    anim=true; ia(); snd();
    const lf=activeLeaf('prev');
    if(lf){lf.classList.add('flipping');lf.style.zIndex=200}
    state--;
    render();
    setTimeout(()=>{if(lf)lf.classList.remove('flipping');render();anim=false},ANIM);
  }

  // Loop: flip entire book 180° horizontally
  function loop(){
    anim=true; ia(); snd();
    book.style.transition='transform '+ANIM+'ms cubic-bezier(.645,.045,.355,1)';
    book.style.transform='rotateY(180deg)';
    setTimeout(()=>{
      book.style.transition='none';
      book.style.transform='';
      state=S.COVER;
      render();
      anim=false;
    },ANIM);
  }

  // Interactions
  viewer.addEventListener('click',e=>{
    if(e.target.closest('.nav-arrow,.toolbar-btn'))return;
    ia();(e.clientX>viewer.getBoundingClientRect().left+viewer.getBoundingClientRect().width/2)?next():prev();
  });
  navP.addEventListener('click',e=>{e.stopPropagation();ia();prev()});
  navN.addEventListener('click',e=>{e.stopPropagation();ia();next()});
  document.addEventListener('keydown',e=>{
    if('ArrowRight ArrowDown  '.includes(e.key)){e.preventDefault();ia();next()}
    if('ArrowLeft ArrowUp'.includes(e.key)){e.preventDefault();ia();prev()}
    if(e.key==='f'||e.key==='F')togFS();
    if(e.key==='Escape'&&zoom>1)setZ(1);
  });
  let sx=0,st=0;
  document.addEventListener('touchstart',e=>{if(e.touches.length===1){sx=e.touches[0].clientX;st=Date.now()}},{passive:true});
  document.addEventListener('touchend',e=>{if(e.changedTouches.length===1&&!e.touches.length){const d=e.changedTouches[0].clientX-sx;if(Date.now()-st<400&&Math.abs(d)>50){ia();d<0?next():prev()}}},{passive:true});

  // Fullscreen
  function togFS(){
    if(!document.fullscreenElement&&!document.webkitFullscreenElement){
      if(viewer.requestFullscreen)viewer.requestFullscreen();else if(viewer.webkitRequestFullscreen)viewer.webkitRequestFullscreen();
    }else{if(document.exitFullscreen)document.exitFullscreen();else if(document.webkitExitFullscreen)document.webkitExitFullscreen()}
  }
  function updFS(){const f=!!document.fullscreenElement||!!document.webkitFullscreenElement;icFE.style.display=f?'none':'block';icFX.style.display=f?'block':'none'}
  btnFS.addEventListener('click',e=>{e.stopPropagation();togFS()});
  document.addEventListener('fullscreenchange',()=>{updFS();setTimeout(()=>{ap();render()},100)});
  document.addEventListener('webkitfullscreenchange',()=>{updFS();setTimeout(()=>{ap();render()},100)});

  // Zoom
  function setZ(l){zoom=Math.max(1,Math.min(3,l));bookC.style.transform=zoom>1?`scale(${zoom})`:'';bookC.classList.toggle('zoomed',zoom>1)}
  btnZI.addEventListener('click',e=>{e.stopPropagation();setZ(zoom+.5)});
  btnZO.addEventListener('click',e=>{e.stopPropagation();setZ(zoom-.5)});

  // Resize
  let rt;window.addEventListener('resize',()=>{clearTimeout(rt);rt=setTimeout(()=>{ap();render()},150)});

  // Init
  function init(){buildStd();ap();render();['page 3.png','page 1.png','page 2.png','page 4.png','page 25.png', 'page 5.png','page 6.png'].forEach(f=>{const i=new Image();i.src='pages/'+f})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();

})();
