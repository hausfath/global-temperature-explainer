"use strict";
/* ============================================================================
   Global-temperature explainer — hand-rolled SVG charts, no dependencies.
   All data is computed in ../scripts/gen_data.py from raw GHCN-M v4.
   ========================================================================== */
const DATA = JSON.parse(document.getElementById('gtdata').textContent);
const YEARS = DATA.years;
const SVGNS = 'http://www.w3.org/2000/svg';
const reduceMotion = window.matchMedia('(prefers-reduced-motion:reduce)').matches;

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
function el(tag,attrs,parent){const e=document.createElementNS(SVGNS,tag);
  if(attrs)for(const k in attrs)e.setAttribute(k,attrs[k]); if(parent)parent.appendChild(e); return e;}
function css(v){return getComputedStyle(document.documentElement).getPropertyValue(v).trim();}
function fmt(x,d=2){return x==null||!isFinite(x)?'–':(x>=0&&d>0?'+':'')+x.toFixed(d);}
function niceTicks(min,max,n=5){
  const span=max-min||1; const step0=span/n; const mag=Math.pow(10,Math.floor(Math.log10(step0)));
  const norm=step0/mag; let step; step=norm<1.5?1:norm<3?2:norm<7?5:10; step*=mag;
  const t0=Math.ceil(min/step)*step; const out=[];
  for(let v=t0;v<=max+step*1e-6;v+=step)out.push(Math.abs(v)<step*1e-6?0:v);
  return out;
}

/* ----------------------------------------------------------------------------
   LineChart — linear x from a shared xs[], multi-series, hover, domain tween.
   -------------------------------------------------------------------------- */
