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
  CEL.set(n,{el:el.node(),b:d3.geoBounds(f)})});
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
  g.select('.g').attr('fill','var('+c.c+')');g.select('text').text(p.name);
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
const zoom=d3.zoom().scaleExtent([.3,90]).on('zoom',e=>{root.attr('transform',e.transform);K=e.transform.k;scaleMarks()}).on('end',()=>{cluster();tiles()});
svg.call(zoom).on('dblclick.zoom',null);
// ---- satellite tiles: Sentinel-2 cloudless (EOX), sharpens as you zoom, about 10 metres per pixel at full zoom
const ZMAX=2000,TILE='https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless/default/WGS84/';
let satOn=false;const gt=d3.select('#tiles'),TL=new Map();
function tiles(){
  if(!satOn){TL.forEach(e=>e.remove());TL.clear();return}
  const t=d3.zoomTransform(svg.node()),[w,h]=size(),dpr=Math.min(2,window.devicePixelRatio||1);
  const z=Math.min(13,Math.ceil(Math.log2(W*t.k*dpr/512)));const keep=new Set();
  if(z>=4){const s=1024/2**z,nx=2**(z+1),ny=2**z;
    const x0=Math.max(0,Math.floor(-t.x/t.k/s)),x1=Math.min(nx-1,Math.floor((w-t.x)/t.k/s)),y0=Math.max(0,Math.floor(-t.y/t.k/s)),y1=Math.min(ny-1,Math.floor((h-t.y)/t.k/s));
    if((x1-x0+1)*(y1-y0+1)<=150)for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const k=z+'/'+y+'/'+x;keep.add(k);
      if(!TL.has(k)){const el=gt.append('image').attr('href',TILE+k+'.jpg').attr('x',x*s).attr('y',y*s).attr('width',s*1.003).attr('height',s*1.003).attr('preserveAspectRatio','none').node();
        el.addEventListener('error',()=>{el.remove();TL.delete(k)});TL.set(k,el)}}}
  const old=[...TL.keys()].filter(k=>!keep.has(k));
  setTimeout(()=>old.forEach(k=>{if(!keep.has(k)||!satOn){const e=TL.get(k);if(e){e.remove();TL.delete(k)}}}),keep.size?900:0)}
function scaleMarks(){MS=Math.max(.5,Math.min(1.25,.45+K*.11))/K;
  for(const p of PTS)p.el.setAttribute('transform','translate('+p.x+','+p.y+') scale('+MS*p.sf+')');
  for(const c of CL)c.el.setAttribute('transform','translate('+c.x+','+c.y+') scale('+1/K+')');
  svg.classed('lab',K>=4.5).classed('far',K<1.6);if(still)tickShips(T0)}
