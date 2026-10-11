// Map logic. Expects globals set by loader.js: PTS, LNS, LINKS, TYP, CSTAT, WORLD, GEM, SAT.
const W=2048,H=1024,X=l=>(l+180)/360*W,Y=l=>(90-l)/180*H;
const CATS={
 oil:{label:'Offshore oil fields',grp:'up',c:'--crude',g:'ring'},
 gas:{label:'Offshore gas fields',grp:'up',c:'--gas',g:'ring'},
 ons:{label:'Onshore giant fields',grp:'up',c:'--ons',g:'hex'},
 poil:{label:'Main oil pipelines',grp:'mid',c:'--crude',line:1},
 pgas:{label:'Main gas pipelines',grp:'mid',c:'--gas',line:1},
 neto:{label:'Full oil pipeline network',grp:'mid',c:'--crude',line:3},
 netg:{label:'Full gas pipeline network',grp:'mid',c:'--gas',line:3},
 port:{label:'Ports, terminals, hubs',grp:'mid',c:'--port',g:'dot'},
 choke:{label:'Chokepoints',grp:'mid',c:'--choke',g:'x'},
 rcrude:{label:'Crude sea lanes',grp:'mid',c:'--crude',line:2},
 rprod:{label:'Refined product sea lanes',grp:'mid',c:'--prod',line:2},
 ships:{label:'Vessels (simulated)',grp:'mid',c:'--ink',g:'ship'},
 lngx:{label:'LNG export plants',grp:'lng',c:'--lngx',g:'dia'},
 lngi:{label:'LNG import terminals',grp:'lng',c:'--lngi',g:'tri'},
 fsru:{label:'FSRUs and floating terminals',grp:'lng',c:'--fsru',g:'hull'},
 rlng:{label:'LNG sea lanes',grp:'lng',c:'--gas',line:2},
 ref:{label:'Refineries',grp:'down',c:'--ref',g:'sq'},
 pwr:{label:'Gas-to-power demand (Africa, East Med)',grp:'down',c:'--pwr',g:'bolt'}
};
const GRPS=[['up','Upstream'],['mid','Midstream'],['lng','LNG'],['down','Downstream']];
const STN={o:'Operating',c:'Under construction or ramping',p:'Planned',x:'Offline or idle'};
const KIND={ref:'Refinery',lngx:'LNG export plant',lngi:'LNG import terminal',fsru:'FSRU / floating terminal',oil:'Offshore oil field',gas:'Offshore gas field',ons:'Onshore field',port:'Port / terminal',choke:'Chokepoint',pwr:'Gas-to-power demand',poil:'Oil pipeline',pgas:'Gas pipeline',rcrude:'Crude sea lane',rlng:'LNG sea lane',rprod:'Product sea lane'};
const GL={sq:'<rect class="g" x="-5" y="-5" width="10" height="10" rx="1"/>',dia:'<path class="g" d="M0-7L7 0 0 7-7 0Z"/>',tri:'<path class="g" d="M-6.5-5H6.5L0 6.5Z"/>',hull:'<path class="g" d="M-8.5-3.5H8.5L5.5 3.5H-6.5Z"/>',ring:'<circle class="g" r="5"/><circle r="1.8" fill="var(--halo)"/>',hex:'<path class="g" d="M-6 0L-3-5.2H3L6 0 3 5.2H-3Z"/>',dot:'<circle class="g" r="4"/>',x:'<path class="g" d="M-5-5L5 5M5-5L-5 5" style="stroke:var(--choke);stroke-width:3;fill:none"/>',bolt:'<path class="g" d="M1.5-8.5L-5.5 1H-.5L-1.5 8.5L5.5-1H.5Z"/>',ship:'<path d="M-7 0L-3-3H5L7 0 5 3H-3Z" fill="var(--ink)"/>'};
const ALL=Object.keys(CATS),S4=['o','c','p','x'];
const GASCHAIN=['gas','ons','pgas','netg','rlng','ships','lngx','lngi','fsru','choke','pwr'];
const on={cats:new Set(GASCHAIN),st:new Set(S4),cap:0,year:2026,fend:0,chk:false};
const svg=d3.select('#map'),root=d3.select('#root');
// ---- index and links
const IDX=new Map();PTS.forEach(p=>{p.isP=true;IDX.set(p.name,p)});LNS.forEach(l=>IDX.set(l.name,l));
[...PTS,...LNS].forEach(o=>{o.ins=[];o.outs=[]});
const toks=s=>s.split(';').map(t=>t.trim()).filter(Boolean);
for(const k in LINKS){const o=IDX.get(k);if(!o)continue;o.ins=toks(LINKS[k][0]);o.outs=toks(LINKS[k][1])}
for(const o of IDX.values()){for(const t of o.outs.slice()){const b=IDX.get(t);if(b&&!b.ins.includes(o.name))b.ins.push(o.name)}
  for(const t of o.ins.slice()){const b=IDX.get(t);if(b&&!b.outs.includes(o.name))b.outs.push(o.name)}}
function chain(o){const s=new Set([o]);const walk=(x,key,d)=>{if(d>4)return;for(const t of x[key]){const b=IDX.get(t);if(b&&!s.has(b)){s.add(b);walk(b,key,d+1)}}};walk(o,'ins',0);walk(o,'outs',0);return s}
let HL=new Set(),tracing=false;
// ---- size by capacity
PTS.forEach(p=>{let f=1;if(p.cat==='ref')f=Math.sqrt(p.kbd/380);else if(p.cat==='lngx')f=Math.sqrt((parseFloat(p.cap)||10)/12);p.sf=Math.max(.72,Math.min(1.75,f))});
// ---- basemap
const gp=d3.geoPath(d3.geoEquirectangular().scale(W/(2*Math.PI)).translate([W/2,H/2]));
const ALIAS={'United States of America':'United States','Côte d\'Ivoire':'Cote d\'Ivoire','Congo':'Republic of the Congo','Eq. Guinea':'Equatorial Guinea','Falkland Is.':'Falkland Islands','Dem. Rep. Congo':'Democratic Republic of the Congo','Trinidad and Tobago':'Trinidad and Tobago'};
const CEL=new Map();
topojson.feature(WORLD,WORLD.objects.countries).features.forEach(f=>{const n=ALIAS[f.properties.name]||f.properties.name;
  const el=d3.select('#ctry').append('path').attr('class','land').attr('d',gp(f)).on('click',e=>{e.stopPropagation();showCountry(n)});
  CEL.set(n,{el:el.node(),b:d3.geoBounds(f),f})});
let FOCUS=null; // {name, set} while a country is in focus
d3.select('#cb').attr('d',gp(topojson.mesh(WORLD,WORLD.objects.countries,(a,b)=>a!==b)));
// ---- full pipeline network (Global Energy Monitor route geometry)
function gemPath(arr){let d='';for(const a of arr){let x=a[0],y=a[1];d+='M'+X(x/100).toFixed(2)+','+Y(y/100).toFixed(2);for(let i=2;i<a.length;i+=2){x+=a[i];y+=a[i+1];d+='L'+X(x/100).toFixed(2)+','+Y(y/100).toFixed(2)}}return d}
document.getElementById('gemg').setAttribute('d',gemPath(GEM.g));document.getElementById('geml').setAttribute('d',gemPath(GEM.l));
// ---- lines
const lg=d3.line().x(d=>X(d[0])).y(d=>Y(d[1])).curve(d3.curveCatmullRom.alpha(.5));
const gl=d3.select('#lines');
LNS.forEach(l=>{l.els=[];l.segs=[];
  l.paths.forEach(p=>{const d=lg(p);const v=gl.append('path').attr('d',d);
    const h=gl.append('path').attr('class','hit').attr('d',d).on('click',e=>{e.stopPropagation();showLine(l)});
    l.els.push(v.node(),h.node());l.segs.push(v.node())})});