class LineChart{
  constructor(node,opts){
    this.node=node; this.o=Object.assign({
      height:340,padL:46,padR:16,padT:14,padB:34,xTicks:null,yDomain:null,yTicks:5,
      formatX:x=>x, formatY:y=>y, tooltip:true, zeroLine:false, area:false,
      xTitle:null,yTitle:null,yPad:0.08, ttRows:null, clampY:null
    },opts);
    this.xs=this.o.xs;
    this.svg=el('svg',{},node); this.svg.style.width='100%';
    this.gGrid=el('g',null,this.svg); this.gArea=el('g',null,this.svg);
    this.gAxis=el('g',null,this.svg); this.gLines=el('g',null,this.svg);
    this.gHover=el('g',null,this.svg); this.gHover.style.pointerEvents='none';
    this.tip=document.createElement('div'); this.tip.className='tt'; node.appendChild(this.tip);
    this.series=[]; this.cur=null; this.W=node.clientWidth||640;
    this._mkHover();
    this.ro=new ResizeObserver(()=>{const w=node.clientWidth; if(w&&Math.abs(w-this.W)>1){this.W=w; this.render();}});
    this.ro.observe(node);
  }
  autoDomain(sers){
    if(this.o.yDomain)return this.o.yDomain.slice();
    let mn=Infinity,mx=-Infinity;
    for(const s of sers)for(const v of s.y)if(v!=null&&isFinite(v)){if(v<mn)mn=v;if(v>mx)mx=v;}
    if(!isFinite(mn)){mn=0;mx=1;} const pad=(mx-mn)*this.o.yPad||1;
    mn-=pad; mx+=pad; if(this.o.zeroLine){if(mn>0)mn=0;if(mx<0)mx=0;}
    return [mn,mx];
  }
  setSeries(series,{animate=false}={}){
    this.series=series;
    const target={ys:series.map(s=>s.y.slice()), yd:this.autoDomain(series)};
    if(!this.cur||!animate||reduceMotion){this.cur=target; this.render(); return;}
    const from={ys:this.cur.ys.map(a=>a.slice()),yd:this.cur.yd.slice()};
    // pad/truncate from arrays to match
    from.ys=target.ys.map((ta,i)=>{const fa=from.ys[i]||ta; return ta.map((_,j)=>fa[j]);});
    const t0=performance.now(),dur=620;
    const step=(now)=>{
      let t=clamp((now-t0)/dur,0,1); const e=t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
      this.cur={yd:[lerp(from.yd[0],target.yd[0],e),lerp(from.yd[1],target.yd[1],e)],
        ys:target.ys.map((ta,i)=>ta.map((tv,j)=>{const fv=from.ys[i][j];
          return (tv==null||fv==null)?tv:lerp(fv,tv,e);}))};
      this.render();
      if(t<1)this._raf=requestAnimationFrame(step);
    };
    cancelAnimationFrame(this._raf); this._raf=requestAnimationFrame(step);
  }
  _geom(){const o=this.o; const W=this.W,H=o.height;
    return {W,H,x0:o.padL,x1:W-o.padR,y0:H-o.padB,y1:o.padT};}
  _sx(x){const g=this._geom(); const [a,b]=[this.xs[0],this.xs[this.xs.length-1]];
    return g.x0+(x-a)/(b-a)*(g.x1-g.x0);}
  _sy(y){const g=this._geom(); const [mn,mx]=this.cur.yd; return g.y0+(y-mn)/(mx-mn)*(g.y1-g.y0);}
  render(){
    const o=this.o,g=this._geom(); this.svg.setAttribute('viewBox',`0 0 ${g.W} ${g.H}`);
    this.svg.setAttribute('height',g.H);
    [this.gGrid,this.gAxis,this.gLines,this.gArea].forEach(n=>n.textContent='');
    const [mn,mx]=this.cur.yd;
    // y grid + labels
    const yt=niceTicks(mn,mx,o.yTicks);
    for(const v of yt){const y=this._sy(v);
      el('line',{class:'grid',x1:g.x0,x2:g.x1,y1:y,y2:y},this.gGrid);
      const t=el('text',{class:'ax-lab',x:g.x0-8,y:y+4,'text-anchor':'end'},this.gAxis);
      t.textContent=o.formatY(v);}
    // zero emphasis
    if(o.zeroLine&&mn<0&&mx>0){const zy=this._sy(0);
      el('line',{class:'zero',x1:g.x0,x2:g.x1,y1:zy,y2:zy},this.gGrid);}
    // x axis
    el('line',{class:'ax-line',x1:g.x0,x2:g.x1,y1:g.y0,y2:g.y0},this.gAxis);
    let xt=o.xTicks||niceTicks(this.xs[0],this.xs[this.xs.length-1],6);
    // thin labels so they never collide (keep ~min 58px apart)
    const minGap=58; let lastX=-1e9;
    xt=xt.filter(xv=>{const x=this._sx(xv); if(x-lastX>=minGap){lastX=x;return true;} return false;});
    for(const xv of xt){const x=this._sx(xv);
      el('line',{class:'grid',x1:x,x2:x,y1:g.y0,y2:g.y0+4},this.gAxis);
      const t=el('text',{class:'ax-lab',x,y:g.y0+18,'text-anchor':'middle'},this.gAxis);
      t.textContent=o.formatX(xv);}
    if(o.yTitle){const t=el('text',{class:'ax-title',x:g.x0-34,y:g.y1-2,'text-anchor':'start'},this.gAxis);
      t.textContent=o.yTitle;}
    // area (first series, diverging by sign)
    if(o.area){this._area(this.series[0],this.cur.ys[0]);}
    // lines
    this.series.forEach((s,i)=>{
      const d=this._path(this.cur.ys[i]);
      if(!d)return;
      el('path',{d,fill:'none',stroke:s.color,'stroke-width':s.width||2.2,
        'stroke-opacity':s.opacity==null?1:s.opacity,'stroke-linejoin':'round','stroke-linecap':'round',
        ...(s.dash?{'stroke-dasharray':s.dash}:{})},this.gLines);
    });
    this._layoutHover();
  }
  _path(ys){let d='',pen=false;
    for(let i=0;i<this.xs.length;i++){const v=ys[i];
      if(v==null||!isFinite(v)){pen=false;continue;}
      const x=this._sx(this.xs[i]),y=this._sy(v);
      d+=(pen?'L':'M')+x.toFixed(1)+' '+y.toFixed(1)+' '; pen=true;}
    return d;}
  _area(s,ys){const g=this._geom(); const zy=clamp(this._sy(0),g.y1,g.y0);
    // gradient split at zero
    const gid='ag'+Math.random().toString(36).slice(2,7);
    const grad=el('linearGradient',{id:gid,gradientUnits:'userSpaceOnUse',x1:0,y1:g.y1,x2:0,y2:g.y0},this.gArea);
    const off=clamp((zy-g.y1)/(g.y0-g.y1),0,1);
    const warm=css('--warm'),cool=css('--cool');
    el('stop',{offset:0,'stop-color':warm,'stop-opacity':.30},grad);
    el('stop',{offset:off,'stop-color':warm,'stop-opacity':.10},grad);
    el('stop',{offset:off,'stop-color':cool,'stop-opacity':.10},grad);
    el('stop',{offset:1,'stop-color':cool,'stop-opacity':.30},grad);
    // build area path along line then back along zero
    let d='',pen=false,first=null,last=null;
    for(let i=0;i<this.xs.length;i++){const v=ys[i]; if(v==null||!isFinite(v)){continue;}
      const x=this._sx(this.xs[i]),y=this._sy(v);
      if(!pen){d+='M'+x.toFixed(1)+' '+zy.toFixed(1)+' L'+x.toFixed(1)+' '+y.toFixed(1)+' ';first=x;pen=true;}
      else d+='L'+x.toFixed(1)+' '+y.toFixed(1)+' '; last=x;}
    if(pen){d+='L'+last.toFixed(1)+' '+zy.toFixed(1)+' Z'; el('path',{d,fill:'url(#'+gid+')',stroke:'none'},this.gArea);}
  }
  _mkHover(){
    this.hLine=el('line',{class:'ax-line',y1:0,y2:0,'stroke-dasharray':'3 3',opacity:0},this.gHover);
    this.hDots=el('g',null,this.gHover);
    this.rect=el('rect',{fill:'transparent'},this.svg);
    const move=(ev)=>{
      const r=this.svg.getBoundingClientRect(); const g=this._geom();
      const px=(ev.touches?ev.touches[0].clientX:ev.clientX)-r.left;
      const sx=px/r.width*g.W;
      // nearest index
      let best=0,bd=Infinity;
      for(let i=0;i<this.xs.length;i++){const d=Math.abs(this._sx(this.xs[i])-sx);if(d<bd){bd=d;best=i;}}
      this._hoverAt(best);
    };
    const leave=()=>{this.hLine.setAttribute('opacity',0);this.hDots.textContent='';this.tip.style.opacity=0;};
    this.svg.addEventListener('pointermove',move);
    this.svg.addEventListener('pointerleave',leave);
    this.svg.addEventListener('touchmove',e=>{move(e);},{passive:true});
  }
  _layoutHover(){const g=this._geom(); this.rect.setAttribute('x',g.x0);this.rect.setAttribute('y',g.y1);
    this.rect.setAttribute('width',Math.max(0,g.x1-g.x0));this.rect.setAttribute('height',Math.max(0,g.y0-g.y1));}
  _hoverAt(i){
    if(!this.o.tooltip)return; const g=this._geom(); const x=this._sx(this.xs[i]);
    this.hLine.setAttribute('x1',x);this.hLine.setAttribute('x2',x);
    this.hLine.setAttribute('y1',g.y1);this.hLine.setAttribute('y2',g.y0);this.hLine.setAttribute('opacity',.5);
    this.hDots.textContent='';
    let rows='';
    const items=this.o.tRows?this.o.tRows(i):this.series.map((s,k)=>({color:s.color,label:s.label,val:this.cur.ys[k][i]}));
    let anyY=null;
    this.series.forEach((s,k)=>{const v=this.cur.ys[k][i]; if(v==null||!isFinite(v))return;
      const y=this._sy(v); if(anyY==null)anyY=y; else anyY=Math.min(anyY,y);
      const c=el('circle',{cx:x,cy:y,r:4.2,fill:s.color,stroke:css('--surface'),'stroke-width':1.5},this.hDots);});
    for(const it of items){ if(it.val==null||!isFinite(it.val))continue;
      const disp=it.disp!=null?it.disp:this.o.formatY(it.val);
      rows+=`<div class="r"><span class="sw" style="background:${it.color}"></span><span>${it.label}</span><b class="tt-tab">${disp}</b></div>`;}
    this.tip.innerHTML=`<b>${this.o.formatX(this.xs[i])}</b>${rows}`;
    const r=this.node.getBoundingClientRect();
    this.tip.style.left=(x/g.W*r.width)+'px';
    this.tip.style.top=((anyY==null?g.y1:anyY)/g.H*r.height)+'px';
    this.tip.style.opacity=1;
  }
}

