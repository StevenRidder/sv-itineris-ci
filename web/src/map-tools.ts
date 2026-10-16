import {LngLatBounds, type GeoJSONSource, type Map} from 'maplibre-gl';

type Position=[number,number];
type Measurement={distance_nm:number;legs:{distance_nm:number;initial_bearing_deg:number|null}[]};
type Options={isDrawing:()=>boolean;measure:(points:Position[])=>Promise<Measurement>;points:()=>Position[];info:(name?:string)=>string;ask:(point:Position,name?:string)=>void};

export function mapTools(map:Map,options:Options){
 const el=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
 let measuring=false,points:Position[]=[],sequence=0,selection:Position|undefined,selectionName:string|undefined;
 function setMeasurement(){
  const features:GeoJSON.Feature[]=[];
  if(points.length>1)features.push({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:points}});
  points.forEach(p=>features.push({type:'Feature',properties:{},geometry:{type:'Point',coordinates:p}}));
  (map.getSource('measurement') as GeoJSONSource).setData({type:'FeatureCollection',features});
 }
 function stop(){measuring=false;el('map').classList.remove('is-measuring');el('measure-route').setAttribute('aria-pressed','false');el('measure-route').textContent='Measure';}
 function inspect(point:Position,name?:string){
  selection=point;selectionName=name;el('map-point').hidden=false;el('map-point-name').textContent=name||'Map point';
  el('map-point-coordinates').textContent=`${point[1].toFixed(5)}°, ${point[0].toFixed(5)}°`;
  el('map-point-dates').textContent=options.info(name);
  (map.getSource('inspected-point') as GeoJSONSource).setData({type:'Feature',properties:{},geometry:{type:'Point',coordinates:point}});
 }
 el('measure-route').addEventListener('click',()=>{
  if(options.isDrawing())return;
  if(measuring){stop();return;}
  measuring=true;el('map').classList.add('is-measuring');el('measure-route').setAttribute('aria-pressed','true');el('measure-route').textContent='Done measuring';el('measurement').hidden=false;
 });
 el('clear-measurement').addEventListener('click',()=>{points=[];sequence++;setMeasurement();el('measurement-result').textContent='Click two or more points to measure.';});
 el('ask-map-point').addEventListener('click',()=>{if(selection)options.ask(selection,selectionName);});
 el('fit-voyage').addEventListener('click',()=>{
  const positions=options.points();if(!positions.length)return;
  const bounds=new LngLatBounds();let previous=positions[0][0];
  for(const point of positions){let lng=point[0];while(lng-previous>180)lng-=360;while(lng-previous< -180)lng+=360;bounds.extend([lng,point[1]]);previous=lng;}
  map.fitBounds(bounds,{padding:55,maxZoom:10,duration:450});
 });
 map.on('mousemove',event=>{const lon=((event.lngLat.lng+180)%360+360)%360-180;el('map-coordinates').textContent=`${event.lngLat.lat.toFixed(4)}°, ${lon.toFixed(4)}°`;});
 map.on('click',event=>{
  if(options.isDrawing())return;
  const point:Position=[((event.lngLat.lng+180)%360+360)%360-180,Math.max(-85,Math.min(85,event.lngLat.lat))];
  if(!measuring){inspect(point);return;}
  if(points.length>=100){el('measurement-result').textContent='Clear the measurement before adding more than 100 points.';return;}
  points.push(point);setMeasurement();const request=++sequence;
  if(points.length<2){el('measurement-result').textContent='First point set. Click another point.';return;}
  el('measurement-result').textContent='Calculating direct distance…';
  void options.measure([...points]).then(result=>{
   if(request!==sequence)return;const bearing=result.legs.at(-1)?.initial_bearing_deg;
   el('measurement-result').textContent=`${result.distance_nm.toFixed(1)} NM · ${points.length-1} segments${bearing===null||bearing===undefined?'':` · last initial bearing ${bearing.toFixed(0)}° true`}`;
  }).catch(()=>{if(request===sequence)el('measurement-result').textContent='Distance unavailable. Try again.';});
 });
 return {stop,inspect,refresh(){if(selection)el('map-point-dates').textContent=options.info(selectionName);}};
}
