/**
 * Hybrid Tri-Fold + Booklet Flipbook Viewer
 *
 * DESKTOP STATES:
 *  0: COVER       → page1+3 composite (single centered page)
 *  1: FLIP_COVER  → page1 flips left → [page2 L, page3 R]
 *  2: TRIFOLD     → page3 flips right → [page2 L, page4 C, page25 R]
 *  3: COLLAPSE    → page25 folds behind → [page5 L, page6 R]
 *  4-12: BOOK     → [7,8] [9,10] ... [23,24]
 *  13: BACK_COVER → last leaf flips → page26 single centered
 *  Loop: entire book flips 180° back to cover
 *
 * MOBILE STATES:
 *  Linearized single-page: 1,2,3,4,25,5,6,7,...,24,26 (26 pages)
 *  Each page shown individually at 90vw with bottom controls.
 */
(function () {
  'use strict';

  const ANIM = 700, ASPECT = 0.707;
  const S = { COVER:0, FLIP:1, TRI:2, COLLAPSE:3 };
  const BOOK_START = 4;
  const SPREADS = [[7,8],[9,10],[11,12],[13,14],[15,16],[17,18],[19,20],[21,22],[23,24]];
  const BACK = BOOK_START + SPREADS.length; // 13
  const TOTAL = 26;
  const MOBILE_BP = 768;

  // Mobile page order: 1,2,3,4,25,5,6,7,...,24,26
  const MOBILE_PAGES = [1,2,3,4,25,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,26];

  const $ = id => document.getElementById(id);
  const viewer=$('viewer'), bookC=$('book-container'), book=$('book');
  const flap=$('leaf-flap'), center=$('panel-center'), cover=$('leaf-cover'), triR=$('leaf-trifold-right');
  const navP=$('nav-prev'), navN=$('nav-next'), ctr=$('page-counter');
  const btnFS=$('btn-fullscreen'), btnZI=$('btn-zoom-in'), btnZO=$('btn-zoom-out');
  const icFE=$('icon-fs-enter'), icFX=$('icon-fs-exit');

  let state=S.COVER, anim=false, zoom=1, std=[], pW=400, pH=566, shadows=[];
  let mobile=false;
  let mobileIdx=0; // current index in MOBILE_PAGES
  let mobileLeafA=null, mobileLeafB=null; // two mobile leaves for flip animation

  // Audio
  let ac=null;
  function ia(){if(!ac)try{ac=new(window.AudioContext||window.webkitAudioContext)}catch(e){}}
  function snd(){if(!ac)return;try{const n=ac.currentTime,d=.3,r=ac.sampleRate,l=r*d,b=ac.createBuffer(1,l,r),a=b.getChannelData(0);for(let i=0;i<l;i++){const t=i/l;a[i]=(Math.random()*2-1)*(t<.05?t/.05:Math.pow(1-(t-.05)/.95,4))*.22}const s=ac.createBufferSource();s.buffer=b;const f=ac.createBiquadFilter();f.type='bandpass';f.frequency.value=2200;f.Q.value=.8;const g=ac.createGain();g.gain.setValueAtTime(.3,n);g.gain.exponentialRampToValueAtTime(.001,n+d);s.connect(f);f.connect(g);g.connect(ac.destination);s.start(n);s.stop(n+d)}catch(e){}}

  function pgSrc(n){ return 'pages/page '+n+'.png'; }

  // ═══════════════════════════════════
  // SIZING
  // ═══════════════════════════════════
  function checkMobile(){ return window.innerWidth <= MOBILE_BP; }

  function calcPageSize(){
    if(mobile){
      const maxW = Math.round(window.innerWidth * 0.9);
      const maxH = window.innerHeight - 100; // leave room for bottom controls
      let w = maxW;
      let h = Math.round(w / ASPECT);
      if(h > maxH){ h = maxH; w = Math.round(h * ASPECT); }
      return { w, h };
    }
    const pad=120;
    const w=Math.min((innerHeight-pad)*ASPECT,(innerWidth-pad)/3);
    return{w:Math.max(Math.round(w),120),h:Math.max(Math.round(w/ASPECT),170)};
  }

  function applySize(){
    const s=calcPageSize(); pW=s.w; pH=s.h;
    book.style.height=pH+'px';
    if(mobile){
      book.style.width=pW+'px';
      if(mobileLeafA){ mobileLeafA.style.width=pW+'px'; mobileLeafA.style.height=pH+'px'; }
      if(mobileLeafB){ mobileLeafB.style.width=pW+'px'; mobileLeafB.style.height=pH+'px'; }
    } else {
      [flap,center,cover,triR,...std].forEach(e=>{if(e){e.style.width=pW+'px';e.style.height=pH+'px'}});
    }
  }

  // ═══════════════════════════════════
  // MOBILE MODE — Page flip from left hinge
  // LeafA = current page on top (z:20), LeafB = next page beneath (z:10).
  // On next: LeafA flips -180° from left edge, swinging away, revealing LeafB.
  // ═══════════════════════════════════
  function buildMobileLeaves(){
    if(mobileLeafA) mobileLeafA.remove();
    if(mobileLeafB) mobileLeafB.remove();

    function makeMobileLeaf(){
      const lf = document.createElement('div');
      lf.className = 'leaf mobile-leaf';
      lf.style.width=pW+'px'; lf.style.height=pH+'px';
      lf.style.position='absolute'; lf.style.top='0'; lf.style.left='0';
      lf.style.transformOrigin='left center';
      const face = document.createElement('div');
      face.className='leaf-face leaf-front mobile-face';
      lf.appendChild(face);
      return lf;
    }

    mobileLeafA = makeMobileLeaf();
    mobileLeafB = makeMobileLeaf();
    book.appendChild(mobileLeafB); // below
    book.appendChild(mobileLeafA); // on top
  }

  function setMobileImg(leaf, pageNum){
    const face = leaf.querySelector('.mobile-face');
    face.innerHTML = '';
    if(pageNum == null) return;
    const img = document.createElement('img');
    img.src = pgSrc(pageNum); img.alt = 'Page '+pageNum; img.draggable = false;
    face.appendChild(img);
  }

  function renderMobile(){
    book.style.width = pW+'px';

    const curPage = MOBILE_PAGES[mobileIdx];
    const nextPage = mobileIdx < MOBILE_PAGES.length-1 ? MOBILE_PAGES[mobileIdx+1] : MOBILE_PAGES[0];

    // LeafA = current page, on top, flat
    setMobileImg(mobileLeafA, curPage);
    mobileLeafA.style.transition = 'none';
    mobileLeafA.style.transform = 'rotateY(0deg)';
    mobileLeafA.style.zIndex = 20;
    mobileLeafA.style.width=pW+'px'; mobileLeafA.style.height=pH+'px';

    // LeafB = next page, underneath, flat
    setMobileImg(mobileLeafB, nextPage);
    mobileLeafB.style.transition = 'none';
    mobileLeafB.style.transform = 'rotateY(0deg)';
    mobileLeafB.style.zIndex = 10;
    mobileLeafB.style.width=pW+'px'; mobileLeafB.style.height=pH+'px';

    // Hide desktop elements
    [flap,center,cover,triR,...std].forEach(e=>{if(e){e.style.opacity='0';e.style.pointerEvents='none'}});

    ctr.textContent = (mobileIdx+1) + ' / ' + MOBILE_PAGES.length;
    navN.classList.add('show');
    navP.classList.toggle('show', mobileIdx > 0);

    if(mobileIdx+2 < MOBILE_PAGES.length){ const i=new Image(); i.src=pgSrc(MOBILE_PAGES[mobileIdx+2]); }
  }

  function mobileNext(){
    if(anim) return;
    if(mobileIdx >= MOBILE_PAGES.length-1){ mobileLoop(); return; }
    anim=true; ia(); snd();

    // Force reflow so the starting state (0deg) is registered
    void mobileLeafA.offsetWidth;

    // LeafA (current) flips away from left hinge
    mobileLeafA.style.transition = 'transform '+ANIM+'ms cubic-bezier(.4,0,.15,1)';
    mobileLeafA.style.transform = 'rotateY(-180deg)';

    setTimeout(()=>{
      mobileLeafA.style.transition = 'none';
      mobileIdx++;
      renderMobile();
      anim=false;
    }, ANIM);
  }

  function mobilePrev(){
    if(anim || mobileIdx <= 0) return;
    anim=true; ia(); snd();

    // Prep: put previous page on LeafA, start it flipped away
    const prevPage = MOBILE_PAGES[mobileIdx-1];
    setMobileImg(mobileLeafA, prevPage);
    mobileLeafA.style.transition = 'none';
    mobileLeafA.style.transform = 'rotateY(-180deg)';
    mobileLeafA.style.zIndex = 20;

    // Current page goes to LeafB (stays flat underneath)
    // Already showing current page from renderMobile

    void mobileLeafA.offsetWidth; // force reflow

    // LeafA swings back from -180° to 0° (previous page lands on top)
    mobileLeafA.style.transition = 'transform '+ANIM+'ms cubic-bezier(.4,0,.15,1)';
    mobileLeafA.style.transform = 'rotateY(0deg)';

    setTimeout(()=>{
      mobileLeafA.style.transition = 'none';
      mobileIdx--;
      renderMobile();
      anim=false;
    }, ANIM);
  }

  function mobileLoop(){
    anim=true; ia(); snd();
    book.style.transition='transform '+ANIM+'ms cubic-bezier(.645,.045,.355,1)';
    book.style.transform='rotateY(180deg)';
    setTimeout(()=>{
      book.style.transition='none';
      book.style.transform='';
      mobileIdx=0;
      renderMobile();
      anim=false;
    },ANIM);
  }

  // ═══════════════════════════════════
  // DESKTOP — Build Standard Leaves
  // ═══════════════════════════════════
  function buildStd(){
    std.forEach(e=>e.remove()); std=[];
    const pairs=[];
    for(let i=6;i<=22;i+=2) pairs.push([i, i+1]);
    pairs.push([24, 26]);

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
      const bi=document.createElement('img');
      bi.src='pages/page '+p[1]+'.png'; bi.alt='Page '+p[1]; bi.draggable=false;
      if(idx>2)bi.loading='lazy';
      bk.appendChild(bi);

      lf.appendChild(fr); lf.appendChild(bk);
      book.appendChild(lf); std.push(lf);
    });
  }

  // Shadows
  function clrS(){shadows.forEach(e=>e.remove());shadows=[]}
  function addS(x){const s=document.createElement('div');s.className='spine-shadow';s.style.left=(x-7)+'px';book.appendChild(s);shadows.push(s)}

  function setL(el, left, origin, rot, z, op){
    el.style.left=left+'px';
    el.style.transformOrigin=origin;
    el.style.transform='rotateY('+rot+'deg)';
    el.style.zIndex=z;
    el.style.opacity=op;
    el.style.pointerEvents=op>0?'auto':'none';
  }

  // ═══════════════════════════════════
  // DESKTOP RENDER
  // ═══════════════════════════════════
  function render(){
    if(mobile){ renderMobile(); return; }
    clrS();

    // Hide mobile leaves
    if(mobileLeafA){ mobileLeafA.style.opacity='0'; mobileLeafA.style.pointerEvents='none'; }
    if(mobileLeafB){ mobileLeafB.style.opacity='0'; mobileLeafB.style.pointerEvents='none'; }

    let bw;
    if(state===S.COVER||state===BACK) bw=pW;
    else if(state===S.TRI) bw=pW*3;
    else bw=pW*2;
    book.style.width=bw+'px';

    // FLAP
    if(state===S.COVER) setL(flap, 0, 'left center', 0, 110, 1);
    else if(state===S.FLIP||state===S.TRI) setL(flap, pW, 'left center', -180, 15, 1);
    else setL(flap, pW, 'left center', -180, 2, 0);

    // CENTER
    setL(center, pW, 'left center', 0, state===S.TRI?10:1, state===S.TRI?1:0);

    // COVER
    if(state===S.COVER) setL(cover, 0, 'left center', 0, 100, 1);
    else if(state===S.FLIP) setL(cover, pW, 'left center', 0, 80, 1);
    else if(state===S.TRI) setL(cover, pW, 'right center', 180, 70, 1);
    else setL(cover, pW, 'right center', 180, 2, 0);

    // TRIFOLD-RIGHT
    if(state<=S.TRI) setL(triR, pW, 'left center', 0, 1, 0);
    else if(state===S.COLLAPSE) setL(triR, pW, 'left center', -180, 18, 1);
    else setL(triR, pW, 'left center', -180, 3, state<BACK?1:0);

    // STD LEAVES
    let nf=0;
    if(state>=S.COLLAPSE) nf=state-S.COLLAPSE;
    if(state>=BACK) nf=std.length;
    const stdVis=(state>=S.COLLAPSE);
    std.forEach((lf,i)=>{
      lf.style.transformOrigin='left center';
      lf.style.left=pW+'px';
      if(i<nf){lf.style.transform='rotateY(-180deg)';lf.style.zIndex=20+i}
      else{lf.style.transform='rotateY(0deg)';lf.style.zIndex=20+(std.length-i)}
      if(state===BACK){lf.style.opacity=(i===std.length-1)?'1':'0';if(i===std.length-1)lf.style.zIndex=100}
      else{lf.style.opacity=stdVis?'1':'0'}
      lf.style.pointerEvents=stdVis?'auto':'none';
    });

    // Shadows
    if(state===S.FLIP||state===S.COLLAPSE||(state>=BOOK_START&&state<BACK)) addS(pW);
    if(state===S.TRI){addS(pW);addS(pW*2)}

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

  // Desktop active leaf
  function activeLeaf(dir){
    if(dir==='next'){
      if(state===S.COVER) return flap;
      if(state===S.FLIP) return cover;
      if(state===S.TRI) return triR;
      const i=state-S.COLLAPSE;if(i>=0&&i<std.length) return std[i];
    } else {
      if(state===S.FLIP) return flap;
      if(state===S.TRI) return cover;
      if(state===S.COLLAPSE) return triR;
      const i=state-S.COLLAPSE-1;if(i>=0&&i<std.length) return std[i];
    }
    return null;
  }

  // ═══════════════════════════════════
  // UNIFIED NAVIGATION
  // ═══════════════════════════════════
  function next(){
    if(mobile){ mobileNext(); return; }
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
    if(mobile){ mobilePrev(); return; }
    if(anim||state<=S.COVER)return;
    anim=true; ia(); snd();
    const lf=activeLeaf('prev');
    if(lf){lf.classList.add('flipping');lf.style.zIndex=200}
    state--;
    render();
    setTimeout(()=>{if(lf)lf.classList.remove('flipping');render();anim=false},ANIM);
  }
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

  // ═══════════════════════════════════
  // INTERACTIONS
  // ═══════════════════════════════════
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
  document.addEventListener('fullscreenchange',()=>{updFS();setTimeout(()=>{applySize();render()},100)});
  document.addEventListener('webkitfullscreenchange',()=>{updFS();setTimeout(()=>{applySize();render()},100)});

  // Zoom
  function setZ(l){zoom=Math.max(1,Math.min(3,l));bookC.style.transform=zoom>1?`scale(${zoom})`:'';bookC.classList.toggle('zoomed',zoom>1)}
  btnZI.addEventListener('click',e=>{e.stopPropagation();setZ(zoom+.5)});
  btnZO.addEventListener('click',e=>{e.stopPropagation();setZ(zoom-.5)});

  // ═══════════════════════════════════
  // RESIZE — detect mobile/desktop switch
  // ═══════════════════════════════════
  let rt;
  window.addEventListener('resize',()=>{clearTimeout(rt);rt=setTimeout(()=>{
    const wasMobile = mobile;
    mobile = checkMobile();
    if(mobile && !wasMobile) enterMobile();
    if(!mobile && wasMobile) exitMobile();
    applySize(); render();
  },150)});

  function enterMobile(){
    viewer.classList.add('mobile-mode');
    // Map desktop state to mobile index
    mobileIdx = 0;
    buildMobileLeaves();
  }

  function exitMobile(){
    viewer.classList.remove('mobile-mode');
    if(mobileLeafA){ mobileLeafA.remove(); mobileLeafA=null; }
    if(mobileLeafB){ mobileLeafB.remove(); mobileLeafB=null; }
    state = S.COVER;
  }

  // ═══════════════════════════════════
  // INIT
  // ═══════════════════════════════════
  function init(){
    mobile = checkMobile();
    if(mobile){
      viewer.classList.add('mobile-mode');
      buildMobileLeaves();
    }
    buildStd();
    applySize();
    render();
    ['page 3.png','page 1.png','page 2.png','page 4.png','page 25.png','page 5.png','page 6.png']
      .forEach(f=>{const i=new Image();i.src='pages/'+f});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();

})();