/* index helpers for a value-year */
const yIdx=y=>YEARS.indexOf(y);
const XT=[1860,1900,1940,1980,2020];
const degF=v=>v.toFixed(0)+'°'; const degF1=v=>fmt(v,1); const degF0=v=>Math.round(v)+'°';

/* ============================ CHART 2: NAIVE ABSOLUTE ====================== */
(function(){
  const node=document.getElementById('chart-naive');
  const c=new LineChart(node,{xs:YEARS,height:320,xTicks:XT,formatX:x=>x,
    formatY:v=>v.toFixed(1)+'°C', yPad:.12,
    tRows:i=>[{color:css('--cool'),label:'Avg of raw readings',val:DATA.demo2.naive_abs[i],disp:(DATA.demo2.naive_abs[i]!=null?DATA.demo2.naive_abs[i].toFixed(1):'–')+'°C'},
              {color:css('--muted'),label:'Stations reporting',val:DATA.demo2.nstations[i],disp:DATA.demo2.nstations[i].toLocaleString('en-US')}]});
  c.o.formatY=v=>v.toFixed(1)+'°';
  c.setSeries([{key:'abs',label:'Average of raw thermometers',color:css('--cool'),width:2.4,y:DATA.demo2.naive_abs}]);
  const yrs=YEARS; const y1=DATA.demo2.nstations[yIdx(1900)],y2=DATA.demo2.nstations[yIdx(2000)];
  document.getElementById('naive-sub').textContent='°C · '+DATA.demo2.nstations[yIdx(2000)].toLocaleString()+' stations by 2000';
  window.addEventListener('themechange',()=>{c.series[0].color=css('--cool');c.render();});
})();

