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
  let active=false;
  draw.on('finish',(id)=>{
    const feature=draw.getSnapshot().find(f=>f.id===id);
    if(feature?.geometry.type!=='LineString')return;
    const coordinates=feature.geometry.coordinates;
    draw.clear();draw.setMode('select');active=false;
    onDraft(coordinates);
  });
  return {start(){active=true;draw.setMode('linestring');},stop(){active=false;draw.clear();draw.setMode('select');},active:()=>active};
}
