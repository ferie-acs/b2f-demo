import { el } from './dom.js';
import { VILLES } from './carte-geographie.js';
import { carteMarche } from './carte-marche.js';

let library;
export function charger(){
  if(!library){
    const css=document.createElement('link');css.rel='stylesheet';css.href='https://unpkg.com/maplibre-gl@5.6.0/dist/maplibre-gl.css';document.head.append(css);
    library=new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src='https://unpkg.com/maplibre-gl@5.6.0/dist/maplibre-gl.js';script.onload=()=>resolve(window.maplibregl);script.onerror=()=>reject(new Error('Moteur cartographique inaccessible'));document.head.append(script);
    }).catch(e=>{library=null;throw e;});
  }
  return library;
}
/** Relief réel (Mapzen), carte OSM ; les liaisons restent indicatives. */
export function carteRelief(surVille){
  const canvas=el('div.th-relief-canvas',{'aria-label':'Carte géographique 3D de Côte d’Ivoire'});
  const status=el('p.th-relief-status',{'aria-live':'polite',text:'Chargement de la carte et du relief…'});
  const fallback=el('div.th-relief-fallback');
  const controls=el('div.th-relief-toolbar');
  const element=el('div.th-relief',{},[canvas,controls,status,fallback]);
  let state={offres:[]},map,lib,ready=false,dead=false,started=false,markers=[],previous='',timer;
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  const duration=()=>reduced()?0:700;
  const button=(text,fn)=>el('button',{type:'button',text,on:{click:fn}});
  function overview(){map?.easeTo({center:[-5.6,7.45],zoom:6.25,pitch:52,bearing:-10,duration:duration()});}
  const flat=button('Vue 2D',()=>{const is3D=map.getPitch()>10;map.easeTo({pitch:is3D?0:55,bearing:is3D?0:-10,duration:duration()});flat.textContent=is3D?'Vue 3D':'Vue 2D';});
  controls.append(button('Vue pays',overview),flat,button('Relief de Man',()=>map?.flyTo({center:[-7.58,7.43],zoom:10.5,pitch:65,bearing:-25,duration:duration()})));
  controls.hidden=true;
  function local(){fallback.replaceChildren(carteMarche({...state,surVille}));}
  function paint(){
    if(!ready)return;
    markers.forEach(m=>m.remove());markers=[];
    for(const [id,v] of Object.entries(VILLES)){
      const count=state.offres.filter(o=>o.departId===id).length;
      const active=id===state.depart||id===state.selection?.departId||id===state.selection?.arriveeId;
      const node=el('button',{type:'button',class:`th-relief-pin${active?' active':''}`,'aria-label':`${v.nom}, ${count} annonces au départ`,'aria-pressed':String(id===state.depart),on:{click:()=>surVille(id===state.depart?'':id)}},[el('span',{text:v.nom}),...(count?[el('b',{text:String(count)})]:[])]);
      markers.push(new lib.Marker({element:node,anchor:'bottom'}).setLngLat([v.lon,v.lat]).addTo(map));
    }
    const a=VILLES[state.selection?.departId],b=VILLES[state.selection?.arriveeId];
    map.getSource('b2f-route').setData({type:'FeatureCollection',features:a&&b?[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:[[a.lon,a.lat],[b.lon,b.lat]]}}]:[]});
    if(previous&&previous!==state.selection?.id&&a&&b){map.fitBounds([[Math.min(a.lon,b.lon),Math.min(a.lat,b.lat)],[Math.max(a.lon,b.lon),Math.max(a.lat,b.lat)]],{padding:{top:120,bottom:160,left:65,right:65},maxZoom:8,pitch:52,duration:duration()});}
    previous=state.selection?.id||'';
  }
  function fail(){if(dead)return;clearTimeout(timer);ready=false;map?.remove();map=null;canvas.hidden=true;controls.hidden=true;fallback.hidden=false;status.textContent='Carte 3D indisponible : carte simplifiée affichée. Vérifiez votre connexion ou la prise en charge WebGL.';local();}
  async function start(){
    if(started||dead)return;started=true;
    try{
      lib=await charger();if(dead)return;
      map=new lib.Map({container:canvas,center:[-5.6,7.45],zoom:6.25,pitch:52,bearing:-10,maxPitch:75,minZoom:5,maxZoom:16,cooperativeGestures:true,
        style:{version:8,sources:{
          hillshade:{type:'raster-dem',tiles:['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],encoding:'terrarium',tileSize:256,maxzoom:15},
          osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,maxzoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'},
          elevation:{type:'raster-dem',tiles:['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],encoding:'terrarium',tileSize:256,maxzoom:15,attribution:'Relief : <a href="https://registry.opendata.aws/terrain-tiles/">Mapzen / AWS Open Data</a>'}
        },layers:[{id:'basemap',type:'raster',source:'osm',paint:{'raster-saturation':-.22}},{id:'relief-shadow',type:'hillshade',source:'hillshade',paint:{'hillshade-exaggeration':.5,'hillshade-shadow-color':'#304e48','hillshade-highlight-color':'#fff9e8'}}],terrain:{source:'elevation',exaggeration:1.8}}
      });
      map.on('pitchend',()=>{flat.textContent=map.getPitch()>10?'Vue 2D':'Vue 3D';});
      map.addControl(new lib.NavigationControl({visualizePitch:true}),'top-right');
      map.addControl(new lib.ScaleControl({unit:'metric'}),'bottom-left');
      timer=setTimeout(()=>{if(!ready)fail();},25000);
      map.on('error',e=>{if(e.sourceId==='elevation')status.textContent='Relief temporairement indisponible · fond géographique conservé.';});
      map.on('load',()=>{
        if(dead||!map)return;clearTimeout(timer);
        map.addSource('b2f-route',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
        map.addLayer({id:'b2f-route-halo',type:'line',source:'b2f-route',paint:{'line-color':'#fff','line-width':8,'line-opacity':.85}});
        map.addLayer({id:'b2f-route',type:'line',source:'b2f-route',paint:{'line-color':'#f38a0b','line-width':4,'line-dasharray':[2,1]}});
        ready=true;fallback.hidden=true;controls.hidden=false;status.textContent='Relief ×1,8 · liaison indicative, sans suivi GPS. Faites glisser pour explorer.';paint();map.resize();
      });
    }catch(e){console.warn('Carte 3D :',e);fail();}
  }
  const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();start();}},{rootMargin:'250px'});observer.observe(element);
  const resize=new ResizeObserver(()=>map?.resize());resize.observe(element);
  function destroy(){dead=true;clearTimeout(timer);observer.disconnect();resize.disconnect();markers.forEach(m=>m.remove());map?.remove();window.removeEventListener('hashchange',destroy);}
  window.addEventListener('hashchange',destroy);
  return {element,update(next){state=next;if(ready)paint();else if(started&&!map)local();},destroy};
}
