// High-contrast lettering on a coloured panel can disappear in a page-oriented OCR pass.
// These crops are proposed by image pixels. A colour alone never supplies a word or a design claim.
const maxPanels = 4;
const margin = 10;

function channels(word) {
  return [word >>> 24, (word >>> 16) & 255, (word >>> 8) & 255];
}
const luma = (r, g, b) => .299 * r + .587 * g + .114 * b;
function hueGroup(r, g, b) {
  const high = Math.max(r,g,b), low = Math.min(r,g,b), delta = high-low;
  if (delta < 55 || high < 75 || low > .7 * high) return 0;
  const hue = high === r ? (g-b)/delta : high === g ? 2 + (b-r)/delta : 4 + (r-g)/delta;
  return 1 + ((Math.floor(hue + .5) + 6) % 6);
}

function findPanels(width, height, rgbAt) {
  const step = Math.max(1, Math.ceil(Math.max(width, height)/160));
  const cols = Math.ceil(width/step), rows = Math.ceil(height/step);
  const groups = new Uint8Array(cols*rows), light = new Uint8Array(cols*rows);
  for (let i=0; i<groups.length; i++) {
    const [r,g,b] = channels(rgbAt((i%cols)*step, Math.floor(i/cols)*step));
    groups[i] = hueGroup(r,g,b); light[i] = Math.round(luma(r,g,b));
  }
  const panels = [], stack = new Int32Array(groups.length);
  for (let start=0; start<groups.length; start++) {
    const group = groups[start];
    if (!group) continue;
    let left=cols, right=0, top=rows, bottom=0, count=0, sum=0, size=1;
    stack[0]=start; groups[start]=0;
    while (size) {
      const i=stack[--size], x=i%cols, y=Math.floor(i/cols);
      left=Math.min(left,x); right=Math.max(right,x); top=Math.min(top,y); bottom=Math.max(bottom,y);
      count++; sum+=light[i];
      for (const neighbor of [x ? i-1 : -1, x+1<cols ? i+1 : -1, y ? i-cols : -1, y+1<rows ? i+cols : -1]) {
        if (neighbor>=0 && groups[neighbor]===group) { groups[neighbor]=0; stack[size++]=neighbor; }
      }
    }
    const w=right-left+1, h=bottom-top+1, area=w*h;
    if (count<35 || area>.46*cols*rows || count/area<.38 || w/h<=.4 || w/h>=8 || w<.035*cols || h<.035*rows) continue;
    panels.push({count, left:left*step, top:top*step, right:Math.min(width,(right+1)*step), bottom:Math.min(height,(bottom+1)*step), background:sum/count});
  }
  return panels.sort((a,b)=>b.count-a.count).slice(0,maxPanels);
}

/** Convert candidate panels into small masks with dark text on white, preserving the source transform. */
export function panelMasks(module, api) {
  const pix=api.GetInputImage();
  if (!pix || pix.d!==32) return [];
  const ptr=pix.data, stride=pix.wpl, width=pix.w, height=pix.h;
  const rgbAt=(x,y)=>module.getValue(ptr+4*(y*stride+x),'i32')>>>0;
  const results=[];
  for (const panel of findPanels(width,height,rgbAt)) {
    const w=panel.right-panel.left, h=panel.bottom-panel.top;
    const x=panel.left+Math.round(.04*w), y=panel.top+Math.round(.17*h);
    const sourceW=panel.right-Math.round(.04*w)-x, sourceH=panel.bottom-Math.round(.17*h)-y;
    const scale=Math.min(1,540/sourceW,340/sourceH);
    const innerW=Math.max(1,Math.round(sourceW*scale)), innerH=Math.max(1,Math.round(sourceH*scale));
    const targetW=innerW+2*margin, targetH=innerH+2*margin;
    const header=new TextEncoder().encode(`P5\n${targetW} ${targetH}\n255\n`);
    const masks=[new Uint8Array(header.length+targetW*targetH),new Uint8Array(header.length+targetW*targetH)];
    const counts=[0,0];
    for (const mask of masks) { mask.fill(255); mask.set(header); }
    for (let j=0;j<innerH;j++) for (let i=0;i<innerW;i++) {
      const [r,g,b]=channels(rgbAt(x+Math.floor(i*sourceW/innerW),y+Math.floor(j*sourceH/innerH)));
      const brightness=luma(r,g,b), chroma=Math.max(r,g,b)-Math.min(r,g,b);
      let ink=-1;
      if (brightness>Math.max(125,panel.background+38) && chroma<100) ink=0;
      else if (brightness<Math.min(105,panel.background-40) && chroma<75) ink=1;
      if (ink>=0) { masks[ink][header.length+(j+margin)*targetW+i+margin]=0; counts[ink]++; }
    }
    for (let k=0;k<masks.length;k++) {
      const coverage=counts[k]/(innerW*innerH);
      if (coverage>.013 && coverage<.5) results.push({pgm:masks[k],targetW,targetH,innerW,innerH,margin,x,y,sourceW,sourceH});
    }
  }
  return results;
}

export function sourceBox(box,mask,width,height) {
  const x=(n)=>(mask.x+(Math.min(mask.innerW,Math.max(0,n*mask.targetW-mask.margin)))*mask.sourceW/mask.innerW)/width;
  const y=(n)=>(mask.y+(Math.min(mask.innerH,Math.max(0,n*mask.targetH-mask.margin)))*mask.sourceH/mask.innerH)/height;
  return {xmin:x(box.xmin),ymin:y(box.ymin),xmax:x(box.xmax),ymax:y(box.ymax)};
}