// ---- markers
const gm=d3.select('#marks');
PTS.forEach(p=>{const c=CATS[p.cat];
  const g=gm.append('g').attr('style','--c:var('+c.c+')').html('<circle r="12" fill="transparent"/>'+GL[c.g]+'<text x="10" y="4"></text>');
  g.select('.g').attr('fill','var('+c.c+')');g.select('text').text(p.name).attr('transform','scale('+(1/p.sf).toFixed(3)+')').attr('x',(10*p.sf).toFixed(1)).attr('y',(4*p.sf).toFixed(1));
  g.on('click',e=>{e.stopPropagation();showPoint(p)});p.el=g.node();p.x=X(p.lon);p.y=Y(p.lat)});
// ---- ships
const gs=d3.select('#ships');const SHIPS=[];
const VT={rcrude:['Crude tanker','Typical very large crude carrier lifts about 2 million barrels.'],rlng:['LNG carrier','Typical cargo about 170,000 cubic metres, roughly 70,000 tonnes.'],rprod:['Product tanker','Typical long-range cargo 60,000 to 90,000 tonnes of diesel, jet or gasoline.']};
LNS.filter(l=>CATS[l.cat].line===2).forEach((l,li)=>{l.lens=l.segs.map(s=>s.getTotalLength());l.tot=d3.sum(l.lens);
  const n=Math.max(2,Math.min(7,Math.round(l.tot/90)));
  for(let k=0;k<n;k++){const el=gs.append('path').attr('class','ship').attr('d','M-6 0L-2.5-2.6H4L6 0 4 2.6H-2.5Z').attr('fill','var('+CATS[l.cat].c+')');
    const s={l,el:el.node(),off:(k+((li*37)%10)/10)/n};el.on('click',e=>{e.stopPropagation();showShip(s)});SHIPS.push(s)}});
function along(l,t){let d=t*l.tot;for(let i=0;i<l.segs.length;i++){if(d<=l.lens[i]){const a=l.segs[i].getPointAtLength(d),b=l.segs[i].getPointAtLength(Math.min(l.lens[i],d+.6));return[a.x,a.y,Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI]}d-=l.lens[i]}const e=l.segs[l.segs.length-1].getPointAtLength(1e9);return[e.x,e.y,0]}
let K=1,MS=1;const T0=performance.now();
function tickShips(now){const t=(now-T0)/1000;for(const s of SHIPS){if(s.el.style.display==='none')continue;const p=along(s.l,(s.off+t*0.55/s.l.tot)%1);
  s.el.setAttribute('transform','translate('+p[0]+','+p[1]+') rotate('+p[2]+') scale('+MS*.95+')')}}
const still=matchMedia('(prefers-reduced-motion:reduce)').matches;let last=0;
function loop(n){if(n-last>70){last=n;tickShips(n)}requestAnimationFrame(loop)}
// ---- zoom, sizing, clustering
const gc=d3.select('#clus');let CL=[];
const zoom=d3.zoom().scaleExtent([.3,90]).on('zoom',e=>{root.attr('transform',e.transform);K=e.transform.k;scaleMarks()}).on('end',()=>{cluster();tiles();renderAn()});
svg.call(zoom).on('dblclick.zoom',null);
// ---- satellite tiles: Sentinel-2 cloudless (EOX), sharpens as you zoom, about 10 metres per pixel at full zoom
const ZMAX=8000,ESRI='https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/',TILE='https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless/default/WGS84/';
let satOn=false;const gt=d3.select('#tiles'),TL=new Map();
function tiles(){
  if(!satOn){gt.selectAll('*').remove();TL.clear();return}
  const layers=satLayers(),sig=layers.map(l=>l.k).join(',');
  if(gt.attr('data-sig')!==sig){gt.selectAll('*').remove();TL.clear();gt.attr('data-sig',sig);layers.forEach(l=>gt.append('g').attr('data-k',l.k))}
  const t=d3.zoomTransform(svg.node()),[w,h]=size(),dpr=Math.min(2,window.devicePixelRatio||1);const keep=new Set();
  for(const L of layers){
    if(L.merc){const z=Math.min(L.max,Math.round(Math.log2(W*t.k*dpr/256)));if(z<L.min)continue;const n=2**z,g=gt.select('g[data-k="'+L.k+'"]');
      const lonA=(-t.x/t.k)/W*360-180,lonB=((w-t.x)/t.k)/W*360-180,latA=90-(-t.y/t.k)/H*180,latB=90-((h-t.y)/t.k)/H*180;
      const my=la=>{const r=Math.max(-85,Math.min(85,la))*Math.PI/180;return(1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*n},ml=y=>Math.atan(Math.sinh(Math.PI*(1-2*y/n)))*180/Math.PI;
      const x0=Math.max(0,Math.floor((lonA+180)/360*n)),x1=Math.min(n-1,Math.floor((lonB+180)/360*n)),y0=Math.max(0,Math.floor(my(latA))),y1=Math.min(n-1,Math.floor(my(latB)));
      if((x1-x0+1)*(y1-y0+1)>L.cap)continue;
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const k=L.k+'/'+z+'/'+y+'/'+x;keep.add(k);
        if(!TL.has(k)){const px=X(x/n*360-180),py=Y(ml(y)),pw=W/n,ph=Y(ml(y+1))-py;
          const el=g.append('image').attr('href',L.url(z,y,x)).attr('x',px).attr('y',py).attr('width',pw*1.002).attr('height',ph*1.002).attr('preserveAspectRatio','none').node();
          el.addEventListener('error',()=>{el.remove()});TL.set(k,el)}}
      continue}
    const z=Math.min(L.max,Math.ceil(Math.log2(L.base*t.k*dpr/L.px)));if(z<L.min)continue;
    const s=L.base/2**z,nx=Math.ceil(W/s),ny=Math.ceil(H/s),g=gt.select('g[data-k="'+L.k+'"]');
    const x0=Math.max(0,Math.floor(-t.x/t.k/s)),x1=Math.min(nx-1,Math.floor((w-t.x)/t.k/s)),y0=Math.max(0,Math.floor(-t.y/t.k/s)),y1=Math.min(ny-1,Math.floor((h-t.y)/t.k/s));
    if((x1-x0+1)*(y1-y0+1)>L.cap)continue;
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const k=L.k+'/'+z+'/'+y+'/'+x;keep.add(k);
      if(!TL.has(k)){const el=g.append('image').attr('href',L.url(z,y,x)).attr('x',x*s).attr('y',y*s).attr('width',s*1.003).attr('height',s*1.003).attr('preserveAspectRatio','none').node();
        el.addEventListener('error',()=>{el.remove()});TL.set(k,el)}}}
  const old=[...TL.keys()].filter(k=>!keep.has(k));
  setTimeout(()=>old.forEach(k=>{if(!keep.has(k)||!satOn){const e=TL.get(k);if(e){e.remove();TL.delete(k)}}}),keep.size?900:0)}
function scaleMarks(){MS=Math.max(.5,Math.min(1.25,.45+K*.11))/K;
  for(const p of PTS)p.el.setAttribute('transform','translate('+p.x+','+p.y+') scale('+MS*p.sf+')');
  for(const c of CL)c.el.setAttribute('transform','translate('+c.x+','+c.y+') scale('+1/K+')');
  for(const v of LIVE)v.el.setAttribute('transform','translate('+v.x+','+v.y+') rotate('+((v.course==null?90:+v.course)-90)+') scale('+MS*1.15+')');
  svg.classed('lab',K>=4.5).classed('far',K<1.6);if(still)tickShips(T0)}
function cluster(){gc.selectAll('*').remove();CL=[];for(const p of PTS)p.cl=false;
  if(K<5&&!tracing&&!FOCUS){const cell=34/K,m=new Map();
    for(const p of PTS){if(!p.vis)continue;const k=Math.floor(p.x/cell)+','+Math.floor(p.y/cell);if(!m.has(k))m.set(k,[]);m.get(k).push(p)}
    for(const a of m.values()){if(a.length<3)continue;for(const p of a)p.cl=true;
      const c={x:d3.mean(a,p=>p.x),y:d3.mean(a,p=>p.y),a};
      const g=gc.append('g').attr('class','cl').attr('transform','translate('+c.x+','+c.y+') scale('+1/K+')').html('<circle r="'+(10+Math.min(8,a.length/3))+'"/><text y="4" text-anchor="middle">'+a.length+'</text>');
      g.on('click',e=>{e.stopPropagation();const pd=Math.max(.4,6/K);fit([d3.min(a,p=>p.lon)-pd,d3.min(a,p=>p.lat)-pd,d3.max(a,p=>p.lon)+pd,d3.max(a,p=>p.lat)+pd])});
      c.el=g.node();CL.push(c)}}
  for(const p of PTS)p.el.style.display=(p.vis&&!p.cl)?'':'none'}
