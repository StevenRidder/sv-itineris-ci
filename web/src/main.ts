import '@tabler/core/dist/css/tabler.min.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type {GeoJSONSource, Map as GLMap} from 'maplibre-gl';
import DOMPurify from 'dompurify';
import {marked} from 'marked';
import {draftEditor} from './map-draw';
maplibregl.setWorkerUrl(workerUrl);

type Stage={id:string;name:string;start:string|null;end:string|null;window:string|null;gap_before:number;protected_duration:boolean};
type Geometry={type:'LineString';coordinates:number[][]};
type Scenario={id:string;name:string;route_family:'R'|'F'|'H';precision:'day'|'month'|'unknown';revision:number;status:string;stages:Stage[];draft_geometry:Geometry|null};
type Place={id:string;name:string;coordinates:[number,number]};
type Voyage={scenarios:Scenario[];places:Place[];library_revision:number};
type Proposal={id:string;scenario:Scenario;changes:string[];warnings:string[]};
const el=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const input=(id:string)=>el<HTMLInputElement>(id),select=(id:string)=>el<HTMLSelectElement>(id);
const esc=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const day=(s:string)=>Date.parse(s+'T00:00:00Z')/86400000;
const date=(s:string)=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(s+'T00:00:00Z'));
let voyage:Voyage={scenarios:[],places:[],library_revision:0},current:Scenario|undefined,proposal:Proposal|undefined;
let map:GLMap|undefined,mapReady=false,editor:ReturnType<typeof draftEditor>|undefined,markers:maplibregl.Marker[]=[];
let selectedPlace='',saveKey='';

