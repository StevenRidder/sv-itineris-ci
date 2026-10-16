import type {Map, RasterSourceSpecification} from 'maplibre-gl';

type Base='coastal'|'satellite'|'streets'|'simple';
type Settings={base:Base;labels:boolean;seamarks:boolean;destinations:boolean;source:boolean;draft:boolean;blend:number};
const defaults:Settings={base:'coastal',labels:true,seamarks:false,destinations:true,source:true,draft:true,blend:100};
const bases:Base[]=['coastal','satellite','streets','simple'];
const eox='https://tiles.maps.eox.at/wmts/1.0.0/';
const eoxCredit='<a href="https://maps.eox.at/" target="_blank" rel="noopener">EOX::Maps</a>';
const osmCredit='Data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a> and <a href="https://maps.eox.at/#data" target="_blank" rel="noopener">others</a>; rendering © EOX / MapServer';
const sources:Record<string,RasterSourceSpecification>={
 coastal:{type:'raster',tiles:[eox+'terrain-light_3857/default/g/{z}/{y}/{x}.jpg'],tileSize:256,maxzoom:13,attribution:eoxCredit+' · '+osmCredit},
 satellite:{type:'raster',tiles:[eox+'s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg'],tileSize:256,maxzoom:14,attribution:'<a href="https://cloudless.eox.at" target="_blank" rel="noopener">EOxCloudless</a> by <a href="https://eox.at" target="_blank" rel="noopener">EOX IT Services GmbH</a> (Contains modified Copernicus Sentinel data 2025) · '+eoxCredit},
 streets:{type:'raster',tiles:[eox+'osm_3857/default/g/{z}/{y}/{x}.jpg'],tileSize:256,maxzoom:18,attribution:eoxCredit+' · '+osmCredit},
 labels:{type:'raster',tiles:[eox+'overlay_3857/default/g/{z}/{y}/{x}.png'],tileSize:256,maxzoom:18,attribution:eoxCredit+' · '+osmCredit},
 brightLabels:{type:'raster',tiles:[eox+'overlay_bright_3857/default/g/{z}/{y}/{x}.png'],tileSize:256,maxzoom:18,attribution:eoxCredit+' · '+osmCredit},
 seamarks:{type:'raster',tiles:['https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png'],tileSize:256,maxzoom:18,attribution:'© <a href="https://www.openseamap.org/" target="_blank" rel="noopener">OpenSeaMap</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>'}
};

export function mapLayers(map:Map){
 const el=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
 let settings={...defaults},failed=false;
 try{const saved=JSON.parse(localStorage.getItem('itineris-map-layers')||'null');if(saved){for(const k of ['labels','seamarks','destinations','source','draft'] as const)if(typeof saved[k]==='boolean')settings[k]=saved[k];if(bases.includes(saved.base))settings.base=saved.base;if(Number.isFinite(saved.blend))settings.blend=Math.max(0,Math.min(100,saved.blend));}}catch{}
 const visible=(id:string,on:boolean)=>{if(map.getLayer(id))map.setLayoutProperty(id,'visibility',on?'visible':'none');};
 function raster(id:string,on:boolean){
  const key='tiles-'+id;
  if(on&&!map.getSource(key)){map.addSource(key,sources[id]);map.addLayer({id:key,type:'raster',source:key,paint:{'raster-fade-duration':150}},'route');}
  visible(key,on);
 }
 function status(){
  const detail=settings.base==='satellite'?'Sentinel-2 mosaic · 2025 · regional imagery, not live'+(map.getZoom()>14?' · enlarged beyond native detail':''):settings.base==='coastal'?'Terrain and seafloor context · not charted depths':settings.base==='streets'?'OpenStreetMap road and place detail':'Local coastline overview · works without online tiles';
  el('map-layer-status').textContent=failed?'Some online tiles could not load. Simple overview remains available.':detail;
 }
 function apply(persist=true){
  const base=settings.base;
  // Do not replace the map style: route data, Terra Draw and camera survive.
  const underneath=base==='satellite'&&settings.blend<100;
  raster('coastal',base==='coastal'||underneath);raster('satellite',base==='satellite');raster('streets',base==='streets');
  if(map.getLayer('tiles-satellite'))map.setPaintProperty('tiles-satellite','raster-opacity',settings.blend/100);
  raster('labels',settings.labels&&base!=='streets'&&base!=='satellite'&&base!=='simple');
  raster('brightLabels',settings.labels&&base==='satellite');raster('seamarks',settings.seamarks);
  // A previously loaded source may have been inserted later; restore stack order.
  for(const id of ['coastal','streets','satellite','labels','brightLabels','seamarks'])if(map.getLayer('tiles-'+id))map.moveLayer('tiles-'+id,'route');
  visible('route',settings.source);visible('draft',settings.draft);
  el('map').classList.toggle('hide-destinations',!settings.destinations);
  el<HTMLSelectElement>('basemap').value=base;
  for(const key of ['labels','seamarks','destinations','source','draft'] as const)el<HTMLInputElement>('layer-'+key).checked=settings[key];
  el<HTMLInputElement>('layer-labels').disabled=base==='streets'||base==='simple';if(base==='streets'||base==='simple')el<HTMLInputElement>('layer-labels').checked=base==='streets';
  el('satellite-controls').hidden=base!=='satellite';el<HTMLInputElement>('satellite-blend').value=String(settings.blend);el('blend-value').textContent=settings.blend+'%';
  el('seamark-note').hidden=!settings.seamarks;
  el('map').dataset.basemap=base;status();
  if(persist)try{localStorage.setItem('itineris-map-layers',JSON.stringify(settings));}catch{}
 }
 el('basemap').addEventListener('change',()=>{settings.base=el<HTMLSelectElement>('basemap').value as Base;failed=false;apply();});
 for(const key of ['labels','seamarks','destinations','source','draft'] as const)el('layer-'+key).addEventListener('change',()=>{settings[key]=el<HTMLInputElement>('layer-'+key).checked;apply();});
 el('satellite-blend').addEventListener('input',()=>{settings.blend=Number(el<HTMLInputElement>('satellite-blend').value);apply();});
 map.on('zoomend',status);
 map.on('error',event=>{
  const id=(event as {sourceId?:string}).sourceId;
  // A request can fail after its layer was hidden. It is no longer evidence
  // about the displayed basemap, including the local Simple overview.
  if(id?.startsWith('tiles-')&&map.getLayer(id)&&map.getLayoutProperty(id,'visibility')!=='none'){failed=true;status();}
 });
 apply(false);
 return {refresh(){visible('route',settings.source);visible('draft',settings.draft);}};
}