function size(){const r=svg.node().getBoundingClientRect();return[r.width,r.height]}
function setExtent(){const[w,h]=size();zoom.scaleExtent([Math.max(w/W,h/H),ZMAX]).translateExtent([[0,0],[W,H]])}
function fit(b,dur){const[w,h]=size();const x0=X(b[0]),x1=X(b[2]),y0=Y(b[3]),y1=Y(b[1]);
  const mob=w<=860;const padB=mob?(document.getElementById('card').style.display==='flex'?h*.5:60):0;
  const padL=mob?0:leftPad();
  const padR=!mob&&document.getElementById('card').style.display==='flex'?370:0;
  const k=Math.min(ZMAX,Math.max(zoom.scaleExtent()[0],.92*Math.min((w-padL-padR)/(x1-x0),(h-padB-70)/(y1-y0))));
  svg.transition().duration(dur==null?700:dur).call(zoom.transform,d3.zoomIdentity.translate(padL+(w-padL-padR)/2-k*(x0+x1)/2,(h-padB+60)/2-k*(y0+y1)/2).scale(k))}
function flyTo(lon,lat,k){fit([lon-180/k,lat-60/k,lon+180/k,lat+60/k])}
// ---- filtering
function est(o){return(o.yr&&o.yr<=on.year&&(o.st==='c'||o.st==='p'))?'o':o.st}
let sel=null;
function apply(){
  for(const p of PTS){const s=p.es=est(p);const h=HL.has(p);
    let v=on.cats.has(p.cat)&&on.st.has(s);if(v&&p.cat==='ref'&&p.kbd<on.cap)v=false;if(v&&on.fend&&p.cat==='fsru'&&!(p.end&&p.end<=on.fend))v=false;if(v&&on.chk&&!p.chk)v=false;
    const lit=tracing?h:(FOCUS&&FOCUS.set.has(p));
    p.vis=v||h;p.el.setAttribute('class','mk st-'+s+(s!==p.st?' new':'')+(lit?' hl':'')+(sel===p.el?' sel':''))}
  for(const l of LNS){const s=l.es=est(l);const h=HL.has(l);l.vis=(on.cats.has(l.cat)&&on.st.has(s)&&!on.chk)||h;
    const lit=tracing?h:(FOCUS&&FOCUS.set.has(l));
    for(const e of l.segs)e.setAttribute('class','ln '+l.cat+' st-'+s+(s!==l.st?' new':'')+(lit?' hl':'')+(lit&&!tracing?' soft':''));for(const e of l.els)e.style.display=l.vis?'':'none'}
  for(const s of SHIPS)s.el.style.display=(on.cats.has('ships')&&s.l.vis&&!tracing&&!LIVE.length)?'':'none';
  for(const v of LIVE)v.el.style.display=(on.cats.has('ships')&&!tracing)?'':'none';
  document.getElementById('gemg').style.display=on.cats.has('netg')?'':'none';document.getElementById('geml').style.display=on.cats.has('neto')?'':'none';
  svg.classed('tracing',tracing||!!FOCUS).classed('focus',!!FOCUS&&!tracing).classed('hlab',tracing?HL.size<=10:(!!FOCUS&&FOCUS.set.size<=40));
  focusUi();
  document.querySelectorAll('#groups input').forEach(i=>i.checked=on.cats.has(i.value));
  document.querySelectorAll('#stat .chip').forEach(c=>c.setAttribute('aria-pressed',on.st.has(c.dataset.s)));
  GRPS.forEach(([g])=>{const ks=ALL.filter(k=>CATS[k].grp===g),n=ks.filter(k=>on.cats.has(k)).length;
    document.querySelector('#chain [data-g="'+g+'"]').setAttribute('aria-pressed',n===0?'false':n===ks.length?'true':'mixed')});
  document.getElementById('capv').textContent=on.cap?on.cap+' thousand barrels/day':'All';
  document.getElementById('yrv').textContent=on.year===2026?'Today':on.year+' if targets hold';
  cluster();if(still)tickShips(T0);renderAn()}
function legend(k){const c=CATS[k];if(c.line)return'<svg width="26" height="14"><path d="M1 7H25" stroke="var('+c.c+')" stroke-width="'+(c.line===1?2.5:c.line===3?1:2)+'" '+(c.line===2?'stroke-dasharray="1 5" stroke-linecap="round"':'')+'/></svg>';
  return'<svg width="26" height="18" viewBox="-13 -9 26 18"><g style="--halo:transparent">'+GL[c.g].replace('class="g"','class="g" fill="var('+c.c+')"')+'</g></svg>'}
const REG={'World':[-170,-58,180,78],'Middle East Gulf':[44,21,62,32],'Egypt and East Mediterranean':[24,25,38,37],'West Africa':[-20,-12,16,20],'Southern Africa':[8,-37,42,-15],'Europe':[-12,34,42,64],'Russia and Caspian':[28,36,110,74],'United States Gulf':[-104,23,-80,36],'South America':[-82,-56,-32,13],'South and East Asia':[66,-12,146,46],'Australia':[108,-42,156,-7]};
(function ui(){
  const ch=document.getElementById('chain'),gr=document.getElementById('groups');
  GRPS.forEach(([g,n])=>{ch.insertAdjacentHTML('beforeend','<button data-g="'+g+'" aria-pressed="true" title="Show or hide all '+n+'"><i></i>'+n+'</button>');
    let h='<h3>'+n+'</h3>';
    ALL.filter(k=>CATS[k].grp===g).forEach(k=>{const c=CATS[k];const cnt=k==='ships'?SHIPS.length:k==='netg'?GEM.g.length:k==='neto'?GEM.l.length:c.line?LNS.filter(l=>l.cat===k).length:PTS.filter(p=>p.cat===k).length;
      h+='<label class="row"><input type="checkbox" value="'+k+'">'+legend(k)+'<b>'+c.label+'</b><em>'+cnt.toLocaleString()+'</em></label>'});
    gr.insertAdjacentHTML('beforeend',h)});
  ch.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const ks=ALL.filter(k=>CATS[k].grp===b.dataset.g);const all=ks.every(k=>on.cats.has(k));ks.forEach(k=>all?on.cats.delete(k):on.cats.add(k));apply()});
  gr.addEventListener('change',e=>{e.target.checked?on.cats.add(e.target.value):on.cats.delete(e.target.value);apply()});
  const st=document.getElementById('stat');S4.forEach(s=>st.insertAdjacentHTML('beforeend','<button class="chip" data-s="'+s+'" aria-pressed="true">'+STN[s]+'</button>'));
  st.addEventListener('click',e=>{const b=e.target.closest('.chip');if(!b)return;on.st.has(b.dataset.s)?on.st.delete(b.dataset.s):on.st.add(b.dataset.s);apply()});
  const PRE={'Gas and LNG chain':[GASCHAIN,S4],'Oil chain':[['oil','ons','poil','neto','rcrude','rprod','ships','port','choke','ref'],S4],'Full value chain':[ALL,S4],'FSRUs and LNG imports':[['fsru','lngi','rlng','ships','pwr'],S4],'FSRU charters ending by 2028':[['fsru'],S4,2028],'Checked records only':[ALL.filter(k=>!CATS[k].line&&k!=='ships'),S4,0,true],'In progress only':[ALL.filter(k=>k!=='ships'&&!(CATS[k].line>1)),['c','p']],'Chokepoints and sea lanes':[['choke','rcrude','rlng','rprod','ships','port'],S4],'Clear map':[[],S4]};
  const pr=document.getElementById('presets');Object.keys(PRE).forEach(n=>pr.insertAdjacentHTML('beforeend','<button class="chip">'+n+'</button>'));
  pr.addEventListener('click',e=>{const b=e.target.closest('.chip');if(!b)return;const p=PRE[b.textContent];clearFocus(true);closeCard(true);on.cats=new Set(p[0]);on.st=new Set(p[1]);on.fend=p[2]||0;on.chk=!!p[3];on.cap=0;document.getElementById('cap').value=0;apply()});
  const rg=document.getElementById('regions');Object.keys(REG).forEach(n=>rg.insertAdjacentHTML('beforeend','<button class="chip">'+n+'</button>'));
  rg.addEventListener('click',e=>{const b=e.target.closest('.chip');if(!b)return;if(innerWidth<=860)togF(false);fit(REG[b.textContent])});
  document.getElementById('yr').addEventListener('input',e=>{on.year=+e.target.value;apply()});
  document.getElementById('cap').addEventListener('input',e=>{on.cap=+e.target.value;apply()});
  document.getElementById('zw').onclick=()=>fit(REG.World);
})();
// ---- cards
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function openCard(kind,color,html){document.getElementById('ckind').innerHTML='<span class="tag kind" style="background:var('+color+');margin:0">'+kind+'</span>';
  document.getElementById('cbody').innerHTML=html;document.getElementById('card').style.display='flex';document.getElementById('cbody').scrollTop=0;if(innerWidth<=860){togF(false);if(A.open)togA(false)}}
