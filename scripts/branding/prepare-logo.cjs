// Derive scalable outlines from the approved transparent extraction.
// Run before generate-icons.swift. No fonts or remote assets are required.
const fs = require('node:fs');
const { getPngInfo } = require('@expo/image-utils');
const out = 'assets/brand';
const palette = { tile: '#909DC3', wordmark: '#7D89B1', action: '#57648E', ink: '#242A3D', paper: '#FCFBF8', mist: '#ECEEF6' };
function simplify(points, epsilon = 2.4) {
  if (points.length < 3) return points;
  const a = points[0], b = points.at(-1); let max = 0, index = 0;
  const dx = b[0] - a[0], dy = b[1] - a[1], den = dx * dx + dy * dy;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i], t = den ? Math.max(0, Math.min(1, ((p[0]-a[0])*dx+(p[1]-a[1])*dy)/den)) : 0;
    const distance = Math.hypot(p[0]-a[0]-t*dx, p[1]-a[1]-t*dy);
    if (distance > max) { max = distance; index = i; }
  }
  return max > epsilon ? [...simplify(points.slice(0,index+1),epsilon).slice(0,-1), ...simplify(points.slice(index),epsilon)] : [a,b];
}
function trace(mask, w, h, offsetX, offsetY) {
  const edges = new Map(), at = (x,y) => x >= 0 && x < w && y >= 0 && y < h && mask[y*w+x];
  const edge = (x,y,xx,yy) => {const k=y*(w+1)+x; if(!edges.has(k))edges.set(k,[]);edges.get(k).push(yy*(w+1)+xx);};
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(at(x,y)){
    if(!at(x,y-1))edge(x,y,x+1,y);
    if(!at(x+1,y))edge(x+1,y,x+1,y+1);
    if(!at(x,y+1))edge(x+1,y+1,x,y+1);
    if(!at(x-1,y))edge(x,y+1,x,y);
  }
  const contours=[];
  while(edges.size){const first=edges.keys().next().value;let current=first,loop=[];
    do {loop.push([current%(w+1),Math.floor(current/(w+1))]);let nexts=edges.get(current);if(!nexts)break;current=nexts.pop();if(!nexts.length)edges.delete(loop.at(-1)[1]*(w+1)+loop.at(-1)[0]);}while(current!==first&&loop.length<w*h);
    const area=Math.abs(loop.reduce((s,p,i)=>{let q=loop[(i+1)%loop.length];return s+p[0]*q[1]-q[0]*p[1];},0))/2;
    if(area<70)continue;
    const middle=Math.floor(loop.length/2);
    loop=[...simplify(loop.slice(0,middle+1)).slice(0,-1),...simplify([...loop.slice(middle),loop[0]]).slice(0,-1)];
    contours.push(loop.map(([x,y])=>[x-offsetX,y-offsetY]));
  }
  return contours;
}
function path(contours) {
  const n=v=>+v.toFixed(2), xy=p=>p.map(n).join(' '), mid=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2];
  return contours.map(points=>`M${xy(mid(points.at(-1),points[0]))}`+points.map((p,i)=>`Q${xy(p)} ${xy(mid(p,points[(i+1)%points.length]))}`).join('')+'Z').join('');
}
(async()=>{
 const {data,width:w,height:h}=await getPngInfo(`${out}/source/extracted-master.png`);
 // The extraction contains six intentional connected parts: tile, r, a, v, i, dot.
 const seen=new Uint8Array(w*h), parts=[];
 for(let i=0;i<w*h;i++){
  if(seen[i]||data[i*4+3]<128)continue;
  const q=[i];seen[i]=1;let minX=w,minY=h,maxX=0,maxY=0;
  for(let k=0;k<q.length;k++){let p=q[k],x=p%w,y=Math.floor(p/w);minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
   for(let next of [p-1,p+1,p-w,p+w])if(next>=0&&next<w*h&&!seen[next]&&data[next*4+3]>=128){seen[next]=1;q.push(next);}
  }
  if(q.length>1000)parts.push({pixels:q,box:[minX,minY,maxX+1,maxY+1]});
 }
 parts.sort((a,b)=>b.pixels.length-a.pixels.length);
 if(parts.length!==6)throw Error(`Expected 6 logo components, got ${parts.length}`);
 const tile=parts[0], bounds=[Math.min(...parts.map(p=>p.box[0])),Math.min(...parts.map(p=>p.box[1])),Math.max(...parts.map(p=>p.box[2])),Math.max(...parts.map(p=>p.box[3]))];
 const tileMask=new Uint8Array(w*h),textMask=new Uint8Array(w*h),glyphMask=new Uint8Array(w*h);
 for(const p of tile.pixels){tileMask[p]=1;if(data[p*4]>210&&data[p*4+1]>210&&data[p*4+2]>210)glyphMask[p]=1;}
 for(const part of parts.slice(1))for(const p of part.pixels)textMask[p]=1;
 const [x,y,right,bottom]=bounds;
 const geometry={width:right-x,height:bottom-y,tileSize:tile.box[2]-tile.box[0],palette,tile:trace(tileMask,w,h,x,y),glyph:trace(glyphMask,w,h,x,y),letters:trace(textMask,w,h,x,y)};
 const tilePath=path(geometry.tile),glyphPath=path(geometry.glyph),textPath=path(geometry.letters);
 function svg(variant,mark=false,glyph=false){
   const color=variant==='white'?'#FFFFFF':palette.ink;
   const body=glyph?`<path fill="${variant==='color'?'#FFFFFF':color}" d="${glyphPath}"/>`:variant==='color'?`<path fill="${palette.tile}" d="${tilePath}"/><path fill="#FFFFFF" d="${glyphPath}"/>${mark?'':`<path fill="${palette.wordmark}" d="${textPath}"/>`}`:`<path fill="${color}" fill-rule="evenodd" d="${tilePath}${glyphPath}${mark?'':textPath}"/>`;
   return `<svg xmlns="http://www.w3.org/2000/svg" width="${mark||glyph?geometry.tileSize:geometry.width}" height="${geometry.height}" viewBox="0 0 ${mark||glyph?geometry.tileSize:geometry.width} ${geometry.height}"><title>travi${mark?' symbol':''}</title>${body}</svg>\n`;
 }
 fs.writeFileSync(`${out}/geometry.json`,JSON.stringify(geometry));
 fs.writeFileSync(`${out}/tokens.json`,JSON.stringify({name:'travi',...palette},null,2)+'\n');
 for(const variant of ['color','white','dark'])for(const mark of [false,true]){
  const name=mark?`mark-${variant}`:`logo-${variant}`;
  fs.writeFileSync(`${out}/${name}.svg`,svg(variant,mark));
  fs.writeFileSync(`public/press-kit/logos/travi-${name}.svg`,svg(variant,mark));
 }
 fs.writeFileSync(`${out}/glyph-white.svg`,svg('white',false,true));
 console.log(`Prepared ${geometry.width} × ${geometry.height} lockup; ${geometry.tileSize} px mark. Removed stray background artifacts.`);
})();