function cluster(){gc.selectAll('*').remove();CL=[];for(const p of PTS)p.cl=false;
  if(K<5&&!tracing){const cell=34/K,m=new Map();
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
  const mob=w<=860;const padB=mob&&document.getElementById('card').style.display==='flex'?h*.5:0;
  const padL=!mob&&!document.getElementById('filters').classList.contains('hidden')?340:0;
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
    p.vis=v||h;p.el.setAttribute('class','mk st-'+s+(s!==p.st?' new':'')+(h?' hl':'')+(sel===p.el?' sel':''))}
  for(const l of LNS){const s=l.es=est(l);const h=HL.has(l);l.vis=(on.cats.has(l.cat)&&on.st.has(s)&&!on.chk)||h;
    for(const e of l.segs)e.setAttribute('class','ln '+l.cat+' st-'+s+(s!==l.st?' new':'')+(h?' hl':''));for(const e of l.els)e.style.display=l.vis?'':'none'}
  for(const s of SHIPS)s.el.style.display=(on.cats.has('ships')&&s.l.vis&&!tracing)?'':'none';
  document.getElementById('gemg').style.display=on.cats.has('netg')?'':'none';document.getElementById('geml').style.display=on.cats.has('neto')?'':'none';
  svg.classed('tracing',tracing).classed('hlab',tracing&&HL.size<=10);
  document.querySelectorAll('#groups input').forEach(i=>i.checked=on.cats.has(i.value));
  document.querySelectorAll('#stat .chip').forEach(c=>c.setAttribute('aria-pressed',on.st.has(c.dataset.s)));
  GRPS.forEach(([g])=>{const ks=ALL.filter(k=>CATS[k].grp===g),n=ks.filter(k=>on.cats.has(k)).length;
    document.querySelector('#chain [data-g="'+g+'"]').setAttribute('aria-pressed',n===0?'false':n===ks.length?'true':'mixed')});
  document.getElementById('capv').textContent=on.cap?on.cap+' thousand barrels/day':'All';
  document.getElementById('yrv').textContent=on.year===2026?'Today':on.year+' if targets hold';
  cluster();if(still)tickShips(T0)}
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
  pr.addEventListener('click',e=>{const b=e.target.closest('.chip');if(!b)return;const p=PRE[b.textContent];closeCard(true);on.cats=new Set(p[0]);on.st=new Set(p[1]);on.fend=p[2]||0;on.chk=!!p[3];on.cap=0;document.getElementById('cap').value=0;apply()});
  const rg=document.getElementById('regions');Object.keys(REG).forEach(n=>rg.insertAdjacentHTML('beforeend','<button class="chip">'+n+'</button>'));
  rg.addEventListener('click',e=>{const b=e.target.closest('.chip');if(!b)return;if(innerWidth<=860)togF(false);fit(REG[b.textContent])});
  document.getElementById('yr').addEventListener('input',e=>{on.year=+e.target.value;apply()});
  document.getElementById('cap').addEventListener('input',e=>{on.cap=+e.target.value;apply()});
  document.getElementById('zw').onclick=()=>fit(REG.World);
})();
// ---- cards
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function openCard(kind,color,html){document.getElementById('ckind').innerHTML='<span class="tag kind" style="background:var('+color+');margin:0">'+kind+'</span>';
  document.getElementById('cbody').innerHTML=html;document.getElementById('card').style.display='flex';document.getElementById('cbody').scrollTop=0;if(innerWidth<=860)togF(false)}
function closeCard(quiet){document.getElementById('card').style.display='none';sel=null;HL=new Set();tracing=false;CEL.forEach(c=>c.el.classList.remove('csel'));if(quiet!==true)apply()}
function row(k,v){return v?'<dt>'+k+'</dt><dd>'+esc(v)+'</dd>':''}
function linkList(title,arr,typ){let items=arr;let cls='';if(!items.length){if(!typ)return'';items=[typ];cls=' class="typ"'}
  return'<div class="io"><h4>'+title+'</h4><ul'+cls+'>'+items.map(t=>{const o=IDX.get(t);return o?'<li><button class="lk" data-n="'+esc(t)+'">'+esc(t)+'</button><span>'+KIND[o.cat]+'</span></li>':'<li>'+esc(t)+'</li>'}).join('')+'</ul></div>'}
function ioBlock(o){const t=TYP[o.cat]||['',''];const n=chain(o).size-1;
  return'<div class="notep">'+linkList('Supplied by',o.ins,t[0])+linkList('Delivers to',o.outs,t[1])+(n?'<p class="fine" style="margin-top:6px">'+n+' linked '+(n===1?'asset is':'assets are')+' highlighted on the map. The rest is dimmed.</p>':'')+'</div>'}