function closeCard(quiet){document.getElementById('card').style.display='none';document.getElementById('card').classList.remove('tall');setHash('');A.co=null;sel=null;HL=new Set();tracing=false;if(!FOCUS)CEL.forEach(c=>c.el.classList.remove('csel'));if(quiet!==true)apply()}
function row(k,v){return v?'<dt>'+k+'</dt><dd>'+esc(v)+'</dd>':''}
function linkList(title,arr,typ){let items=arr;let cls='';if(!items.length){if(!typ)return'';items=[typ];cls=' class="typ"'}
  return'<div class="io"><h4>'+title+'</h4><ul'+cls+'>'+items.map(t=>{const o=IDX.get(t);return o?'<li><button class="lk" data-n="'+esc(t)+'">'+esc(t)+'</button><span>'+KIND[o.cat]+'</span></li>':'<li>'+esc(t)+'</li>'}).join('')+'</ul></div>'}
function ioBlock(o){const t=TYP[o.cat]||['',''];const n=chain(o).size-1;
  return'<div class="notep">'+linkList('Supplied by',o.ins,t[0])+linkList('Delivers to',o.outs,t[1])+(n?'<p class="fine" style="margin-top:6px">'+n+' linked '+(n===1?'asset is':'assets are')+' highlighted on the map. The rest is dimmed.</p>':'')+'</div>'}
function srcBlock(o){return o.chk?'<p class="fine"><b>Checked '+o.chk+'.</b> Source: '+esc(o.src)+'.</p>':'<p class="fine"><b>Not yet checked.</b> From general knowledge to mid-2026. Verify before use.</p>'}
function trace(o){HL=chain(o);tracing=HL.size>1;if(!tracing)HL=new Set()}
function showPoint(p,fly){sel=p.el;if(!FOCUS)CEL.forEach(c=>c.el.classList.remove('csel'));trace(p);
  const capL=p.cat==='fsru'?'Unit':p.cat==='choke'?'Flow':'Capacity';const pw=p.cat==='pwr';const inprog=p.st==='c'||p.st==='p';
  openCard(KIND[p.cat],CATS[p.cat].c,'<h2>'+esc(p.name)+'</h2><span class="tag">'+STN[p.st]+'</span>'+(p.country?'<button class="tag lkc" data-c="'+esc(p.country.split(' / ')[0])+'">'+esc(p.country)+'</button>':'')+
   '<dl>'+row(capL,p.cap)+row(pw?'Gas supply':p.cat==='fsru'?'Terminal':'Operator',p.op)+row('Vessel owner',p.own)+row('Charterer',p.chr)+(p.cat==='fsru'&&p.term?row('Charter end',p.end?'About '+p.end+' (verify)':'No fixed end known'):'')+row(pw?'Import need':'Trade role',p.role)+(inprog?row('Start-up',p.yr?'Target '+p.yr+' (verify)':'No firm date'):'')+row('Position',p.lat.toFixed(2)+', '+p.lon.toFixed(2)+' (approximate)')+'</dl>'+
   ioBlock(p)+newsBlock(p)+(p.term?'<p class="notep">'+esc(p.term)+'</p>':'')+(p.note?'<p class="notep">'+esc(p.note)+'</p>':'')+
   ((window.TRACKER_CONFIG||{}).googleMapsKey?'<iframe class="gm" loading="lazy" allowfullscreen referrerpolicy="no-referrer-when-downgrade" title="Google satellite view of '+esc(p.name)+'" src="https://www.google.com/maps/embed/v1/view?key='+encodeURIComponent(window.TRACKER_CONFIG.googleMapsKey)+'&center='+p.lat+','+p.lon+'&zoom=15&maptype=satellite"></iframe>':'')+
   '<a class="sl" target="_blank" rel="noopener" href="https://www.google.com/maps/@'+p.lat+','+p.lon+',3000m/data=!3m1!1e3">Open in Google Maps satellite</a>'+srcBlock(p));
  setHash(p.id);apply();if(fly)flyTo(p.lon,p.lat,Math.max(K,40))}
function showLine(l,fly){sel=null;if(!FOCUS)CEL.forEach(c=>c.el.classList.remove('csel'));trace(l);const sea=CATS[l.cat].line===2;
  openCard(KIND[l.cat],CATS[l.cat].c,'<h2>'+esc(l.name)+'</h2><span class="tag">'+(sea?'Active trade lane':STN[l.st])+'</span><dl>'+row(sea?'Volume':'Capacity',l.cap)+((l.st==='c'||l.st==='p')?row('Start-up',l.yr?'Target '+l.yr+' (verify)':'No firm date'):'')+'</dl>'+ioBlock(l)+newsBlock(l)+(l.note?'<p class="notep">'+esc(l.note)+'</p>':'')+
   '<p class="fine">Drawn schematically. For the surveyed route, switch on the full pipeline network layer.</p>'+srcBlock(l));
  setHash(l.id);apply();if(fly){const a=l.paths.flat();fit([d3.min(a,d=>d[0])-3,d3.min(a,d=>d[1])-3,d3.max(a,d=>d[0])+3,d3.max(a,d=>d[1])+3])}}
function showShip(s){const v=VT[s.l.cat];sel=null;HL=new Set();tracing=false;openCard(v[0]+' (simulated)',CATS[s.l.cat].c,'<h2>'+v[0]+' on '+esc(s.l.name)+'</h2><span class="tag">Illustrative, not a tracked vessel</span><dl>'+row('Lane volume',s.l.cap)+'</dl><p class="notep">'+v[1]+' '+esc(s.l.note)+'</p><p class="fine">Live ship positions need a paid tracking feed.</p>');apply()}
function fmt(n,u){return n?n+' '+u:'None'}
function countryMembers(n){const c=CEL.get(n);const set=new Set(PTS.filter(p=>p.country.split(' / ').includes(n)));
  // chokepoints carry no country: include those that sit inside the border
  if(c)for(const p of PTS)if(!p.country&&d3.geoContains(c.f,[p.lon,p.lat]))set.add(p);
  const names=new Set([...set].map(p=>p.name));
  for(const l of LNS){const touches=c&&l.paths.some(path=>path.some(pt=>d3.geoContains(c.f,pt)));
    const linked=l.ins.some(t=>names.has(t))||l.outs.some(t=>names.has(t));
    if(touches||linked)set.add(l)}
  return set}
function clearFocus(quiet){if(!FOCUS)return;FOCUS=null;CEL.forEach(c=>c.el.classList.remove('csel'));if(quiet!==true)apply()}
function focusUi(){const b=document.getElementById('focusbar');if(!b)return;
  document.querySelectorAll('#groups input').forEach(i=>{const k=i.value,em=i.parentNode.querySelector('em');if(!em||k==='ships'||k==='netg'||k==='neto')return;
    if(em.dataset.all==null)em.dataset.all=em.textContent;
    em.textContent=FOCUS?[...FOCUS.set].filter(o=>o.cat===k).length+' here':em.dataset.all;i.parentNode.classList.toggle('none',!!FOCUS&&![...FOCUS.set].some(o=>o.cat===k))});
  if(!FOCUS){b.classList.add('hidden');return}
  const pts=[...FOCUS.set].filter(o=>o.isP).length,lns=FOCUS.set.size-pts;
  b.classList.remove('hidden');b.querySelector('span').textContent='Focused on '+FOCUS.name+': '+pts+' sites, '+lns+' pipelines and sea lanes. Use the layers below to hide or show them.'}
