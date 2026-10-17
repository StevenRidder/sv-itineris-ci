import type {GeoJSONSource, Map} from 'maplibre-gl';

type Hazard={label:string;months:number[];peak:number[];kind:'storm'|'monsoon'|'wet';detail:string};
type Stop={id:string;name:string;latitude:string;coordinates:[number,number];anchor:string;coordinate_source:string;preferred:number[];prime:number[];window:string;why:string;notes:string[];hazards:Hazard[]};
export type SeasonalGuide={source:string;regional_notes:string[];stops:Stop[]};
const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const hazardKinds=['storm','monsoon','wet'] as const;
const esc=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const active=(stop:Stop,month:number)=>stop.hazards.filter(h=>h.months.includes(month));
function description(stop:Stop,month:number){
 const preferred=stop.prime.includes(month)?'Best within preferred window':stop.preferred.includes(month)?'Preferred window':'Outside listed preferred window';
 const hazards=active(stop,month).map(h=>h.label+(h.peak.includes(month)?' (peak)':''));
 return preferred+' · '+(hazards.length?hazards.join('; '):'No stop-specific hazard window listed for this month');
}

export function seasonGuide(map:Map,guide:SeasonalGuide){
 if(!guide.stops.length)return;
 const el=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
 let month=new Date().getMonth()+1,selected=guide.stops[0].id,enabled=true,preferred=true,hazards=true;
 try{const saved=JSON.parse(localStorage.getItem('itineris-seasons')||'null');if(saved){if(Number.isInteger(saved.month)&&saved.month>=1&&saved.month<=12)month=saved.month;for(const key of ['enabled','preferred','hazards'] as const)if(typeof saved[key]==='boolean'){if(key==='enabled')enabled=saved[key];else if(key==='preferred')preferred=saved[key];else hazards=saved[key];}if(guide.stops.some(s=>s.id===saved.selected))selected=saved.selected;}}catch{}
 el('season-guide').hidden=false;el<HTMLInputElement>('layer-seasons').disabled=false;
 el('season-source').textContent=guide.source;
 el('season-regional').textContent=guide.regional_notes.join(' ');
 el<HTMLSelectElement>('season-month').innerHTML=months.map((m,i)=>`<option value="${i+1}">${m}</option>`).join('');
 el<HTMLSelectElement>('season-stop').innerHTML=guide.stops.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
 map.addSource('seasonal-stops',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
 map.addLayer({id:'seasonal-window',type:'circle',source:'seasonal-stops',paint:{'circle-radius':['case',['get','prime'],9,['get','preferred'],7,5],'circle-color':['case',['get','preferred'],'#237462','#667d77'],'circle-opacity':.85,'circle-stroke-width':1,'circle-stroke-color':'#fff'}});
 for(const [type,radius,color] of [['wet',11,'#497caa'],['monsoon',14,'#ab751f'],['storm',17,'#b14c40']] as const)map.addLayer({id:'seasonal-'+type,type:'circle',source:'seasonal-stops',filter:['==',['get',type],true],paint:{'circle-radius':radius,'circle-color':'#fff','circle-opacity':0,'circle-stroke-width':['case',['get',type+'Peak'],4,2],'circle-stroke-color':color}});
 function render(persist=false){
  const stop=guide.stops.find(s=>s.id===selected)!;
  el<HTMLSelectElement>('season-month').value=String(month);el<HTMLSelectElement>('season-stop').value=selected;
  el<HTMLInputElement>('layer-seasons').checked=enabled;el<HTMLInputElement>('season-preferred').checked=preferred;el<HTMLInputElement>('season-hazards').checked=hazards;
  (map.getSource('seasonal-stops') as GeoJSONSource).setData({type:'FeatureCollection',features:guide.stops.map(s=>{const risks=active(s,month),properties:Record<string,string|boolean>={id:s.id,preferred:preferred&&s.preferred.includes(month),prime:preferred&&s.prime.includes(month)};for(const type of hazardKinds){properties[type]=risks.some(h=>h.kind===type);properties[type+'Peak']=risks.some(h=>h.kind===type&&h.peak.includes(month));}return {type:'Feature',geometry:{type:'Point',coordinates:s.coordinates},properties};})});
  map.setLayoutProperty('seasonal-window','visibility',enabled?'visible':'none');for(const type of hazardKinds)map.setLayoutProperty('seasonal-'+type,'visibility',enabled&&hazards?'visible':'none');
  el('map').dataset.seasonMonth=String(month);el('map').dataset.seasonLayer=String(enabled);
  el('season-summary').textContent=months[month-1]+' · '+stop.name+' · '+description(stop,month);
  el('season-detail').innerHTML=`<strong>${esc(stop.name)}</strong> · ${esc(stop.latitude)}<div class="mt-1">${esc(stop.window)} · ${esc(stop.why)}</div><div class="mt-2">${stop.hazards.length?stop.hazards.map(h=>`<div><strong>${esc(h.label)}</strong> · ${h.months.map(m=>months[m-1]).join(', ')}${h.peak.length?' · peak '+h.peak.map(m=>months[m-1]).join(', '):''}<br>${esc(h.detail)}</div>`).join(''):'No stop-specific hazard season was supplied.'}</div>${stop.notes.map(note=>`<div class="mt-2">${esc(note)}</div>`).join('')}<div class="small text-secondary mt-2">Representative marker: ${esc(stop.anchor)} · ${esc(stop.coordinate_source)}. Not a hazard boundary.</div>`;
  el('season-grid').innerHTML=`<table class="season-table"><caption class="visually-hidden">Preferred windows and hazard seasons, January to December. Cells may show both.</caption><thead><tr><th scope="col">Stop</th>${months.map((m,i)=>`<th scope="col"><button class="season-month-button" type="button" data-month="${i+1}" aria-pressed="${month===i+1}">${m}</button></th>`).join('')}</tr></thead><tbody>${guide.stops.map(s=>`<tr${s.id===selected?' class="season-selected"':''}><th scope="row"><button type="button" class="season-stop-button" data-stop="${s.id}">${esc(s.name)}</button></th>${months.map((m,i)=>{const n=i+1,risks=active(s,n),best=s.prime.includes(n),pref=s.preferred.includes(n);return `<td${n===month?' class="season-current"':''}><button type="button" class="season-cell" data-month="${n}" data-stop="${s.id}" aria-label="${esc(s.name+' · '+m+' · '+description(s,n))}"><span class="season-window ${best?'is-prime':pref?'is-preferred':''}" aria-hidden="true">${best?'★':pref?'●':'·'}</span><span class="season-risk" aria-hidden="true">${risks.length?hazardKinds.filter(k=>risks.some(h=>h.kind===k)).map(k=>`<span class="season-risk-mark risk-${k}${risks.some(h=>h.kind===k&&h.peak.includes(n))?' is-peak':''}">${k==='storm'?'!':k==='monsoon'?'~':'≈'}</span>`).join(''):'·'}</span></button></td>`;}).join('')}</tr>`).join('')}</tbody></table>`;
  if(persist)try{localStorage.setItem('itineris-seasons',JSON.stringify({month,selected,enabled,preferred,hazards}));}catch{}
 }
 el('season-month').addEventListener('change',()=>{month=Number(el<HTMLSelectElement>('season-month').value);render(true);});
 el('season-stop').addEventListener('change',()=>{selected=el<HTMLSelectElement>('season-stop').value;render(true);});
 el('layer-seasons').addEventListener('change',()=>{enabled=el<HTMLInputElement>('layer-seasons').checked;render(true);});
 el('season-preferred').addEventListener('change',()=>{preferred=el<HTMLInputElement>('season-preferred').checked;render(true);});
 el('season-hazards').addEventListener('change',()=>{hazards=el<HTMLInputElement>('season-hazards').checked;render(true);});
 el('season-grid').addEventListener('click',event=>{const button=(event.target as Element).closest<HTMLButtonElement>('button');if(!button)return;if(button.dataset.month)month=Number(button.dataset.month);if(button.dataset.stop)selected=button.dataset.stop;render(true);});
 el('season-zoom').addEventListener('click',()=>{const stop=guide.stops.find(s=>s.id===selected)!;map.flyTo({center:stop.coordinates,zoom:5,duration:600});});
 el('season-fit').addEventListener('click',()=>{const lons=guide.stops.map(s=>s.coordinates[0]),lats=guide.stops.map(s=>s.coordinates[1]);map.fitBounds([[Math.min(...lons),Math.min(...lats)],[Math.max(...lons),Math.max(...lats)]],{padding:50,maxZoom:7,duration:600});});
 map.on('click','seasonal-window',event=>{if(map.getContainer().classList.contains('is-drawing')||map.getContainer().classList.contains('is-measuring'))return;const id=event.features?.[0]?.properties?.id;if(guide.stops.some(s=>s.id===id)){selected=id;render(true);}});
 render();
}