/* ============================ CHART D1: ABS vs ANOM ======================== */
(function(){
  const node=document.getElementById('chart-d1');
  const S=DATA.demo1.stations; const cols=['--s1','--s2','--s3','--s4','--s5'];
  const legend=document.getElementById('d1-legend');
  legend.innerHTML=S.map((s,i)=>`<span class="it"><span class="sw" style="background:${css(cols[i])}"></span>${s.name} <span style="color:var(--muted)">${s.elev} m</span></span>`).join('');
  const c=new LineChart(node,{xs:YEARS,height:360,xTicks:XT,zeroLine:true,yPad:.1,
    formatY:v=>v.toFixed(1)+'°',
    tRows:i=>S.map((s,k)=>({color:css(cols[k]),label:s.name,val:(mode==='abs'?s.abs:s.anom)[i]}))});
  let mode='abs', userTouched=false;
  const seg=document.getElementById('d1-seg');
  function draw(animate){
    c.o.zeroLine=(mode==='anom');
    c.setSeries(S.map((s,i)=>({key:s.name,label:s.name,color:css(cols[i]),width:2,opacity:.92,
      y:(mode==='abs'?s.abs:s.anom)})),{animate});
  }
  function switchTo(m,animate){
    if(m===mode){return;}
    mode=m;
    [...seg.children].forEach(x=>x.classList.toggle('on',x.dataset.m===m));
    draw(animate);
    document.getElementById('d1-title').textContent = mode==='abs'
      ? 'Five Colorado stations, absolute temperature'
      : 'The same five stations, shown as anomalies';
  }
  draw(false);
  seg.addEventListener('click',e=>{
    const b=e.target.closest('button'); if(!b)return;
    userTouched=true; switchTo(b.dataset.m,true);
  });
  // Auto-reveal the anomaly view once as the reader scrolls in, in case they
  // don't spot the toggle. A brief pause lets them register the absolute state
  // first; any manual toggle cancels it. Skipped under reduced-motion.
  if(!reduceMotion){
    let done=false;
    const io=new IntersectionObserver(es=>es.forEach(e=>{
      if(e.isIntersecting && e.intersectionRatio>=0.55 && !done && !userTouched && mode==='abs'){
        done=true;
        setTimeout(()=>{ if(!userTouched) switchTo('anom',true); },1300);
      }
    }),{threshold:[0,0.55,1]});
    io.observe(node);
  }
  window.addEventListener('themechange',()=>{S.forEach((s,i)=>c.series[i].color=css(cols[i]));c.render();
    legend.innerHTML=S.map((s,i)=>`<span class="it"><span class="sw" style="background:${css(cols[i])}"></span>${s.name} <span style="color:var(--muted)">${s.elev} m</span></span>`).join('');});
})();

/* ============================ CHART D3: CORR vs DISTANCE =================== */
(function(){
  const node=document.getElementById('chart-d3'); const d=DATA.demo3;
  const c=new LineChart(node,{xs:d.dist,height:320,yDomain:[0,1],
    xTicks:[500,1000,1500,2000,2500], formatX:x=>x.toLocaleString('en-US')+' km',
    formatY:v=>v.toFixed(1), yTitle:'correlation',
    tRows:i=>[{color:css('--s2'),label:'Anomaly correlation',val:d.corr[i]},
              {color:css('--muted'),label:'Abs. temp. gap (°C)',val:d.absdiff[i]}]});
  // shaded band 25-75%
  c.setSeries([{key:'corr',label:'Anomaly correlation',color:css('--s2'),width:2.6,y:d.corr}]);
  // add band manually after render
  function band(){const gid=c.gArea; gid.textContent='';
    let d1='',d2='';
    for(let i=0;i<d.dist.length;i++){if(d.corr_hi[i]==null)continue;
      d1+=(d1?'L':'M')+c._sx(d.dist[i]).toFixed(1)+' '+c._sy(d.corr_hi[i]).toFixed(1)+' ';}
    for(let i=d.dist.length-1;i>=0;i--){if(d.corr_lo[i]==null)continue;
      d2+='L'+c._sx(d.dist[i]).toFixed(1)+' '+c._sy(d.corr_lo[i]).toFixed(1)+' ';}
    if(d1)el('path',{d:d1+d2+'Z',fill:css('--s2'),'fill-opacity':.12,stroke:'none'},c.gArea);}
  const _r=c.render.bind(c); c.render=function(){_r();band();}; c.render();
  document.getElementById('d3-sub').textContent=d.npairs.toLocaleString()+' station pairs · '+d.period;
  // fill callout numbers ~1000km
  const i1000=d.dist.indexOf(1100); const idx=i1000>=0?i1000:5;
  document.getElementById('d3-k1').textContent=Math.round(d.corr[idx]*100)+'%';
  document.getElementById('d3-k2').textContent=d.absdiff[idx].toFixed(0)+'C';
  window.addEventListener('themechange',()=>{c.series[0].color=css('--s2');c.render();});
})();