function showCountry(n,fly){const c=CEL.get(n);const members=countryMembers(n);const list=[...members].filter(o=>o.isP);sel=null;
  CEL.forEach(x=>x.el.classList.remove('csel'));if(c)c.el.classList.add('csel');
  HL=new Set();tracing=false;FOCUS=members.size?{name:n,set:members}:null;
  // switch on every layer this country has, so nothing inside it is hidden or dimmed
  if(FOCUS){for(const o of members)on.cats.add(o.cat);on.cats.add('neto');on.cats.add('netg');on.st=new Set(S4);on.cap=0;on.fend=0;on.chk=false;document.getElementById('cap').value=0}
  const s=CSTAT[n];let h='<h2>'+esc(n)+'</h2>';
  if(s){const on_=+(s[0]-s[1]).toFixed(2),gn=+(s[2]-s[3]).toFixed(1);
    h+='<table class="bal"><tr><th></th><th>Produces</th><th>Uses</th><th>Net</th></tr><tr><td>Oil, million barrels/day</td><td>'+s[0]+'</td><td>'+s[1]+'</td><td class="'+(on_<0?'neg':'pos')+'">'+(on_>0?'+':'')+on_+'</td></tr><tr><td>Gas, billion cubic metres/year</td><td>'+s[2]+'</td><td>'+s[3]+'</td><td class="'+(gn<0?'neg':'pos')+'">'+(gn>0?'+':'')+gn+'</td></tr></table><p class="fine" style="margin:4px 0 0">Indicative recent-year balance. Negative net means an import need. Verify before use.</p>'}
  else h+='<p class="fine">No balance loaded for this country yet.</p>';
  if(list.length){const by={};list.forEach(p=>(by[p.cat]=by[p.cat]||[]).push(p));
    h+='<div class="notep">';for(const k of ALL)if(by[k])h+='<div class="io"><h4>'+CATS[k].label+' ('+by[k].length+')</h4><ul>'+by[k].map(p=>'<li><button class="lk" data-n="'+esc(p.name)+'">'+esc(p.name)+'</button><span>'+esc((p.cap||'').slice(0,34))+'</span></li>').join('')+'</ul></div>';h+='</div>'}
  else h+='<p class="notep">No mapped assets in this country.</p>';
  {const ls=[...members].filter(o=>!o.isP);if(ls.length){const by={};ls.forEach(l=>(by[l.cat]=by[l.cat]||[]).push(l));h+='<div class="notep">';for(const k of ALL)if(by[k])h+='<div class="io"><h4>'+CATS[k].label+' ('+by[k].length+')</h4><ul>'+by[k].map(l=>'<li><button class="lk" data-n="'+esc(l.name)+'">'+esc(l.name)+'</button><span>'+esc((l.cap||'').slice(0,34))+'</span></li>').join('')+'</ul></div>';h+='</div>'}}
  openCard('Country','--ink',h);apply();
  if(fly&&c){const b=c.b;if(b[1][0]>b[0][0]&&b[1][0]-b[0][0]<200)fit([b[0][0]-2,b[0][1]-2,b[1][0]+2,b[1][1]+2]);else if(list.length)fit([d3.min(list,p=>p.lon)-5,d3.min(list,p=>p.lat)-5,d3.max(list,p=>p.lon)+5,d3.max(list,p=>p.lat)+5])}}
document.getElementById('cbody').addEventListener('click',e=>{const b=e.target.closest('.lk');if(b){const o=IDX.get(b.dataset.n);if(o)o.isP?showPoint(o,true):showLine(o,true);return}
  const c=e.target.closest('.lkc');if(c)showCountry(c.dataset.c,true)});
document.getElementById('cx').onclick=()=>closeCard();svg.on('click',()=>{clearFocus(true);closeCard();document.getElementById('res').style.display='none'});
// ---- search
const q=document.getElementById('q'),res=document.getElementById('res');
const fold=t=>t.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\b(ein|el ain|al ain)\b/g,'ain').replace(/sukhna|sokhna|sukhnah/g,'sokhna').replace(/[^a-z0-9]+/g,' ').trim();
q.addEventListener('input',()=>{const s=fold(q.value);if(s.length<2){res.style.display='none';return}const words=s.split(' ');
  const hits=[];for(const n of new Set([...CEL.keys(),...Object.keys(CSTAT)]))if(fold(n).startsWith(s))hits.push(['c',{name:n},'Country view',0]);
  for(const p of PTS){const hay=p.hay||(p.hay=fold(p.name+' '+p.country+' '+(p.op||'')+' '+(p.cap||'')+' '+(p.own||'')+' '+(p.chr||'')+' '+(p.note||'')));if(words.every(w=>hay.includes(w)))hits.push(['p',p,KIND[p.cat]+(p.country?', '+p.country:''),fold(p.name).includes(words[0])?0:1])}
  for(const l of LNS){const hay=l.hay||(l.hay=fold(l.name+' '+(l.note||'')));if(words.every(w=>hay.includes(w)))hits.push(['l',l,KIND[l.cat],fold(l.name).includes(words[0])?0:1])}
  hits.sort((a,b)=>(a[3]||0)-(b[3]||0));
  res.innerHTML=hits.slice(0,12).map((h,i)=>'<button data-i="'+i+'">'+esc(h[1].name)+'<br><span>'+esc(h[2])+'</span></button>').join('')||'<button disabled>No match. Try a country, operator or a shorter name. If the asset is missing, ask for it to be added.</button>';
  res.style.display='block';res._h=hits});
res.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.disabled)return;const h=res._h[+b.dataset.i];res.style.display='none';q.blur();
  h[0]==='c'?showCountry(h[1].name,true):h[0]==='p'?showPoint(h[1],true):showLine(h[1],true)});
// ---- toggles
function togF(v){const f=document.getElementById('filters');const show=v==null?f.classList.contains('hidden'):v;if(show&&A.open)togA(false);f.classList.toggle('hidden',!show);document.getElementById('bFilters').setAttribute('aria-pressed',show)}
document.getElementById('bFilters').onclick=()=>{const willShow=document.getElementById('filters').classList.contains('hidden');if(willShow&&innerWidth<=860)closeCard();togF()};document.getElementById('fx').onclick=()=>togF(false);
document.getElementById('bSat').onclick=function(){satOn=!satOn;const im=document.getElementById('sat');if(satOn&&!im.getAttribute('href'))im.setAttribute('href',SAT);im.style.display=satOn?'':'none';svg.classed('sat',satOn);this.setAttribute('aria-pressed',satOn);document.getElementById('satctl').classList.toggle('hidden',!satOn);tiles()};
document.getElementById('satctl').addEventListener('click',e=>{const b=e.target.closest('[data-sat]');if(!b)return;SATM.mode=b.dataset.sat;document.querySelectorAll('#satctl [data-sat]').forEach(x=>x.setAttribute('aria-pressed',x===b));document.getElementById('satdate').classList.toggle('hidden',SATM.mode!=='daily');
  document.getElementById('sathelp').textContent={sharp:'High-resolution aerial and satellite imagery. Keep zooming in to see site detail. Image dates vary by place and can be several years old.',week:'Newest Landsat and Sentinel-2 passes from the past 8 days, about 30 metres. Zoom in to a site to load them. Cloud and gaps are normal.',daily:'One wide-area image per day, about 250 metres. Good for weather, smoke and large changes, not site detail.'}[SATM.mode];tiles()});