function srcBlock(o){return o.chk?'<p class="fine"><b>Checked '+o.chk+'.</b> Source: '+esc(o.src)+'.</p>':'<p class="fine"><b>Not yet checked.</b> From general knowledge to mid-2026. Verify before use.</p>'}
function trace(o){HL=chain(o);tracing=HL.size>1;if(!tracing)HL=new Set()}
function showPoint(p,fly){sel=p.el;CEL.forEach(c=>c.el.classList.remove('csel'));trace(p);
  const capL=p.cat==='fsru'?'Unit':p.cat==='choke'?'Flow':'Capacity';const pw=p.cat==='pwr';const inprog=p.st==='c'||p.st==='p';
  openCard(KIND[p.cat],CATS[p.cat].c,'<h2>'+esc(p.name)+'</h2><span class="tag">'+STN[p.st]+'</span>'+(p.country?'<button class="tag lkc" data-c="'+esc(p.country.split(' / ')[0])+'">'+esc(p.country)+'</button>':'')+
   '<dl>'+row(capL,p.cap)+row(pw?'Gas supply':p.cat==='fsru'?'Terminal':'Operator',p.op)+row('Vessel owner',p.own)+row('Charterer',p.chr)+(p.cat==='fsru'&&p.term?row('Charter end',p.end?'About '+p.end+' (verify)':'No fixed end known'):'')+row(pw?'Import need':'Trade role',p.role)+(inprog?row('Start-up',p.yr?'Target '+p.yr+' (verify)':'No firm date'):'')+row('Position',p.lat.toFixed(2)+', '+p.lon.toFixed(2)+' (approximate)')+'</dl>'+
   ioBlock(p)+(p.term?'<p class="notep">'+esc(p.term)+'</p>':'')+(p.note?'<p class="notep">'+esc(p.note)+'</p>':'')+
   '<a class="sl" target="_blank" rel="noopener" href="https://www.google.com/maps/@'+p.lat+','+p.lon+',9000m/data=!3m1!1e3">Open site in satellite imagery</a>'+srcBlock(p));
  apply();if(fly)flyTo(p.lon,p.lat,Math.max(K,40))}
function showLine(l,fly){sel=null;CEL.forEach(c=>c.el.classList.remove('csel'));trace(l);const sea=CATS[l.cat].line===2;
  openCard(KIND[l.cat],CATS[l.cat].c,'<h2>'+esc(l.name)+'</h2><span class="tag">'+(sea?'Active trade lane':STN[l.st])+'</span><dl>'+row(sea?'Volume':'Capacity',l.cap)+((l.st==='c'||l.st==='p')?row('Start-up',l.yr?'Target '+l.yr+' (verify)':'No firm date'):'')+'</dl>'+ioBlock(l)+(l.note?'<p class="notep">'+esc(l.note)+'</p>':'')+
   '<p class="fine">Drawn schematically. For the surveyed route, switch on the full pipeline network layer.</p>'+srcBlock(l));
  apply();if(fly){const a=l.paths.flat();fit([d3.min(a,d=>d[0])-3,d3.min(a,d=>d[1])-3,d3.max(a,d=>d[0])+3,d3.max(a,d=>d[1])+3])}}
function showShip(s){const v=VT[s.l.cat];sel=null;HL=new Set();tracing=false;openCard(v[0]+' (simulated)',CATS[s.l.cat].c,'<h2>'+v[0]+' on '+esc(s.l.name)+'</h2><span class="tag">Illustrative, not a tracked vessel</span><dl>'+row('Lane volume',s.l.cap)+'</dl><p class="notep">'+v[1]+' '+esc(s.l.note)+'</p><p class="fine">Live ship positions need a paid tracking feed.</p>');apply()}
function fmt(n,u){return n?n+' '+u:'None'}
function showCountry(n,fly){const c=CEL.get(n);const list=PTS.filter(p=>p.country.split(' / ').includes(n));sel=null;
  CEL.forEach(x=>x.el.classList.remove('csel'));if(c)c.el.classList.add('csel');
  HL=new Set(list);tracing=list.length>0;
  const s=CSTAT[n];let h='<h2>'+esc(n)+'</h2>';
  if(s){const on_=+(s[0]-s[1]).toFixed(2),gn=+(s[2]-s[3]).toFixed(1);
    h+='<table class="bal"><tr><th></th><th>Produces</th><th>Uses</th><th>Net</th></tr><tr><td>Oil, million barrels/day</td><td>'+s[0]+'</td><td>'+s[1]+'</td><td class="'+(on_<0?'neg':'pos')+'">'+(on_>0?'+':'')+on_+'</td></tr><tr><td>Gas, billion cubic metres/year</td><td>'+s[2]+'</td><td>'+s[3]+'</td><td class="'+(gn<0?'neg':'pos')+'">'+(gn>0?'+':'')+gn+'</td></tr></table><p class="fine" style="margin:4px 0 0">Indicative recent-year balance. Negative net means an import need. Verify before use.</p>'}
  else h+='<p class="fine">No balance loaded for this country yet.</p>';
  if(list.length){const by={};list.forEach(p=>(by[p.cat]=by[p.cat]||[]).push(p));
    h+='<div class="notep">';for(const k of ALL)if(by[k])h+='<div class="io"><h4>'+CATS[k].label+' ('+by[k].length+')</h4><ul>'+by[k].map(p=>'<li><button class="lk" data-n="'+esc(p.name)+'">'+esc(p.name)+'</button><span>'+esc((p.cap||'').slice(0,34))+'</span></li>').join('')+'</ul></div>';h+='</div>'}
  else h+='<p class="notep">No mapped assets in this country.</p>';
  openCard('Country','--ink',h);apply();
  if(fly&&c){const b=c.b;if(b[1][0]>b[0][0]&&b[1][0]-b[0][0]<200)fit([b[0][0]-2,b[0][1]-2,b[1][0]+2,b[1][1]+2]);else if(list.length)fit([d3.min(list,p=>p.lon)-5,d3.min(list,p=>p.lat)-5,d3.max(list,p=>p.lon)+5,d3.max(list,p=>p.lat)+5])}}