/* ============================ TILES + LLN ================================= */
(function(){
  const d4=DATA.demo4;
  document.getElementById('tile-abs').textContent=d4.within_cell_sd_abs.toFixed(1)+'°C';
  document.getElementById('tile-anom').textContent=d4.within_cell_sd_anom.toFixed(1)+'°C';
  document.getElementById('tile-ratio').textContent=(d4.within_cell_sd_abs/d4.within_cell_sd_anom).toFixed(0)+'×';
  document.getElementById('lln-sig').textContent='±'+d4.lln_sigma.toFixed(1)+'C';

  // LLN chart: jittered dots of sample anomalies + CI bar for mean of N
  const node=document.getElementById('chart-lln'); const A=d4.sample_anoms; const sig=d4.lln_sigma;
  const svg=el('svg',{},node); svg.style.width='100%';
  const H=240; let W=node.clientWidth||640;
  const gDots=el('g',null,svg),gBar=el('g',null,svg),gAx=el('g',null,svg);
  const padL=44,padR=16,padT=16,padB=30;
  const dom=[-2.2,2.6];
  function sx(v){return padL+(v-dom[0])/(dom[1]-dom[0])*(W-padL-padR);}
  let N=1;
  const jit=A.map(()=>Math.random());
  function draw(){
    W=node.clientWidth||640; svg.setAttribute('viewBox',`0 0 ${W} ${H}`); svg.setAttribute('height',H);
    [gDots,gBar,gAx].forEach(n=>n.textContent='');
    const y0=padT, y1=H-padB, midY=(y0+y1)/2;
    // axis
    el('line',{class:'ax-line',x1:padL,x2:W-padR,y1:y1,y2:y1},gAx);
    for(const v of [-2,-1,0,1,2]){const x=sx(v);
      el('line',{class:'grid',x1:x,x2:x,y1:y0,y2:y1},gAx);
      const t=el('text',{class:'ax-lab',x,y:y1+18,'text-anchor':'middle'},gAx);t.textContent=fmt(v,0)+'°';}
    // dots
    A.forEach((v,i)=>{el('circle',{cx:sx(v),cy:y0+8+jit[i]*(y1-y0-16),r:2.4,
      fill:css('--ink-2'),'fill-opacity':.18},gDots);});
    // true mean line
    const mean=A.reduce((a,b)=>a+b,0)/A.length;
    el('line',{x1:sx(mean),x2:sx(mean),y1:y0,y2:y1,stroke:css('--muted'),'stroke-dasharray':'3 3'},gAx);
    // CI bar for mean of N
    const ci=1.96*sig/Math.sqrt(N);
    const bx0=sx(mean-ci),bx1=sx(mean+ci);
    el('rect',{x:bx0,y:midY-14,width:Math.max(1,bx1-bx0),height:28,rx:5,fill:css('--warm'),'fill-opacity':.22,
      stroke:css('--warm'),'stroke-width':1.5},gBar);
    el('circle',{cx:sx(mean),cy:midY,r:5,fill:css('--warm')},gBar);
    const lab=el('text',{class:'ax-title',x:sx(mean),y:midY-22,'text-anchor':'middle',fill:css('--warm')},gBar);
    lab.textContent='±'+ci.toFixed(ci<0.1?3:2)+'°C';
    document.getElementById('lln-ci').textContent='±'+ci.toFixed(ci<0.1?3:2)+'C';
  }
  const slider=document.getElementById('lln-slider');
  function setN(v){N=v; document.getElementById('lln-n').textContent=v; document.getElementById('lln-n2').textContent=v; draw();}
  slider.addEventListener('input',()=>setN(+slider.value));
  new ResizeObserver(()=>draw()).observe(node);
  setN(1);
  window.addEventListener('themechange',draw);
})();

/* ============================ D5a: FOUR RECIPES =========================== */
(function(){
  const node=document.getElementById('chart-d5a'); const d=DATA.demo5a;
  const defs=[['gridded','Area-weighted grid','--s1'],['unweighted','Plain mean','--s2'],
              ['median','Median','--s3'],['trimmed','Trimmed mean','--s4']];
  const c=new LineChart(node,{xs:YEARS,height:320,xTicks:XT,zeroLine:true,formatY:v=>fmt(v,1)+'°'});
  function set(){c.setSeries(defs.map(([k,l,cc])=>({key:k,label:l,color:css(cc),width:1.8,opacity:.9,y:d[k]})));}
  set();
  document.getElementById('d5a-legend').innerHTML=defs.map(([k,l,cc])=>
    `<span class="it"><span class="sw" style="background:${css(cc)}"></span>${l}</span>`).join('');
  window.addEventListener('themechange',()=>{defs.forEach((dd,i)=>c.series[i].color=css(dd[2]));c.render();
    document.getElementById('d5a-legend').innerHTML=defs.map(([k,l,cc])=>`<span class="it"><span class="sw" style="background:${css(cc)}"></span>${l}</span>`).join('');});
})();