document.getElementById('satdate').addEventListener('change',e=>{SATM.date=e.target.value||null;tiles()});
{const sd=document.getElementById('satdate');sd.max=daysAgo(1);sd.min='2020-01-01';sd.value=daysAgo(1)}
document.getElementById('zi').onclick=()=>svg.transition().duration(250).call(zoom.scaleBy,1.8);
document.getElementById('zo').onclick=()=>svg.transition().duration(250).call(zoom.scaleBy,1/1.8);
addEventListener('keydown',e=>{if(e.key==='Escape'){closeCard();res.style.display='none'}});
addEventListener('resize',setExtent);
// ---- news, review queue, live vessels
const NEWSBY=new Map();NEWS.forEach(n=>{const a=NEWSBY.get(n.record)||[];a.push(n);NEWSBY.set(n.record,a)});
const dfmt=d=>d?new Date(d+'T00:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}):'Undated';
const safeUrl=u=>/^https?:\/\//.test(u||'')?u:'#';
function newsItem(n,withRecord){return'<li><div><a class="nl" target="_blank" rel="noopener" href="'+esc(safeUrl(n.url))+'">'+esc(n.headline)+'</a><span class="meta">'+(withRecord&&IDX.get(n.record)?'<button class="lk sm" data-n="'+esc(n.record)+'">'+esc(n.record)+'</button>. ':'')+esc(n.source||'')+', '+dfmt(n.published_on)+'</span>'+(n.summary?'<span class="meta">'+esc(n.summary)+'</span>':'')+'</div></li>'}
function newsBlock(o){const a=(NEWSBY.get(o.name)||[]).slice().sort((x,y)=>(y.published_on||'').localeCompare(x.published_on||''));
  return a.length?'<div class="notep"><div class="io"><h4>Latest news</h4><ul class="al">'+a.slice(0,4).map(n=>newsItem(n)).join('')+'</ul></div></div>':''}
const FIELD={status:'Status',startup_year:'Start-up year',charter_end_year:'Charter end',capacity_text:'Capacity',operator:'Operator',vessel_owner:'Vessel owner',charterer:'Charterer',note:'Note'};
const fval=(f,v)=>f==='status'?(STN[v]||v):(v==null||v===''?'none':v);
let LIVE=[],liveAt=null;const glv=d3.select('#live');
const VCOL={tanker:'--crude',crude:'--crude',lng:'--gas',product:'--prod',rig:'--choke',fsru:'--fsru'};
const VNAME={tanker:'Tanker',crude:'Crude tanker',lng:'LNG carrier',product:'Product tanker',rig:'Drilling rig',fsru:'Floating terminal',other:'Vessel'};
function setVessels(rows){glv.selectAll('*').remove();
  LIVE=(rows||[]).filter(v=>v.lat!=null&&v.lon!=null).map(v=>{const o=Object.assign({},v,{x:X(+v.lon),y:Y(+v.lat)});o.kind=v.kind||(/\bLNG\b|GAS|FSRU/i.test(v.name||'')?'lng':'tanker');
    o.el=glv.append('path').attr('class','ship lv').attr('d','M-6 0L-2.5-2.8H4L6.5 0 4 2.8H-2.5Z').attr('fill','var('+(VCOL[o.kind]||'--port')+')').on('click',e=>{e.stopPropagation();showVessel(o)}).node();return o});
  liveAt=LIVE.length?d3.max(LIVE,v=>v.updated_at):null;
  const lab=document.querySelector('#groups input[value="ships"]');if(lab){lab.parentNode.querySelector('b').textContent=LIVE.length?'Vessels (live positions)':'Vessels (simulated)';lab.parentNode.querySelector('em').textContent=(LIVE.length||SHIPS.length).toLocaleString()}
  document.getElementById('note').textContent=(LIVE.length?LIVE.length+' live vessel positions, last update '+new Date(liveAt).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})+'. Coastal coverage only':'Vessels simulated')+'. Figures approximate. Data: '+(window.DATA_SOURCE||'bundled snapshot')+'.';
  scaleMarks();apply()}
function showVessel(v){sel=null;HL=new Set();tracing=false;const mins=Math.round((Date.now()-new Date(v.updated_at))/6e4);
  openCard(VNAME[v.kind]||'Vessel',VCOL[v.kind]||'--port','<h2>'+esc(v.name||('Vessel '+v.mmsi))+'</h2><span class="tag">Live position</span><dl>'+row('Type',VNAME[v.kind]||v.ship_type)+row('Speed',v.speed!=null?(+v.speed).toFixed(1)+' knots':'')+row('Heading',v.course!=null?Math.round(v.course)+' degrees':'')+row('Destination',v.destination)+row('Last seen',mins<90?mins+' minutes ago':Math.round(mins/60)+' hours ago')+row('Position',(+v.lat).toFixed(3)+', '+(+v.lon).toFixed(3))+row('Identifier',v.mmsi)+'</dl><p class="fine">Position broadcast by the vessel and received by shore stations. Destination is typed in by the crew and is often out of date.</p>');apply()}
if(window.TRACKER_REFRESH_VESSELS)setInterval(()=>{if(document.hidden)return;window.TRACKER_REFRESH_VESSELS().then(r=>{if(r)setVessels(r)}).catch(()=>{})},60000);
// ---- satellite modes
const SATM={mode:'sharp',date:null};
function daysAgo(n){return new Date(Date.now()-n*864e5).toISOString().slice(0,10)}
function satLayers(){const sharp={k:'sharp',base:1024,px:256,max:13,min:4,cap:150,url:(z,y,x)=>TILE+z+'/'+y+'/'+x+'.jpg'};
  const G='https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/';
  if(SATM.mode==='daily'){const d=SATM.date||daysAgo(1);return[{k:'daily'+d,base:1638.4,px:512,max:8,min:1,cap:60,url:(z,y,x)=>G+'VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/'+d+'/250m/'+z+'/'+y+'/'+x+'.jpg'}]}
  if(SATM.mode==='week'){const out=[sharp];for(let i=9;i>=2;i--){const d=daysAgo(i);for(const L of['HLS_L30_Nadir_BRDF_Adjusted_Reflectance','HLS_S30_Nadir_BRDF_Adjusted_Reflectance'])
    out.push({k:L.slice(4,7)+d,base:1638.4,px:512,max:11,min:7,cap:12,url:(z,y,x)=>G+L+'/default/'+d+'/31.25m/'+z+'/'+y+'/'+x+'.png'})}return out}
  // Detail: cloud-free composite when zoomed out, sub-metre aerial and satellite imagery when zoomed in.
  return[sharp,{k:'detail',merc:true,min:10,max:18,cap:80,url:(z,y,x)=>ESRI+z+'/'+y+'/'+x}]}
// ---- analysis panel: totals in view, asset list, project pipeline, companies, charters
const A={open:false,tab:'view',scope:'view',type:'all',sort:'cap',co:null};
const NUM=p=>p.cat==='ref'?(p.kbd||0):p.cat==='lngx'?(parseFloat(p.cap)||0):0;
const INPROG=p=>p.es==='c'||p.es==='p';
function viewTest(){const t=d3.zoomTransform(svg.node()),[w,h]=size();const mob=w<=860;
  const l=mob?0:leftPad(),x0=(l-t.x)/t.k,x1=(w-t.x)/t.k,y0=-t.y/t.k,y1=(h-t.y)/t.k;return p=>p.x>=x0&&p.x<=x1&&p.y>=y0&&p.y<=y1}
function scoped(){if(A.scope==='all')return PTS.slice();const f=viewTest();return PTS.filter(f)}
function companies(p){if(p.cat==='pwr'||p.cat==='choke'||p.cat==='port')return[];
  const s=((p.op||'')+(p.own?' / '+p.own:'')).replace(/\(/g,' / ').replace(/\)/g,'');
  return[...new Set(s.split(/\s*(?:\/|;|,|\bwith\b)\s*/).map(t=>t.replace(/-led|-backed| and partners| and others| consortium| minority| redevelopment| entering as operator/gi,'').trim())
    .filter(t=>t.length>1&&!/^(state|many|others|owned|not assigned|not known|terminal users|partners|under federal trusteeship|brunei)$/i.test(t)))]}