document.getElementById('cbody').addEventListener('click',e=>{const b=e.target.closest('.lk');if(b){const o=IDX.get(b.dataset.n);if(o)o.isP?showPoint(o,true):showLine(o,true);return}
  const c=e.target.closest('.lkc');if(c)showCountry(c.dataset.c,true)});
document.getElementById('cx').onclick=()=>closeCard();svg.on('click',()=>{closeCard();document.getElementById('res').style.display='none'});
// ---- search
const q=document.getElementById('q'),res=document.getElementById('res');
q.addEventListener('input',()=>{const s=q.value.trim().toLowerCase();if(s.length<2){res.style.display='none';return}
  const hits=[];for(const n of new Set([...CEL.keys(),...Object.keys(CSTAT)]))if(n.toLowerCase().startsWith(s))hits.push(['c',{name:n},'Country view']);
  for(const p of PTS)if((p.name+' '+p.country+' '+(p.op||'')+' '+(p.cap||'')+' '+(p.own||'')+' '+(p.chr||'')).toLowerCase().includes(s))hits.push(['p',p,KIND[p.cat]+(p.country?', '+p.country:'')]);
  for(const l of LNS)if(l.name.toLowerCase().includes(s))hits.push(['l',l,KIND[l.cat]]);
  res.innerHTML=hits.slice(0,12).map((h,i)=>'<button data-i="'+i+'">'+esc(h[1].name)+'<br><span>'+esc(h[2])+'</span></button>').join('')||'<button disabled>No match. Try a country or operator.</button>';
  res.style.display='block';res._h=hits});
res.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.disabled)return;const h=res._h[+b.dataset.i];res.style.display='none';q.blur();
  h[0]==='c'?showCountry(h[1].name,true):h[0]==='p'?showPoint(h[1],true):showLine(h[1],true)});
// ---- toggles
function togF(v){const f=document.getElementById('filters');const show=v==null?f.classList.contains('hidden'):v;f.classList.toggle('hidden',!show);document.getElementById('bFilters').setAttribute('aria-pressed',show)}
document.getElementById('bFilters').onclick=()=>{const willShow=document.getElementById('filters').classList.contains('hidden');if(willShow&&innerWidth<=860)closeCard();togF()};document.getElementById('fx').onclick=()=>togF(false);
document.getElementById('bSat').onclick=function(){satOn=!satOn;const im=document.getElementById('sat');if(satOn&&!im.getAttribute('href'))im.setAttribute('href',SAT);im.style.display=satOn?'':'none';svg.classed('sat',satOn);this.setAttribute('aria-pressed',satOn);tiles()};
document.getElementById('zi').onclick=()=>svg.transition().duration(250).call(zoom.scaleBy,1.8);
document.getElementById('zo').onclick=()=>svg.transition().duration(250).call(zoom.scaleBy,1/1.8);
addEventListener('keydown',e=>{if(e.key==='Escape'){closeCard();res.style.display='none'}});
addEventListener('resize',setExtent);
// ---- start
setExtent();if(innerWidth<=860)togF(false);
fit(innerWidth<=860?[-10,-8,80,52]:[-170,-58,180,78],0);scaleMarks();apply();
if(still)tickShips(T0);else requestAnimationFrame(loop);
document.getElementById('note').textContent='Vessels simulated. Figures approximate. Data: '+(window.DATA_SOURCE||'bundled snapshot')+'.';