/* ============================ D5b: HÖLDER MEANS ========================== */
(function(){
  const node=document.getElementById('chart-d5b'); const d=DATA.demo5b;
  const defs=[['arithmetic','Arithmetic','--s1'],['harmonic','Harmonic','--s2'],
              ['rms','Root-mean-square','--s3'],['geometric','Geometric','--s4']];
  // The panel only has data from 1900, so start the axis there rather than
  // leaving an empty 1850-1900 gap. Slice xs and every series to match.
  const i0=Math.max(0,YEARS.indexOf(d.start||1900)); const xs=YEARS.slice(i0);
  const c=new LineChart(node,{xs,height:300,xTicks:[1900,1940,1980,2020],zeroLine:true,formatY:v=>fmt(v,1)+'°'});
  c.setSeries(defs.map(([k,l,cc])=>({key:k,label:l,color:css(cc),width:1.8,opacity:.85,y:d[k].slice(i0)})));
  document.getElementById('d5b-legend').innerHTML=defs.map(([k,l,cc])=>
    `<span class="it"><span class="sw" style="background:${css(cc)}"></span>${l}</span>`).join('');
  if(d.n){document.getElementById('d5b-n').textContent=d.n;
    document.getElementById('d5b-sub').textContent=d.n+' stations continuous since '+d.start+' · shown as anomalies';}
  // largest spread among the four means across the whole record
  let mxs=0;
  for(let i=0;i<YEARS.length;i++){const vs=defs.map(dd=>d[dd[0]][i]).filter(v=>v!=null);
    if(vs.length===4)mxs=Math.max(mxs,Math.max(...vs)-Math.min(...vs));}
  document.getElementById('d5b-k').textContent=mxs.toFixed(2)+'°C';
  window.addEventListener('themechange',()=>{defs.forEach((dd,i)=>c.series[i].color=css(dd[2]));c.render();
    document.getElementById('d5b-legend').innerHTML=defs.map(([k,l,cc])=>`<span class="it"><span class="sw" style="background:${css(cc)}"></span>${l}</span>`).join('');});
})();

/* ============================ D6: SPARSE SAMPLING ======================== */
(function(){
  const node=document.getElementById('chart-d6'); const d=DATA.demo6;
  const sizes=['20','50','100','300','1000']; const labels={ '20':'20','50':'50','100':'100','300':'300','1000':'1,000'};
  const c=new LineChart(node,{xs:YEARS,height:340,xTicks:XT,zeroLine:true,formatY:v=>fmt(v,1)+'°',
    tRows:i=>[{color:css('--ink-2'),label:'Full network',val:d.full[i]},
      {color:css('--s4'),label:'Subset (draw 1)',val:cur[0][i]},
      {color:css('--s1'),label:'Subset (draw 2)',val:cur[1][i]}]});
  let cur=d.subsets['100'], idx=-1, userTouched=false, timer=null;
  const slider=document.getElementById('sp-slider');
  function set(i){
    i=Math.max(0,Math.min(sizes.length-1,i));
    if(i===idx){return;}
    idx=i; const N=sizes[i]; cur=d.subsets[N];
    document.getElementById('sp-n').textContent=labels[N];
    slider.value=i;
    c.setSeries([
      {key:'full',label:'Full network',color:css('--ink-2'),width:2.8,y:d.full},
      {key:'d1',label:'Subset A',color:css('--s4'),width:1.6,opacity:.85,y:cur[0]},
      {key:'d2',label:'Subset B',color:css('--s1'),width:1.6,opacity:.85,y:cur[1]},
    ],{animate:true});
  }
  slider.addEventListener('input',()=>{ userTouched=true; clearTimeout(timer); set(+slider.value); });
  // Hold on the sparsest draw (20) until the chart's top edge crosses the centre
  // of the screen, then step 20 -> 50 -> 100 -> 300 -> 1,000 one at a time on a
  // readable timer, so it isn't tied to scroll speed and doesn't race through the
  // options before the reader gets there. Fires once; grabbing the slider hands
  // control back. Static mid-value under reduced-motion.
  if(reduceMotion){ set(2); }
  else {
    set(0);
    let played=false;
    const step=i=>{
      if(userTouched||i>=sizes.length){return;}
      set(i);
      if(i<sizes.length-1){ timer=setTimeout(()=>step(i+1),1000); }
    };
    const io=new IntersectionObserver(es=>es.forEach(e=>{
      if(e.isIntersecting && !played && !userTouched){
        played=true;
        timer=setTimeout(()=>step(1),650); // beat on 20 first, then climb
      }
    }),{rootMargin:'-50% 0px -50% 0px',threshold:0});
    io.observe(node);
  }
  window.addEventListener('themechange',()=>{ if(c.series[0]){
    c.series[0].color=css('--ink-2'); c.series[1].color=css('--s4'); c.series[2].color=css('--s1'); c.render(); } });
})();