PTS.forEach(p=>p.cos=companies(p));
const nf=(n,d)=>n.toLocaleString('en-GB',{maximumFractionDigits:d==null?0:d});
const mbd=k=>nf(k/1000,1)+' million barrels/day';
function sumBy(list,cat,pred){return d3.sum(list.filter(p=>p.cat===cat&&pred(p)),NUM)}
function aRow(p,right){return'<li><div><button class="lk" data-n="'+esc(p.name)+'">'+esc(p.name)+'</button><span class="meta">'+KIND[p.cat]+(p.country?', '+esc(p.country):'')+(p.es!=='o'?', '+STN[p.es].toLowerCase():'')+'</span></div><span class="rt">'+esc(right||'')+'</span></li>'}
function scopeBar(){return'<div class="seg" role="group" aria-label="Scope"><button data-scope="view" aria-pressed="'+(A.scope==='view')+'">Map window</button><button data-scope="all" aria-pressed="'+(A.scope==='all')+'">Whole world</button></div>'}
function barChart(title,unit,rows,color){const max=d3.max(rows,r=>r[1])||1;
  return'<div class="bc"><h4>'+title+'</h4>'+rows.map(r=>'<div class="bcr" title="'+r[0]+': '+nf(r[1],1)+' '+unit+'"><span class="bcl">'+r[0]+'</span><span class="bct"><i style="width:'+(r[1]/max*100).toFixed(1)+'%;background:var('+color+')"></i></span><span class="bcv">'+(r[1]?nf(r[1],1):'0')+'</span></div>').join('')+'<p class="fine" style="margin:2px 0 0">'+unit+', by target start-up year</p></div>'}