async function api<T>(url:string,body?:unknown,headers:Record<string,string>={}):Promise<T>{
 const response=await fetch('/api/v1/'+url,{method:body===undefined?'GET':'POST',headers:body===undefined?headers:{'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
 if(!response.ok){let msg='Request failed';try{const data=await response.json();msg=typeof data.detail==='string'?data.detail:JSON.stringify(data.detail);}catch{}throw new Error(msg);}return response.json();
}
function error(e:unknown){el('error').textContent=e instanceof Error?e.message:String(e);el('error').hidden=false;}
function clearError(){el('error').hidden=true;}
function shown(){return proposal?.scenario||current;}
function notice(text:string){el('notice').textContent=text;}
function activeIds(route:string){return route==='H'?['van','sol','pohnpei','chuuk','yap','raja','palau','ph','sea']:route==='F'?['van','sol','pohnpei','chuuk','yap','palau','ph','sea']:['van','sol','raja','palau','ph','sea'];}

async function load(preferred?:string){
 voyage=await api<Voyage>('voyage');
 current=voyage.scenarios.find(s=>s.id===preferred)||voyage.scenarios.find(s=>s.id==='source-B')||voyage.scenarios[0];
 select('scenario').innerHTML=voyage.scenarios.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}${s.status==='draft'?' · draft':''}</option>`).join('');
 select('scenario').disabled=!current;el('empty').hidden=!!current;el('plan-view').hidden=!current;
 if(current)select('scenario').value=current.id;
 el('source-state').textContent=`Library revision ${voyage.library_revision} · AI not connected`;
 select('place').innerHTML=voyage.places.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
 selectedPlace=voyage.places.find(p=>p.id==='palau')?.id||voyage.places[0]?.id||'';select('place').value=selectedPlace;
 render();await loadDocuments();
}
function render(){
 const s=shown();if(!s)return;
 el('routes').innerHTML=([['R','Raja Ampat','Solomons → Raja → Palau'],['F','FSM','Solomons → FSM → Palau'],['H','FSM + Raja Ampat','Keep both experiences']] as const).map(([id,name,note])=>`<button class="btn route-option" data-route="${id}" aria-pressed="${s.route_family===id}"><strong>${id} · ${name}</strong><small>${note}</small></button>`).join('');
 select('stage').innerHTML=(current?.stages||[]).filter(t=>t.start&&t.end&&!t.protected_duration).map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
 select('stage').disabled=current?.precision!=='day';input('nights').disabled=current?.precision!=='day';el<HTMLButtonElement>('preview-change').disabled=current?.precision!=='day';
 el('precision-note').textContent=s.precision==='day'?'Later block durations and gaps stay intact. Palau is protected.':'Month windows or unknown dates are preserved. Exact inputs are needed for a day calendar.';
 el('map-title').textContent=s.route_family==='H'?'FSM + Raja Ampat option':s.route_family==='F'?'FSM option':'Raja Ampat option';
 el('date-basis').textContent=s.precision==='day'?'Sample day calendar · dates not selected':s.precision==='month'?'Month windows · no precise dates inferred':'Timing and passage allowances unresolved';
 el('preview-state').textContent=proposal?'Preview':s.status==='draft'?'Saved draft':'Source option';
 const start=s.stages[0]?.start,end=s.stages.at(-1)?.end,total=start&&end?day(end)-day(start):0;
 el('timeline').innerHTML=s.stages.map(t=>{const before=current?.stages.find(x=>x.id===t.id);const shift=t.start&&before?.start?day(t.start)-day(before.start):0;return `<div class="stage-row" data-stage="${esc(t.id)}"><div class="stage-name">${esc(t.name)}${t.protected_duration?'<small>Duration protected</small>':''}</div><div class="stage-dates">${t.start&&t.end?`${date(t.start)} – ${date(t.end)}`:esc(t.window||'Unknown')}${t.start&&t.end&&start&&total?`<div class="timeline-track"><div class="timeline-bar" style="left:${(day(t.start)-day(start))/total*100}%;width:${(day(t.end)-day(t.start))/total*100}%"></div></div>`:''}</div><div class="stage-count">${t.start&&t.end?`${day(t.end)-day(t.start)} nights${shift?`<br>${shift>0?'+':''}${shift}d`:''}`:'Unresolved'}</div></div>`;}).join('');
 el('proposal').hidden=!proposal;
 if(proposal){el('changes').innerHTML=proposal.changes.map(c=>`<li>${esc(c)}</li>`).join('');el('warnings').textContent=proposal.warnings.join(' ');input('save-name').value=current!.name+' · alternative';}
 el<HTMLTextAreaElement>('coordinates').value=s.draft_geometry?.coordinates.map(p=>p.join(', ')).join('\n')||'';
 renderMap();
}
function renderMap(){
 const s=shown();if(!s||!mapReady||!map)return;
 const ids=activeIds(s.route_family),places=ids.map(id=>voyage.places.find(p=>p.id===id)).filter((p):p is Place=>!!p);
 const features:GeoJSON.Feature[]=[];
 places.forEach((p,i)=>{if(i&&!(s.route_family==='R'&&p.id==='raja'))features.push({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:[places[i-1].coordinates,p.coordinates]}});});
 (map.getSource('route') as GeoJSONSource).setData({type:'FeatureCollection',features});
 (map.getSource('draft') as GeoJSONSource).setData({type:'FeatureCollection',features:s.draft_geometry?[{type:'Feature',properties:{},geometry:s.draft_geometry}]:[]});
 markers.forEach(m=>m.remove());markers=[];
 for(const p of places){const button=document.createElement('button');button.className='map-pin'+(p.id===selectedPlace?' is-selected':'');button.textContent=p.name;button.type='button';button.addEventListener('click',()=>{selectedPlace=p.id;select('place').value=p.id;renderMap();});markers.push(new maplibregl.Marker({element:button}).setLngLat(p.coordinates).addTo(map));}
 map.resize();
}
function createMap(){
 try{map=new maplibregl.Map({container:'map',center:[137,-2],zoom:2.7,style:{version:8,sources:{coast:{type:'geojson',data:'/coastline.geojson'},route:{type:'geojson',data:{type:'FeatureCollection',features:[]}},draft:{type:'geojson',data:{type:'FeatureCollection',features:[]}}},layers:[{id:'ocean',type:'background',paint:{'background-color':'#e3eef0'}},{id:'land',type:'fill',source:'coast',paint:{'fill-color':'#ceddca','fill-outline-color':'#b1c7b4'}},{id:'route',type:'line',source:'route',paint:{'line-color':'#237462','line-width':2.5,'line-dasharray':[2,2]}},{id:'draft',type:'line',source:'draft',paint:{'line-color':'#b77c22','line-width':3,'line-dasharray':[3,2]}}]},attributionControl:{compact:true,customAttribution:'Natural Earth · destination overview'}});
 map.addControl(new maplibregl.NavigationControl(),'top-right');
 map.on('load',()=>{mapReady=true;el<HTMLButtonElement>('draw-route').disabled=false;editor=draftEditor(map!,coords=>{el('map').classList.remove('is-drawing');el('stop-drawing').hidden=true;el('draw-route').hidden=false;void previewGeometry(coords);});renderMap();});
 map.on('error',e=>{notice('A map layer could not load: '+e.error.message);});
 }catch(e){notice('Map unavailable; the scenario and coordinate controls remain usable.');}
}
async function previewOperation(operation:unknown){if(!current)return;clearError();const base=current;const result=await api<Proposal>(`scenarios/${base.id}/preview`,{base_revision:base.revision,operations:[operation]});if(current?.id!==base.id||current.revision!==base.revision)return;proposal=result;saveKey=crypto.randomUUID();render();notice('Preview calculated by the backend. Original source and saved options are unchanged.');}
async function previewGeometry(coords:number[][]){try{await previewOperation({op:'set_route_geometry',geometry:{type:'LineString',coordinates:coords}});}catch(e){error(e);}}
async function loadDocuments(){
 const docs=await api<{id:string;title:string;revision:number}[]>('library?q='+encodeURIComponent(input('search').value));
 el('documents').innerHTML=docs.length?docs.map(d=>`<button class="list-group-item list-group-item-action" data-doc="${esc(d.id)}"><div>${esc(d.title)}</div><div class="small text-secondary">Source revision ${d.revision}</div></button>`).join(''):'<div class="p-3 text-secondary">No matching imported source.</div>';
}
async function showDocument(id:string){
 try{const doc=await api<{title:string;revision:number;body:string;path:string;kind:string}>(`library/${id}`);const article=el('document');article.innerHTML=`<div class="doc-provenance">Imported source revision ${doc.revision}<br>${esc(doc.path)}</div>`;
 const content=document.createElement('div');if(doc.kind==='scenario-seed'){const pre=document.createElement('pre');pre.textContent=doc.body;content.append(pre);}else{content.innerHTML=DOMPurify.sanitize(await marked.parse(doc.body),{USE_PROFILES:{html:true}});content.querySelectorAll('a').forEach(a=>{if(a.href.startsWith('http')&&!a.getAttribute('href')?.startsWith('#')){a.target='_blank';a.rel='noopener noreferrer';}});}article.append(content);document.title=doc.title+' · SV Itineris';
 document.querySelectorAll('[data-doc]').forEach(b=>b.classList.toggle('active',(b as HTMLElement).dataset.doc===id));
 }catch(e){error(e);}
}
function viewLibrary(yes:boolean){el('library-view').hidden=!yes;el('plan-view').hidden=yes||!current;el('nav-plan').classList.toggle('btn-primary',!yes);el('nav-library').classList.toggle('btn-primary',yes);if(!yes)map?.resize();}
select('scenario').addEventListener('change',()=>{proposal=undefined;current=voyage.scenarios.find(s=>s.id===select('scenario').value);editor?.stop();render();clearError();});
el('routes').addEventListener('click',e=>{const button=(e.target as Element).closest<HTMLElement>('[data-route]');if(!button)return;const family=button.dataset.route;const next=voyage.scenarios.find(s=>s.route_family===family&&s.id===(family==='R'?'source-B':family==='H'?'source-E':'source-F'))||voyage.scenarios.find(s=>s.route_family===family);if(next){current=next;proposal=undefined;select('scenario').value=next.id;editor?.stop();render();clearError();}});
el('change-form').addEventListener('submit',async e=>{e.preventDefault();try{await previewOperation({op:'extend_stay',stage_id:select('stage').value,nights:Number(input('nights').value)});}catch(e){error(e);}});
el('save').addEventListener('click',async()=>{if(!proposal)return;const button=el<HTMLButtonElement>('save');button.disabled=true;try{const saved=await api<Scenario>(`proposals/${proposal.id}/save-as`,{name:input('save-name').value},{'Idempotency-Key':saveKey});proposal=undefined;await load(saved.id);notice('Saved a new draft. Its parent and all source options remain available.');}catch(e){error(e);}finally{button.disabled=false;}});
el('discard').addEventListener('click',()=>{proposal=undefined;render();notice('Preview discarded. Saved records are unchanged.');});
el('draw-route').addEventListener('click',()=>{if(!editor)return;editor.start();el('map').classList.add('is-drawing');el('draw-route').hidden=true;el('stop-drawing').hidden=false;notice('Click to add route points; press Enter or click the last point to finish a draft preview.');});
el('stop-drawing').addEventListener('click',()=>{editor?.stop();el('map').classList.remove('is-drawing');el('draw-route').hidden=false;el('stop-drawing').hidden=true;});
el('use-coordinates').addEventListener('click',()=>{const coords=el<HTMLTextAreaElement>('coordinates').value.trim().split('\n').map(line=>line.split(',').map(v=>Number(v.trim())));void previewGeometry(coords);});
select('place').addEventListener('change',()=>{selectedPlace=select('place').value;renderMap();});
el('place-guide').addEventListener('click',async()=>{input('search').value=voyage.places.find(p=>p.id===selectedPlace)?.name||'';viewLibrary(true);try{await loadDocuments();}catch(e){error(e);}});
el('nav-plan').addEventListener('click',()=>viewLibrary(false));el('nav-library').addEventListener('click',()=>viewLibrary(true));
el('documents').addEventListener('click',e=>{const id=(e.target as Element).closest<HTMLElement>('[data-doc]')?.dataset.doc;if(id)void showDocument(id);});
el('document').addEventListener('click',e=>{const href=(e.target as Element).closest('a')?.getAttribute('href');if(href?.startsWith('#document/')){e.preventDefault();void showDocument(href.slice(10));}});
let searchTimer:ReturnType<typeof setTimeout>;input('search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{void loadDocuments().catch(error);},200);});
void load().then(()=>createMap()).catch(error);