/* ============================ FINAL RECORD ================================ */
(function(){
  const node=document.getElementById('chart-final');
  const c=new LineChart(node,{xs:YEARS,height:380,xTicks:XT,zeroLine:true,area:true,yPad:.1,
    formatY:v=>fmt(v,1)+'°',
    tRows:i=>[{color:css('--warm'),label:'Global land anomaly',val:DATA.headline.gridded[i]}]});
  c.setSeries([{key:'g',label:'Reconstructed global land',color:css('--ink'),width:2.4,y:DATA.headline.gridded}]);
  window.addEventListener('themechange',()=>{c.series[0].color=css('--ink');c.render();});
})();

/* ============================ D7: RAW vs ADJUSTED ======================== */
(function(){
  const d=DATA.demo7; if(!d)return; const node=document.getElementById('chart-d7');
  const sg=v=>(v>=0?'+':'')+v.toFixed(2)+'°C';
  document.getElementById('tile-raw').textContent=sg(d.warm_raw);
  document.getElementById('tile-adj').textContent=sg(d.warm_adj);
  document.getElementById('tile-diff').textContent=sg(d.warm_diff);
  document.getElementById('d7-inline-raw').textContent=d.warm_raw.toFixed(1);
  document.getElementById('d7-inline-adj').textContent=d.warm_adj.toFixed(1);
  const c=new LineChart(node,{xs:YEARS,height:340,xTicks:XT,zeroLine:true,formatY:v=>fmt(v,1)+'°',
    tRows:i=>[{color:css('--muted'),label:'Raw (unadjusted)',val:d.raw[i]},
      {color:css('--warm'),label:'Homogenized',val:d.adjusted[i]},
      {color:css('--ink-2'),label:'Difference',val:(d.adjusted[i]!=null&&d.raw[i]!=null)?d.adjusted[i]-d.raw[i]:null}]});
  function set(){c.setSeries([
    {key:'raw',label:'Raw (unadjusted)',color:css('--muted'),width:2,dash:'5 3',y:d.raw},
    {key:'adj',label:'Homogenized',color:css('--warm'),width:2.6,y:d.adjusted},
  ]);}
  set();
  function legend(){document.getElementById('d7-legend').innerHTML=
    '<span class="it"><span class="sw" style="background:'+css('--muted')+'"></span>Raw / unadjusted (GHCN qcu)</span>'+
    '<span class="it"><span class="sw" style="background:'+css('--warm')+'"></span>Homogenized (GHCN qcf)</span>';}
  legend();
  document.getElementById('d7-sub').textContent='anomaly °C vs. 1961–1990 · same method, both series';
  window.addEventListener('themechange',()=>{c.series[0].color=css('--muted');c.series[1].color=css('--warm');c.render();legend();});
})();

