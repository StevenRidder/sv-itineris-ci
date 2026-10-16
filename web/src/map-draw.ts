/** Adapted from Helm web/integrations/draw.js at bf4a12bc6db6551b1dddf8d21cc6f26af5f1fc69.
 * Copyright 2026 Steve Ridder. Business Source License 1.1; see third_party/helm/.
 * The boat command plane is removed. Finished geometry emits a preview callback only.
 */
import { TerraDraw, TerraDrawLineStringMode, TerraDrawSelectMode } from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import type { Map } from 'maplibre-gl';

export function draftEditor(map: Map, onDraft: (coordinates: number[][]) => void) {
  const draw = new TerraDraw({adapter:new TerraDrawMapLibreGLAdapter({map}),modes:[new TerraDrawLineStringMode({keyEvents:{finish:'Enter',cancel:'Escape'}}),new TerraDrawSelectMode({flags:{linestring:{feature:{draggable:true,coordinates:{midpoints:true,draggable:true,deletable:true}}}}})]});
  draw.start();
  let active=false,editing=false;
  draw.on('finish',(id)=>{
    const feature=draw.getSnapshot().find(f=>f.id===id);
    if(editing||feature?.geometry.type!=='LineString')return;
    const coordinates=feature.geometry.coordinates;
    draw.clear();draw.setMode('select');active=false;
    onDraft(coordinates);
  });
  return {
    start(){editing=false;active=true;draw.clear();draw.setMode('linestring');},
    edit(coordinates:number[][]){
      draw.clear();editing=true;active=true;draw.setMode('select');
      const id=draw.getFeatureId();
      const result=draw.addFeatures([{id,type:'Feature',geometry:{type:'LineString',coordinates},properties:{mode:'linestring'}}]);
      if(!result[0]?.valid){active=false;editing=false;throw new Error('This draft geometry could not be edited');}
      draw.selectFeature(id);
    },
    apply(){
      const feature=draw.getSnapshot().find(f=>f.geometry.type==='LineString');
      if(feature?.geometry.type!=='LineString')throw new Error('No editable draft found');
      const coords=feature.geometry.coordinates;active=false;editing=false;draw.clear();draw.setMode('select');onDraft(coords);
    },
    stop(){active=false;editing=false;draw.clear();draw.setMode('select');},active:()=>active
  };
}
