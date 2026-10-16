import '@tabler/core/dist/css/tabler.min.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type {GeoJSONSource, Map as GLMap} from 'maplibre-gl';
import DOMPurify from 'dompurify';
import {marked} from 'marked';
import {draftEditor} from './map-draw';
import {mapLayers} from './map-layers';
import {mapTools} from './map-tools';
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
let chatId:string|null=localStorage.getItem('itineris-chat'),chatReady=false,chatBusy=false,chatController:AbortController|undefined;
let layers:ReturnType<typeof mapLayers>|undefined,tools:ReturnType<typeof mapTools>|undefined;
let previewGeneration=0;

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
 el('source-state').textContent=`Library revision ${voyage.library_revision} · Codex subscription`;
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
 el('map-note').textContent=s.draft_geometry?'Draft geometry is a destination sketch. It does not recalculate the calendar or validate passages.':s.route_family==='R'?'The unresolved Solomons–Raja passage is omitted from the source route. Planning overview; no navigation charts.':'Destination overview. Passage allowances and exact timing remain unverified.';
 el('draft-legend').hidden=!s.draft_geometry;
 const ids=activeIds(s.route_family),places=ids.map(id=>voyage.places.find(p=>p.id===id)).filter((p):p is Place=>!!p);
 const features:GeoJSON.Feature[]=[];
 places.forEach((p,i)=>{if(i&&!(s.route_family==='R'&&p.id==='raja'))features.push({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:[places[i-1].coordinates,p.coordinates]}});});
 (map.getSource('route') as GeoJSONSource).setData({type:'FeatureCollection',features});
 (map.getSource('draft') as GeoJSONSource).setData({type:'FeatureCollection',features:s.draft_geometry?[{type:'Feature',properties:{},geometry:s.draft_geometry}]:[]});
 markers.forEach(m=>m.remove());markers=[];
 for(const p of places){const button=document.createElement('button');button.className='map-pin'+(p.id===selectedPlace?' is-selected':'');button.textContent=p.name;button.type='button';button.addEventListener('click',event=>{event.stopPropagation();selectedPlace=p.id;select('place').value=p.id;inspectPlace(p);renderMap();});markers.push(new maplibregl.Marker({element:button}).setLngLat(p.coordinates).addTo(map));}
 el<HTMLButtonElement>('edit-route').disabled=!s.draft_geometry||chatBusy||!!editor?.active();layers?.refresh();tools?.refresh();
 map.resize();
 el('map').dataset.preview=proposal?.id||'';
}
function chatMessage(role:string,text:string){
 const article=document.createElement('article');article.className='chat-message '+role;
 const label=document.createElement('div');label.className='chat-role';label.textContent=role==='user'?'You':'Codex';article.append(label);
 const content=document.createElement('div');content.className='chat-text';content.textContent=text;article.append(content);el('chat-messages').append(article);return {article,content};
}
async function formatChat(content:HTMLElement,text:string){
 content.innerHTML=DOMPurify.sanitize(await marked.parse(text),{USE_PROFILES:{html:true}});
 content.querySelectorAll('a').forEach(a=>{const href=a.getAttribute('href')||'';if(!href.startsWith('#document/')){a.target='_blank';a.rel='noopener noreferrer';}});
}
function citations(article:HTMLElement,sources:{id:string;title:string;revision:number;start_line:number;end_line:number}[]){
 const list=document.createElement('div');list.className='chat-sources';
 for(const source of sources){const a=document.createElement('a');a.href='#document/'+source.id;a.textContent=`${source.title} · rev ${source.revision} · L${source.start_line}–${source.end_line}`;list.append(a);}article.append(list);
}
function busyChat(busy:boolean){
 chatBusy=busy;el<HTMLButtonElement>('chat-send').disabled=busy||!chatReady;el('chat-stop').hidden=!busy;
 el<HTMLButtonElement>('new-chat').disabled=busy;el<HTMLTextAreaElement>('chat-input').disabled=busy;
 select('scenario').disabled=busy||!current;document.querySelectorAll<HTMLButtonElement>('#routes button,#save,#discard,#draw-route,#preview-change,#use-coordinates,#edit-route,#apply-route,#measure-route,#ask-map-point').forEach(b=>b.disabled=busy);
 if(!busy){el<HTMLButtonElement>('preview-change').disabled=current?.precision!=='day';el<HTMLButtonElement>('draw-route').disabled=!mapReady;el<HTMLButtonElement>('edit-route').disabled=!shown()?.draft_geometry||!!editor?.active();}
}
async function connectChat(){
 try{const status=await api<{ready:boolean;message:string}>('assistant/status');chatReady=status.ready;el('chat-status').textContent=status.message;busyChat(false);
 if(chatId){try{const messages=await api<{role:string;text:string;citations?:Parameters<typeof citations>[1]}[]>('chats/'+chatId);for(const m of messages){const row=chatMessage(m.role,m.text);if(m.role==='assistant'){await formatChat(row.content,m.text);citations(row.article,m.citations||[]);}}}catch{chatId=null;localStorage.removeItem('itineris-chat');}}
 }catch(e){el('chat-status').textContent='Codex is unavailable. Manual planning controls remain available.';}
}
async function askChat(event:SubmitEvent){
 event.preventDefault();if(!current||chatBusy||!chatReady)return;
 const field=el<HTMLTextAreaElement>('chat-input'),message=field.value.trim();if(!message)return;
 const context={chat_id:chatId,message,scenario_id:current.id,base_revision:current.revision,proposal_id:proposal?.id||null};
 previewGeneration++;stopEditing();tools?.stop();
 chatMessage('user',message);const reply=chatMessage('assistant','');let text='',finished=false;field.value='';busyChat(true);chatController=new AbortController();el('chat-activity').textContent='Thinking with Codex…';
 try{
  const response=await fetch('/api/v1/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(context),signal:chatController.signal});
  if(!response.ok){const problem=await response.json();throw new Error(typeof problem.detail==='string'?problem.detail:'Chat request failed');}
  const reader=response.body!.getReader(),decoder=new TextDecoder();let buffer='';
  const receive=async(item:Record<string,any>)=>{
   if(item.type==='chat'){chatId=item.chat_id;localStorage.setItem('itineris-chat',chatId!);}
   else if(item.type==='session'){el('chat-status').textContent=`${item.model} · ChatGPT subscription`;}
   else if(item.type==='delta'){text+=item.text;reply.content.textContent=text;el('chat-messages').scrollTop=el('chat-messages').scrollHeight;}
   else if(item.type==='activity'){const labels:Record<string,string>={search_guides:'Searching your guides…',read_guide:'Reading a source…',get_plans:'Comparing plan data…',show_scenario:'Showing a route option…',preview_plan:'Calculating dates…',preview_route:'Drawing a route preview…'};el('chat-activity').textContent=labels[item.tool]||'Using a planning tool…';}
   else if(item.type==='selection'){current=item.scenario;proposal=undefined;select('scenario').value=current!.id;render();busyChat(true);viewLibrary(false);}
   else if(item.type==='proposal'){proposal=item.proposal;saveKey=crypto.randomUUID();render();busyChat(true);viewLibrary(false);notice('Chat preview shown on the map and calendar. Save new option to keep it.');}
   else if(item.type==='done'){finished=true;await formatChat(reply.content,text);citations(reply.article,item.citations||[]);el('chat-activity').textContent='Reply complete · changes remain previews';}
   else if(item.type==='error')throw new Error(item.message);
  };
  while(true){const chunk=await reader.read();buffer+=decoder.decode(chunk.value,{stream:!chunk.done});let newline;while((newline=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);if(line.trim())await receive(JSON.parse(line));}if(chunk.done)break;}
  if(!finished)throw new Error('The reply stopped before completion. Retry; any displayed change remains a preview.');
 }catch(e){const message=e instanceof DOMException&&e.name==='AbortError'?'Reply stopped. Displayed changes remain previews.':e instanceof Error?e.message:String(e);el('chat-activity').textContent=message;reply.content.textContent=text+(text?'\n\n':'')+message;}
 finally{busyChat(false);chatController=undefined;}
}
function createMap(){
 try{map=new maplibregl.Map({container:'map',center:[137,-2],zoom:2.7,maxZoom:18,style:{version:8,sources:{coast:{type:'geojson',data:'/coastline.geojson'},route:{type:'geojson',data:{type:'FeatureCollection',features:[]}},draft:{type:'geojson',data:{type:'FeatureCollection',features:[]}},measurement:{type:'geojson',data:{type:'FeatureCollection',features:[]}},'inspected-point':{type:'geojson',data:{type:'FeatureCollection',features:[]}}},layers:[{id:'ocean',type:'background',paint:{'background-color':'#e3eef0'}},{id:'land',type:'fill',source:'coast',paint:{'fill-color':'#ceddca','fill-outline-color':'#b1c7b4'}},{id:'route',type:'line',source:'route',paint:{'line-color':'#237462','line-width':2.5,'line-dasharray':[2,2]}},{id:'draft',type:'line',source:'draft',paint:{'line-color':'#b77c22','line-width':3,'line-dasharray':[3,2]}},{id:'measure-line',type:'line',source:'measurement',filter:['==',['geometry-type'],'LineString'],paint:{'line-color':'#334d72','line-width':2}},{id:'measure-points',type:'circle',source:'measurement',filter:['==',['geometry-type'],'Point'],paint:{'circle-radius':5,'circle-color':'#fff','circle-stroke-color':'#334d72','circle-stroke-width':2}},{id:'inspected-point',type:'circle',source:'inspected-point',paint:{'circle-radius':7,'circle-color':'#b77c22','circle-stroke-color':'#fff','circle-stroke-width':2}}]},attributionControl:{compact:false,customAttribution:'<a href="https://www.naturalearthdata.com/">Natural Earth</a> · planning map'}});
 map.addControl(new maplibregl.NavigationControl(),'top-right');
 map.addControl(new maplibregl.FullscreenControl({container:el('map-card')}),'top-right');map.addControl(new maplibregl.ScaleControl({unit:'nautical'}),'bottom-left');
 map.on('load',()=>{mapReady=true;el<HTMLButtonElement>('draw-route').disabled=false;editor=draftEditor(map!,coords=>{stopEditing();void previewGeometry(coords);});
  layers=mapLayers(map!);tools=mapTools(map!,{isDrawing:()=>!!editor?.active(),measure:points=>api('map/measure',{type:'LineString',coordinates:points}),points:()=>shown()?.draft_geometry?.coordinates as [number,number][]||activeIds(shown()?.route_family||'R').flatMap(id=>{const p=voyage.places.find(p=>p.id===id);return p?[p.coordinates]:[];}),info:name=>{const p=voyage.places.find(p=>p.name===name),stage=shown()?.stages.find(s=>s.id===p?.id);return !name?'':stage?.start&&stage.end?`${date(stage.start)} – ${date(stage.end)}`:stage?.window||'Dates not resolved for this destination';},ask:(point,name)=>{if(chatBusy)return;viewLibrary(false);el<HTMLTextAreaElement>('chat-input').value=`Help me plan near ${name?name+' ':''}(${point[1].toFixed(5)}°, ${point[0].toFixed(5)}°). What evidence do my guides provide for this area?`;el('chat-input').focus();el('chat-form').scrollIntoView({behavior:'smooth',block:'nearest'});}});renderMap();});
 map.on('error',e=>{if(!(e as {sourceId?:string}).sourceId?.startsWith('tiles-'))notice('A map layer could not load: '+e.error.message);});
 }catch(e){notice('Map unavailable; the scenario and coordinate controls remain usable.');}
}
async function previewOperation(operation:unknown){if(!current)return;clearError();const base=current,generation=++previewGeneration;const result=await api<Proposal>(`scenarios/${base.id}/preview`,{base_revision:base.revision,operations:[operation],previous_proposal_id:proposal?.id||null});if(generation!==previewGeneration||current?.id!==base.id||current.revision!==base.revision)return;proposal=result;saveKey=crypto.randomUUID();render();notice('Preview calculated by the backend. Original source and saved options are unchanged.');}
function stopEditing(){editor?.stop();editingControls(false);}
function editingControls(active:boolean){el('map').classList.toggle('is-drawing',active);el('draw-route').hidden=active;el('apply-route').hidden=true;el('stop-drawing').hidden=!active;el<HTMLButtonElement>('edit-route').disabled=active||!shown()?.draft_geometry||chatBusy;for(const id of ['measure-route','preview-change','use-coordinates','save'])el<HTMLButtonElement>(id).disabled=active||chatBusy;el<HTMLButtonElement>('preview-change').disabled=active||chatBusy||current?.precision!=='day';}
function inspectPlace(p:Place){tools?.inspect(p.coordinates,p.name);}
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
select('scenario').addEventListener('change',()=>{previewGeneration++;proposal=undefined;current=voyage.scenarios.find(s=>s.id===select('scenario').value);stopEditing();render();clearError();});
el('routes').addEventListener('click',e=>{const button=(e.target as Element).closest<HTMLElement>('[data-route]');if(!button)return;const family=button.dataset.route;const next=voyage.scenarios.find(s=>s.route_family===family&&s.id===(family==='R'?'source-B':family==='H'?'source-E':'source-F'))||voyage.scenarios.find(s=>s.route_family===family);if(next){previewGeneration++;current=next;proposal=undefined;select('scenario').value=next.id;stopEditing();render();clearError();}});
el('change-form').addEventListener('submit',async e=>{e.preventDefault();try{await previewOperation({op:'extend_stay',stage_id:select('stage').value,nights:Number(input('nights').value)});}catch(e){error(e);}});
el('save').addEventListener('click',async()=>{if(!proposal)return;const button=el<HTMLButtonElement>('save');button.disabled=true;try{const saved=await api<Scenario>(`proposals/${proposal.id}/save-as`,{name:input('save-name').value},{'Idempotency-Key':saveKey});proposal=undefined;await load(saved.id);notice('Saved a new draft. Its parent and all source options remain available.');}catch(e){error(e);}finally{button.disabled=false;}});
el('discard').addEventListener('click',()=>{previewGeneration++;proposal=undefined;stopEditing();render();notice('Preview discarded. Saved records are unchanged.');});
el('draw-route').addEventListener('click',()=>{if(!editor)return;tools?.stop();editor.start();editingControls(true);notice('Click to add route points; press Enter or click the last point to finish a draft preview.');});
el('stop-drawing').addEventListener('click',stopEditing);
el('edit-route').addEventListener('click',()=>{const geometry=shown()?.draft_geometry;if(!editor||!geometry)return;try{tools?.stop();editor.edit(geometry.coordinates);editingControls(true);el('apply-route').hidden=false;notice('Drag a point or midpoint, then Preview edited route. Cancel sketch restores the current preview.');}catch(e){error(e);}});
el('apply-route').addEventListener('click',()=>{try{editor?.apply();}catch(e){error(e);}});
el('use-coordinates').addEventListener('click',()=>{const coords=el<HTMLTextAreaElement>('coordinates').value.trim().split('\n').map(line=>line.split(',').map(v=>Number(v.trim())));void previewGeometry(coords);});
select('place').addEventListener('change',()=>{selectedPlace=select('place').value;renderMap();});
el('zoom-place').addEventListener('click',()=>{const p=voyage.places.find(p=>p.id===selectedPlace);if(p){inspectPlace(p);map?.flyTo({center:p.coordinates,zoom:11,duration:700});}});
el('place-guide').addEventListener('click',async()=>{input('search').value=voyage.places.find(p=>p.id===selectedPlace)?.name||'';viewLibrary(true);try{await loadDocuments();}catch(e){error(e);}});
el('nav-plan').addEventListener('click',()=>viewLibrary(false));el('nav-library').addEventListener('click',()=>viewLibrary(true));
el('documents').addEventListener('click',e=>{const id=(e.target as Element).closest<HTMLElement>('[data-doc]')?.dataset.doc;if(id)void showDocument(id);});
el('document').addEventListener('click',e=>{const href=(e.target as Element).closest('a')?.getAttribute('href');if(href?.startsWith('#document/')){e.preventDefault();void showDocument(href.slice(10));}});
el('chat-messages').addEventListener('click',e=>{const href=(e.target as Element).closest('a')?.getAttribute('href');if(href?.startsWith('#document/')){e.preventDefault();viewLibrary(true);void showDocument(href.slice(10));}});
el('chat-form').addEventListener('submit',e=>{void askChat(e as SubmitEvent);});
el('chat-stop').addEventListener('click',()=>chatController?.abort());
el('new-chat').addEventListener('click',()=>{chatId=null;localStorage.removeItem('itineris-chat');el('chat-messages').replaceChildren();el('chat-activity').textContent='New chat · current map and preview retained';});
let searchTimer:ReturnType<typeof setTimeout>;input('search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{void loadDocuments().catch(error);},200);});
void load().then(()=>{createMap();void connectChat();}).catch(error);