function tile(label,big,small){return'<div class="tile"><span>'+label+'</span><b>'+big+'</b><em>'+small+'</em></div>'}
function renderAn(){if(!A.open)return;const list=scoped();const body=document.getElementById('abody');let h='';
  document.querySelectorAll('#atabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===A.tab));
  if(A.tab==='view'){
    const op=p=>p.es==='o',ip=INPROG;const fs=list.filter(p=>p.cat==='fsru');
    h=scopeBar()+'<div class="tiles">'+
     tile('Refining capacity',mbd(sumBy(list,'ref',op)),list.filter(p=>p.cat==='ref'&&op(p)).length+' operating sites. '+mbd(sumBy(list,'ref',ip))+' at sites in progress')+
     tile('LNG export capacity',nf(sumBy(list,'lngx',op),1)+' million tonnes/year',list.filter(p=>p.cat==='lngx'&&op(p)).length+' operating plants. '+nf(sumBy(list,'lngx',ip),1)+' in progress')+
     tile('LNG import points',list.filter(p=>p.cat==='lngi').length+' onshore, '+fs.length+' floating',fs.filter(p=>p.end&&p.end<=2028).length+' floating charters end by 2028')+
     tile('Fields',list.filter(p=>p.cat==='oil'||p.cat==='gas').length+' offshore, '+list.filter(p=>p.cat==='ons').length+' onshore',list.filter(p=>(p.cat==='oil'||p.cat==='gas'||p.cat==='ons')&&ip(p)).length+' in development')+
     tile('Gas-to-power demand',(n=>n+(n===1?' marker':' markers'))(list.filter(p=>p.cat==='pwr').length),list.filter(p=>p.cat==='pwr'&&/^High/.test(p.role||'')).length+' rated high import need')+
     tile('Records checked',list.filter(p=>p.chk).length+' of '+list.length,'The rest are unverified. See each card')+'</div>';
    const next=list.filter(p=>ip(p)&&p.yr).sort((a,b)=>a.yr-b.yr||NUM(b)-NUM(a)).slice(0,8);
    h+='<h3>Starting up next</h3>'+(next.length?'<ul class="al">'+next.map(p=>aRow(p,'Target '+p.yr)).join('')+'</ul>':'<p class="fine">No dated projects in this window. Zoom out or switch to whole world.</p>');
    h+='<p class="fine">Totals cover every asset type in scope, whatever layers are switched on. Capacities are gross nameplate and unverified unless the card says checked.</p>'}
  else if(A.tab==='assets'){
    let rows=list.filter(p=>A.type==='all'||p.cat===A.type);
    const key={cap:p=>-NUM(p),name:p=>p.name,country:p=>p.country||'~',yr:p=>p.yr||9999,end:p=>p.end||9999}[A.sort];
    rows.sort((a,b)=>{const x=key(a),y=key(b);return x<y?-1:x>y?1:a.name.localeCompare(b.name)});
    h=scopeBar()+'<div class="ctl"><label>Type<select id="atype"><option value="all">All types</option>'+Object.keys(KIND).filter(k=>!CATS[k].line).map(k=>'<option value="'+k+'"'+(A.type===k?' selected':'')+'>'+KIND[k]+'</option>').join('')+'</select></label>'+
     '<label>Sort by<select id="asort">'+[['cap','Capacity'],['name','Name'],['country','Country'],['yr','Start-up year'],['end','Charter end']].map(o=>'<option value="'+o[0]+'"'+(A.sort===o[0]?' selected':'')+'>'+o[1]+'</option>').join('')+'</select></label></div>'+
     '<div class="ctl"><span class="fine" style="margin:0">'+rows.length+' assets</span><button class="chip" id="acsv">Copy as spreadsheet rows</button></div>'+
     (rows.length?'<ul class="al">'+rows.slice(0,200).map(p=>aRow(p,A.sort==='end'&&p.end?'Ends '+p.end:A.sort==='yr'&&p.yr?'Target '+p.yr:(p.cap||'').slice(0,40))).join('')+'</ul>':'<p class="fine">Nothing of this type in the map window. Zoom out or switch to whole world.</p>')+
     (rows.length>200?'<p class="fine">Showing the first 200. Narrow the type or zoom in.</p>':'');
    A.rows=rows}
  else if(A.tab==='proj'){
    const yrs=[2026,2027,2028,2029,2030,2031,2032];const pr=list.filter(p=>p.st==='c'||p.st==='p');
    const by=(cat)=>yrs.map(y=>[String(y),d3.sum(pr.filter(p=>p.cat===cat&&p.yr===y),NUM)]);
    const lines=A.scope==='all'?LNS.filter(l=>l.st==='c'||l.st==='p'):[];
    h=scopeBar()+barChart('LNG export capacity starting up','Million tonnes/year',by('lngx'),'--lngx')+barChart('Refining capacity starting up','Thousand barrels/day',by('ref'),'--ref');
    const all=pr.map(p=>[p.yr||0,p]).concat(lines.map(l=>[l.yr||0,l])).sort((a,b)=>(a[0]||9999)-(b[0]||9999));
    let cur=null;h+='<h3>Projects by target year ('+all.length+')</h3><ul class="al">';
    for(const[y,o]of all){if(y!==cur){cur=y;h+='</ul><h4 class="yh">'+(y||'No firm date')+'</h4><ul class="al">'}
      h+=o.isP?aRow(o,(o.cap||'').slice(0,34)):'<li><div><button class="lk" data-n="'+esc(o.name)+'">'+esc(o.name)+'</button><span class="meta">'+KIND[o.cat]+', '+STN[o.st].toLowerCase()+'</span></div><span class="rt">'+esc((o.cap||'').slice(0,34))+'</span></li>'}
    h+='</ul><p class="fine">Years are operator targets and slip often. For sites being expanded, the figure is the site total, not only the added capacity.</p>'}
  else if(A.tab==='co'){
    const m=new Map();for(const p of list)for(const c of p.cos){const e=m.get(c)||{n:c,a:[],ref:0,lng:0};e.a.push(p);if(p.cat==='ref')e.ref+=NUM(p);if(p.cat==='lngx')e.lng+=NUM(p);m.set(c,e)}
    const cos=[...m.values()].filter(e=>e.a.length>1||A.co===e.n).sort((a,b)=>b.a.length-a.a.length||b.ref+b.lng*30-a.ref-a.lng*30);
    const selc=A.co&&m.get(A.co);
    h=scopeBar();
    if(selc){h+='<div class="ctl"><h3 style="margin:0">'+esc(selc.n)+'</h3><button class="chip" id="acoback">All companies</button></div><p class="fine" style="margin:0 0 6px">'+selc.a.length+' sites'+(selc.ref?'. Refining '+nf(selc.ref)+' thousand barrels/day':'')+(selc.lng?'. LNG export '+nf(selc.lng,1)+' million tonnes/year':'')+'. Highlighted on the map.</p><ul class="al">'+selc.a.slice().sort((a,b)=>NUM(b)-NUM(a)).map(p=>aRow(p,(p.cap||'').slice(0,34))).join('')+'</ul>'}
    else h+=(cos.length?'<ul class="al co">'+cos.slice(0,60).map(e=>'<li><div><button class="lk" data-co="'+esc(e.n)+'">'+esc(e.n)+'</button><span class="meta">'+e.a.length+' sites'+(e.ref?', refining '+nf(e.ref)+' thousand barrels/day':'')+(e.lng?', LNG export '+nf(e.lng,1)+' million tonnes/year':'')+'</span></div></li>').join('')+'</ul>':'<p class="fine">No company has two or more sites in this window. Zoom out or switch to whole world.</p>');
    h+='<p class="fine">Gross capacity of sites a company operates, partners in or owns the vessel for. This is not equity share. Company names are read from the operator field and may split or merge imperfectly.</p>'}
  else if(A.tab==='news'){
    const a=NEWS.slice().sort((x,y)=>(y.published_on||'').localeCompare(x.published_on||''));
    h=a.length?'<ul class="al">'+a.slice(0,80).map(n=>newsItem(n,true)).join('')+'</ul>':'<p class="fine">No news loaded yet. The daily scan adds dated, sourced headlines here and on each record.</p>';
    h+='<p class="fine">Headlines come from a daily scan of trade press and company announcements. Each links to its source. Coverage is limited to what is publicly reported.</p>'}
  else if(A.tab==='review'){
    const a=PROPOSALS.filter(p=>p.status==='pending');
    h=a.length?'<ul class="al">'+a.map(p=>'<li><div>'+(IDX.get(p.record)?'<button class="lk" data-n="'+esc(p.record)+'">'+esc(p.record)+'</button>':'<b>'+esc(p.record)+'</b>')+'<span class="chg">'+(FIELD[p.field]||esc(p.field))+': <s>'+esc(fval(p.field,p.current_value))+'</s> to <b>'+esc(fval(p.field,p.proposed_value))+'</b></span><span class="meta">'+esc(p.reason||'')+'</span><span class="meta"><a class="nl sm" target="_blank" rel="noopener" href="'+esc(safeUrl(p.source_url))+'">Source</a>, proposed '+dfmt((p.created_at||'').slice(0,10))+'</span></div></li>').join('')+'</ul>':'<p class="fine">Nothing is waiting for review.</p>';
    h+='<p class="fine">The daily scan never changes a record on its own. It proposes the change here. Approve or reject each one in the database, or tell Claude, and approved changes are applied to the record.</p>'}
  else if(A.tab==='chart'){
    const fs=list.filter(p=>p.cat==='fsru');const g=[['Ending by 2028',p=>p.end&&p.end<=2028],['Ending 2029 to 2032',p=>p.end>2028&&p.end<=2032],['Ending after 2032',p=>p.end>2032],['Owned outright or no fixed end known',p=>!p.end]];
    h=scopeBar()+(fs.length?'':'<p class="fine">No floating terminals in this window. Zoom out or switch to whole world.</p>');
    for(const[t,f]of g){const a=fs.filter(f).sort((x,y)=>(x.end||0)-(y.end||0));if(!a.length)continue;
      h+='<h3>'+t+' ('+a.length+')</h3><ul class="al">'+a.map(p=>'<li><div><button class="lk" data-n="'+esc(p.name)+'">'+esc(p.name)+'</button><span class="meta">'+esc(p.country)+(p.own?'. Owner: '+esc(p.own):'')+(p.chr?'. Charterer: '+esc(p.chr):'')+(p.chk?'. Checked':'. Unverified')+'</span></div><span class="rt">'+(p.end?'About '+p.end:'')+'</span></li>').join('')+'</ul>'}
    h+='<p class="fine">End years are indicative and come from public announcements. Where a site hosts several units, the earliest known end is shown. Verify before acting.</p>'}
  body.innerHTML=h}
function leftPad(){for(const id of['filters','analysis']){const e=document.getElementById(id);if(!e.classList.contains('hidden'))return e.offsetWidth+20}return 0}
function togA(v){const a=document.getElementById('analysis');const show=v==null?a.classList.contains('hidden'):v;if(show){togF(false);if(innerWidth<=860&&document.getElementById('card').style.display==='flex')closeCard()}
  a.classList.toggle('hidden',!show);A.open=show;document.getElementById('bAn').setAttribute('aria-pressed',show);if(show)renderAn()}
document.getElementById('bAn').onclick=()=>togA();document.getElementById('ax').onclick=()=>togA(false);
document.getElementById('atabs').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;A.tab=b.dataset.tab;document.getElementById('abody').scrollTop=0;renderAn()});
document.getElementById('abody').addEventListener('change',e=>{if(e.target.id==='atype')A.type=e.target.value;if(e.target.id==='asort')A.sort=e.target.value;renderAn()});
document.getElementById('abody').addEventListener('click',e=>{
  const s=e.target.closest('[data-scope]');if(s){A.scope=s.dataset.scope;renderAn();return}
  const c=e.target.closest('[data-co]');if(c){A.co=c.dataset.co;const a=PTS.filter(p=>p.cos.includes(A.co));sel=null;document.getElementById('card').style.display='none';HL=new Set(a);tracing=a.length>0;apply();
    if(a.length&&A.scope==='all')fit([d3.min(a,p=>p.lon)-6,Math.max(-80,d3.min(a,p=>p.lat)-6),d3.max(a,p=>p.lon)+6,Math.min(84,d3.max(a,p=>p.lat)+6)]);return}
  if(e.target.id==='acoback'){A.co=null;HL=new Set();tracing=false;apply();return}
  if(e.target.id==='acsv'){const q=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';
    const csv=[['Name','Type','Country','Status','Capacity','Operator','Start-up year','Vessel owner','Charterer','Charter end','Latitude','Longitude','Checked','Source']].concat((A.rows||[]).map(p=>[p.name,KIND[p.cat],p.country,STN[p.es],p.cap,p.op,p.yr,p.own,p.chr,p.end,p.lat,p.lon,p.chk||'No',p.src])).map(r=>r.map(q).join('\t')).join('\n');
    const b=e.target;const done=t=>{b.textContent=t;setTimeout(()=>{b.textContent='Copy as spreadsheet rows'},1800)};
    (navigator.clipboard&&navigator.clipboard.writeText?navigator.clipboard.writeText(csv):Promise.reject()).then(()=>done('Copied. Paste into a spreadsheet'),()=>done('Copy was blocked by the browser'));return}
  const n=e.target.closest('.lk[data-n]');if(n){const o=IDX.get(n.dataset.n);if(o){if(innerWidth<=860)togA(false);o.isP?showPoint(o,true):showLine(o,true)}}});
// mobile: tap a sheet header to make it taller
document.querySelectorAll('.panel header').forEach(h=>h.addEventListener('click',e=>{if(e.target.closest('button')||innerWidth>860)return;h.parentNode.classList.toggle('tall')}));
document.getElementById('bWorld').onclick=()=>fit(REG.World);
document.getElementById('focusclear').onclick=()=>{clearFocus();closeCard()};
// deep link: #asset-id opens that record
function setHash(id){try{history.replaceState(null,'',id?'#'+id:location.pathname+location.search)}catch(e){}}
// ---- start
setExtent();if(innerWidth<=860)togF(false);
fit(innerWidth<=860?[-10,-8,80,52]:[-170,-58,180,78],0);scaleMarks();apply();
if(still)tickShips(T0);else requestAnimationFrame(loop);
{const id=decodeURIComponent(location.hash.slice(1));const o=id&&[...PTS,...LNS].find(x=>x.id===id);if(o)setTimeout(()=>o.isP?showPoint(o,true):showLine(o,true),300)}
setVessels(window.VESSELS||[]);
void 'Vessels simulated. Figures approximate. Data: '+(window.DATA_SOURCE||'bundled snapshot')+'.';

