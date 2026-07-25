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

// Otsu's method: find optimal global threshold from histogram.
// Works on any image size, no spatial estimation needed.
function otsuThreshold(gray) {
  const hist = new Uint32Array(256);
  for (let v of gray) hist[v]++;
  const total = gray.length;
  let sum = 0;
  for (let v = 0; v < 256; v++) sum += v * hist[v];
  let sumB = 0, wB = 0, best = 0, thresh = 0;
  for (let v = 0; v < 256; v++) {
    wB += hist[v];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += v * hist[v];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; thresh = v; }
  }
  return thresh;
}

function binarize(imgData, delta=40) {
  const {width,height}=imgData;
  const gray=normalise(toGray(imgData));

  // For large images use adaptive localBg (works well with enough pixels).
  // For small patches (crop editor) use Otsu — localBg degenerates to
  // a flat 1-4 pixel map at this scale and gives wrong background values.
  const SMALL = 300; // either dimension below this → use Otsu
  let ink=new Uint8Array(width*height);
  if (width < SMALL || height < SMALL) {
    const thresh = otsuThreshold(gray);
    // delta shifts the Otsu threshold darker (higher delta = stricter)
    const t = Math.max(0, thresh - Math.round(delta * 0.3));
    for (let i=0;i<ink.length;i++) if (gray[i] < t) ink[i]=1;
  } else {
    const bg=localBg(gray,width,height);
    for (let i=0;i<ink.length;i++) if (gray[i]<200 && gray[i]<bg[i]-delta) ink[i]=1;
  }
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
  const cx0 = Math.max(0, x0), cy0 = Math.max(0, y0);
  const cx1 = Math.min(width-1, x1), cy1 = Math.min(height-1, y1);
  const w = cx1 - cx0 + 1, h = cy1 - cy0 + 1;

  // Extract just the cropped region into its own ImageData,
  // then binarize that patch alone — so localBg only sees the
  // local paper/ink context, not the whole image.
  const patch = new ImageData(w, h);
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const sp = ((cy0 + row) * width + (cx0 + col)) * 4;
      const dp = (row * w + col) * 4;
      patch.data[dp]   = fullImgData.data[sp];
      patch.data[dp+1] = fullImgData.data[sp+1];
      patch.data[dp+2] = fullImgData.data[sp+2];
      patch.data[dp+3] = fullImgData.data[sp+3];
    }
  }

  // Binarize just the patch — localBg now sees only this region
  const ink = binarize(patch, delta);

  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const imd = ctx.createImageData(w, h);
  imd.data.fill(255);
  for (let i = 0; i < ink.length; i++) {
    if (ink[i]) {
      const p = i * 4;
      imd.data[p] = imd.data[p+1] = imd.data[p+2] = 0; imd.data[p+3] = 255;
    }
  }
  ctx.putImageData(imd, 0, 0);
  return { canvas: c, imageData: imd, thumbUrl: c.toDataURL('image/png') };
}
