// Browser segmentation: image -> detected glyph crops + bounding boxes
import { connectedComponents, mergeParts, orderBlobs } from './blob-core.js';

const PAD = 24;

function toGray(d) {
  const g = new Uint8Array(d.data.length / 4);
  for (let i=0,p=0; i<g.length; i++,p+=4)
    g[i] = (d.data[p]*77 + d.data[p+1]*150 + d.data[p+2]*29) >> 8;
  return g;
}

function normalise(g) {
  const hist = new Uint32Array(256);
  for (let v of g) hist[v]++;
  const total = g.length;
  let lo=0, hi=255, acc=0;
  for (let v=0;v<256;v++){acc+=hist[v];if(acc>=total*0.01){lo=v;break;}}
  acc=0;
  for (let v=255;v>=0;v--){acc+=hist[v];if(acc>=total*0.01){hi=v;break;}}
  const range=Math.max(1,hi-lo);
  const out=new Uint8Array(g.length);
  for (let i=0;i<g.length;i++) out[i]=Math.max(0,Math.min(255,Math.round((g[i]-lo)*255/range)));
  return out;
}

function localBg(gray, width, height) {
  const sw=Math.max(1,Math.round(width/32)), sh=Math.max(1,Math.round(height/32));
  const s=document.createElement('canvas'); s.width=sw; s.height=sh;
  s.getContext('2d').putImageData(grayToImg(gray,width,height),0,0);
  // downscale via canvas
  const sm=document.createElement('canvas'); sm.width=sw; sm.height=sh;
  sm.getContext('2d').drawImage(s,0,0,sw,sh);
  const big=document.createElement('canvas'); big.width=width; big.height=height;
  const bc=big.getContext('2d'); bc.imageSmoothingEnabled=true; bc.imageSmoothingQuality='high';
  bc.drawImage(sm,0,0,width,height);
  return toGray(bc.getImageData(0,0,width,height));
}

function grayToImg(g, width, height) {
  const img=new ImageData(width,height);
  for (let i=0,p=0;i<g.length;i++,p+=4){img.data[p]=img.data[p+1]=img.data[p+2]=g[i];img.data[p+3]=255;}
  return img;
}

function morph(ink, width, height, grow) {
  const out=new Uint8Array(ink);
  for (let y=0;y<height;y++) for (let x=0;x<width;x++) {
    const p=y*width+x;
    const l=x>0&&ink[p-1],r=x<width-1&&ink[p+1],u=y>0&&ink[p-width],d=y<height-1&&ink[p+width];
    if (grow&&!ink[p]&&(l||r||u||d)) out[p]=1;
    if (!grow&&ink[p]&&!(l&&r&&u&&d)) out[p]=0;
  }
  return out;
}

function binarize(imgData, delta=40) {
  const {width,height}=imgData;
  const gray=normalise(toGray(imgData));
  const bg=localBg(gray,width,height);
  let ink=new Uint8Array(width*height);
  for (let i=0;i<ink.length;i++) if (gray[i]<200 && gray[i]<bg[i]-delta) ink[i]=1;
  ink=morph(morph(ink,width,height,true),width,height,false);
  return ink;
}

function cropToCanvas(ink, imgWidth, blob) {
  const w=blob.x1-blob.x0+1, h=blob.y1-blob.y0+1;
  const cw=w+2*PAD, ch=h+2*PAD;
  const c=document.createElement('canvas'); c.width=cw; c.height=ch;
  const ctx=c.getContext('2d');
  const img=ctx.createImageData(cw,ch);
  img.data.fill(255);
  for (let y=0;y<h;y++) {
    const src=(blob.y0+y)*imgWidth+blob.x0;
    for (let x=0;x<w;x++) if (ink[src+x]) {
      const p=((y+PAD)*cw+(x+PAD))*4;
      img.data[p]=img.data[p+1]=img.data[p+2]=0; img.data[p+3]=255;
    }
  }
  ctx.putImageData(img,0,0);
  return { canvas: c, imageData: img };
}

export async function segmentFromImageData(imgData, { delta=40 }={}) {
  const {width,height}=imgData;
  const ink=binarize(imgData,delta);
  const minArea=Math.max(30,Math.round(width*height*3e-6));
  let boxes=connectedComponents(ink,width,height,minArea);
  boxes=boxes.filter(b=>b.x1-b.x0+1>=4&&b.y1-b.y0+1>=4);
  boxes=mergeParts(boxes);
  const ordered=orderBlobs(boxes);
  return ordered.map((blob,i) => {
    const {canvas,imageData}=cropToCanvas(ink,width,blob);
    return {
      id: i,
      blob,
      canvas,           // HTMLCanvasElement with the crop (for display)
      imageData,        // raw ImageData (for tracing)
      thumbUrl: canvas.toDataURL('image/png'),
      pad: PAD,
      row: blob.row,
    };
  });
}

// Re-crop a region from a full image using the same binarization as segmentation.
// Returns { canvas, imageData, thumbUrl } with pure black-on-white output.
export function recropFromImageData(fullImgData, x0, y0, x1, y1, delta=40) {
  const { width, height } = fullImgData;
  const ink = binarize(fullImgData, delta);
  const cx0 = Math.max(0, x0), cy0 = Math.max(0, y0);
  const cx1 = Math.min(width-1, x1), cy1 = Math.min(height-1, y1);
  const w = cx1 - cx0 + 1, h = cy1 - cy0 + 1;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const imd = ctx.createImageData(w, h);
  imd.data.fill(255);
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      if (ink[(cy0 + row) * width + (cx0 + col)]) {
        const p = (row * w + col) * 4;
        imd.data[p] = imd.data[p+1] = imd.data[p+2] = 0; imd.data[p+3] = 255;
      }
    }
  }
  ctx.putImageData(imd, 0, 0);
  return { canvas: c, imageData: imd, thumbUrl: c.toDataURL('image/png') };
}