/* ============================ STATION MAP ================================= */
(function(){
  const cv=document.getElementById('stationMap'); const ctx=cv.getContext('2d');
  const LA=DATA.stationmap.lat, LO=DATA.stationmap.lon;
  function draw(){
    const w=cv.clientWidth; const h=Math.round(w*0.5); const dpr=window.devicePixelRatio||1;
    cv.width=w*dpr; cv.height=h*dpr; cv.style.height=h+'px'; ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,w,h);
    // graticule
    ctx.strokeStyle=css('--line'); ctx.lineWidth=1; ctx.globalAlpha=.6;
    for(let lon=-180;lon<=180;lon+=30){const x=(lon+180)/360*w; ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
    for(let lat=-60;lat<=60;lat+=30){const y=(90-lat)/180*h; ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
    ctx.globalAlpha=1;
    const col=css('--warm');
    for(let i=0;i<LA.length;i++){let lon=LO[i]; if(lon>180)lon-=360;
      const x=(lon+180)/360*w, y=(90-LA[i])/180*h;
      ctx.fillStyle=col; ctx.globalAlpha=.5; ctx.beginPath(); ctx.arc(x,y,1.1,0,7); ctx.fill();}
    ctx.globalAlpha=1;
  }
  new ResizeObserver(()=>draw()).observe(cv);
  window.addEventListener('themechange',draw); draw();
})();

/* ============================ MYTH CARDS ================================= */
(function(){
  const myths=[
    ['“Temperature is intensive, so you can’t average it.”',
     `<p>True that you can’t <b>merge</b> two objects into one blended temperature, but that was never the claim. The global record is a <b>spatial average of a field</b>, the same species of quantity as average elevation, average rainfall, or a country’s average income. Nobody objects that “average elevation” is meaningless because you can’t stack mountains.</p>
      <p>And we don’t even average absolute temperatures. We average <b>anomalies</b>, departures from each place’s own normal. That’s an index of how the surface energy state is changing, not a claim that the planet sits at one thermodynamic temperature.</p>`],
    ['“The choice of averaging method is arbitrary.”',
     `<p>It’s a real mathematical freedom, and yet, tested on the actual data, it changes the answer by a rounding error. Arithmetic, harmonic, root-mean-square and geometric means of absolute kelvin all agree to about a hundredth of a degree (Section 6), because temperatures cluster tightly around 288 K. Mean, median, and trimmed mean of the anomalies agree too. Every reasonable recipe shows the same warming.</p>`],
    ['“Slapping °C on a statistic is a deception.”',
     `<p>A <b>change</b> in temperature is legitimately measured in degrees. If this morning warmed by 3 degrees, the unit is degrees, full stop. The anomaly is a temperature difference, so °C is exactly the right unit. It isn’t claiming to be the reading of one giant global thermometer; it’s the average shift of millions of real readings, and “°C” is the honest label for that.</p>`],
    ['“Thermometers have huge errors, so the average must too.”',
     `<p>Backwards. Independent random errors <b>cancel</b> when you average, so the uncertainty on the mean shrinks like 1/√N (Section 5). That’s why a crude instrument, repeated thousands of times, yields a precise average. The individual station might be off by half a degree; the global anomaly is pinned to a few hundredths.</p>`],
    ['“Coverage changed / whole regions are unsampled.”',
     `<p>Because anomalies stay correlated across ~1,000 km (Section 4), each station represents a wide area, and the global average is remarkably robust to how many stations report. Rebuilding the record from as few as 20 random stations still recovers the trend (Section 7). Changing coverage is exactly why you must work in anomalies and area-weight; do that, and the network can grow or shrink without moving the signal.</p>`],
    ['“The adjustments create the trend.”',
     `<p>Checked head-on in Section 9: the raw, unadjusted GHCN readings warm by about <b>1.1C per century</b> since 1900 all on their own. The adjustments add only ~0.25C on top, and they nudge the trend <b>up</b>, not down, because the real instrument biases had been flattening the raw record. Take every correction away and the warming is still unmistakable.</p>
      <p>And across the <b>full global</b> record the net effect of adjustments is to <b>reduce</b> warming, because the largest single correction is to ocean data. A signal that also survives four independent teams using different corrections isn’t an artifact of anyone’s adjustments.</p>`],
    ['“Models are just tuned to reproduce it.”',
     `<p>Whether or not a global temperature is meaningful is a question about <b>thermometers</b>, not models, and it stands on the observational data alone, as shown here. Separately, climate models are <b>not</b> tuned to the warming trend; they’re tuned to a pre-industrial energy balance, and the historical warming is an emergent output. But that’s a different debate. The temperature record is an observation, reproducible without any model at all.</p>`],
  ];
  const list=document.getElementById('myth-list');
  list.innerHTML=myths.map(([q,a])=>`<details class="myth reveal"><summary><span class="q">CLAIM</span><span class="claim">${q}</span><span class="chev">▸</span></summary><div class="ans">${a}</div></details>`).join('');
})();

/* ============================ CHROME: theme, reveal, progress, hero ======= */
(function(){
  // theme
  const btn=document.getElementById('themebtn'); const root=document.documentElement;
  const mq=window.matchMedia('(prefers-color-scheme:dark)');
  function apply(t){root.setAttribute('data-theme',t); window.dispatchEvent(new Event('themechange'));}
  let t=mq.matches?'dark':'light'; apply(t);
  btn.addEventListener('click',()=>{t=(root.getAttribute('data-theme')==='dark')?'light':'dark'; apply(t);});

  // reveal
  const io=new IntersectionObserver((es)=>{es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});},{rootMargin:'0px 0px -8% 0px'});
  document.querySelectorAll('.reveal').forEach(n=>io.observe(n));

  // progress bar
  const prog=document.getElementById('progress');
  const onScroll=()=>{const h=document.documentElement; const p=h.scrollTop/(h.scrollHeight-h.clientHeight);
    prog.style.width=clamp(p*100,0,100)+'%';};
  document.addEventListener('scroll',onScroll,{passive:true}); onScroll();

  // hero strata — subtle warming-stripes field
  const cv=document.getElementById('heroStrata'); const ctx=cv.getContext('2d');
  function drawHero(){
    const w=cv.parentElement.clientWidth, h=cv.parentElement.clientHeight;
    if(!w||!h)return;
    const dpr=window.devicePixelRatio||1; cv.width=w*dpr; cv.height=h*dpr; ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,w,h);
    const g=DATA.headline.gridded; const n=g.length;
    const bw=w/n;
    const warm=[213,67,47], cool=[42,111,214];
    for(let i=0;i<n;i++){const v=g[i]; if(v==null)continue;
      const t=clamp((v+0.8)/2.8,0,1);
      const r=Math.round(lerp(cool[0],warm[0],t)),gg=Math.round(lerp(cool[1],warm[1],t)),b=Math.round(lerp(cool[2],warm[2],t));
      ctx.fillStyle=`rgba(${r},${gg},${b},0.16)`;
      ctx.fillRect(i*bw,0,bw+1,h);}
    // fade toward top for text legibility
  }
  new ResizeObserver(()=>drawHero()).observe(cv.parentElement); drawHero();
})();
