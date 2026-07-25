import React, { useRef, useEffect, useState, useCallback } from 'react';

const COLORS = [
  '#7f9cf5','#4ade80','#f59e0b','#f87171','#a78bfa',
  '#34d399','#fb923c','#38bdf8','#e879f9','#facc15',
];
const PAD = 24; // must match segmenter PAD

function color(i) { return COLORS[i % COLORS.length]; }

export default function CropReviewPage({ imageUrl, glyphs, onConfirm, onBack }) {
  const canvasRef   = useRef(null);
  const overlayRef  = useRef(null);
  const [boxes, setBoxes]       = useState(() => glyphs.map(g => ({ ...g.blob })));
  const [selected, setSelected] = useState(null);
  const [drag, setDrag]         = useState(null); // {idx, type:'move'|'tl'|'tr'|'bl'|'br', ox,oy,bx0,by0,bx1,by1}
  const [imgSize, setImgSize]   = useState({ w: 1, h: 1, scale: 1 });
  const [merging, setMerging]   = useState(false); // waiting for 2nd tap to merge
  const [mergeFirst, setMergeFirst] = useState(null);

  // Load original image into canvas
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const maxW = window.innerWidth - 32;
      const maxH = window.innerHeight * 0.6;
      const scale = Math.min(1, maxW / img.width, maxH / img.height);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      setImgSize({ w, h, scale });
      const c = canvasRef.current;
      if (!c) return;
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
    };
    img.src = imageUrl;
  }, [imageUrl]);

  // Draw overlay boxes
  useEffect(() => {
    const c = overlayRef.current;
    if (!c) return;
    const { w, h, scale } = imgSize;
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    boxes.forEach((b, i) => {
      const x0 = b.x0 * scale, y0 = b.y0 * scale;
      const x1 = b.x1 * scale, y1 = b.y1 * scale;
      const col = color(i);
      const isSel = selected === i;
      ctx.strokeStyle = col;
      ctx.lineWidth = isSel ? 3 : 2;
      ctx.setLineDash(isSel ? [] : []);
      ctx.globalAlpha = isSel ? 1 : 0.8;
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      ctx.fillStyle = col;
      ctx.globalAlpha = isSel ? 0.18 : 0.07;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.globalAlpha = 1;
      // Label
      const label = mergeFirst === i ? '⊕' : String(i + 1);
      ctx.font = `bold ${Math.max(10, Math.min(14, (y1-y0)*0.35))}px system-ui`;
      ctx.fillStyle = col;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(x0 + 2, y0 + 2, tw + 6, 18);
      ctx.fillStyle = col;
      ctx.fillText(label, x0 + 5, y0 + 15);
      // Resize handles if selected
      if (isSel) {
        const handles = [[x0,y0],[x1,y0],[x0,y1],[x1,y1]];
        handles.forEach(([hx,hy]) => {
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(hx, hy, 7, 0, Math.PI*2);
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        });
      }
    });
  }, [boxes, selected, imgSize, mergeFirst]);

  const hitTest = useCallback((cx, cy) => {
    const { scale } = imgSize;
    const HANDLE = 14;
    for (let i = boxes.length - 1; i >= 0; i--) {
      const b = boxes[i];
      const x0=b.x0*scale, y0=b.y0*scale, x1=b.x1*scale, y1=b.y1*scale;
      if (selected === i) {
        if (Math.hypot(cx-x0,cy-y0)<HANDLE) return {idx:i,type:'tl'};
        if (Math.hypot(cx-x1,cy-y0)<HANDLE) return {idx:i,type:'tr'};
        if (Math.hypot(cx-x0,cy-y1)<HANDLE) return {idx:i,type:'bl'};
        if (Math.hypot(cx-x1,cy-y1)<HANDLE) return {idx:i,type:'br'};
      }
      if (cx>=x0&&cx<=x1&&cy>=y0&&cy<=y1) return {idx:i,type:'move'};
    }
    return null;
  }, [boxes, selected, imgSize]);

  const getPos = (e) => {
    const r = overlayRef.current.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX - r.left, y: src.clientY - r.top };
  };

  const onPointerDown = useCallback((e) => {
    e.preventDefault();
    const { x, y } = getPos(e);
    const hit = hitTest(x, y);
    if (!hit) { setSelected(null); setMerging(false); setMergeFirst(null); return; }

    if (merging) {
      if (mergeFirst === null) {
        setMergeFirst(hit.idx);
      } else if (mergeFirst !== hit.idx) {
        // Merge two boxes
        const a = boxes[mergeFirst], b = boxes[hit.idx];
        const merged = { x0:Math.min(a.x0,b.x0), y0:Math.min(a.y0,b.y0), x1:Math.max(a.x1,b.x1), y1:Math.max(a.y1,b.y1) };
        const keep = Math.min(mergeFirst, hit.idx);
        const drop = Math.max(mergeFirst, hit.idx);
        setBoxes(prev => { const n=[...prev]; n[keep]=merged; n.splice(drop,1); return n; });
        setMerging(false); setMergeFirst(null); setSelected(keep);
      }
      return;
    }

    setSelected(hit.idx);
    const b = boxes[hit.idx];
    const { scale } = imgSize;
    setDrag({ idx:hit.idx, type:hit.type, ox:x, oy:y,
      bx0:b.x0, by0:b.y0, bx1:b.x1, by1:b.y1, scale });
  }, [hitTest, merging, mergeFirst, boxes, imgSize]);

  const onPointerMove = useCallback((e) => {
    if (!drag) return;
    e.preventDefault();
    const { x, y } = getPos(e);
    const dx = (x - drag.ox) / drag.scale;
    const dy = (y - drag.oy) / drag.scale;
    setBoxes(prev => {
      const n = [...prev];
      const b = { ...n[drag.idx] };
      const MIN = 10;
      if (drag.type === 'move') {
        const w=b.x1-b.x0, h=b.y1-b.y0;
        b.x0=Math.max(0,drag.bx0+dx); b.y0=Math.max(0,drag.by0+dy);
        b.x1=b.x0+w; b.y1=b.y0+h;
      } else {
        if (drag.type==='tl'||drag.type==='bl') b.x0=Math.min(drag.bx1-MIN,drag.bx0+dx);
        if (drag.type==='tr'||drag.type==='br') b.x1=Math.max(drag.bx0+MIN,drag.bx1+dx);
        if (drag.type==='tl'||drag.type==='tr') b.y0=Math.min(drag.by1-MIN,drag.by0+dy);
        if (drag.type==='bl'||drag.type==='br') b.y1=Math.max(drag.by0+MIN,drag.by1+dy);
      }
      n[drag.idx]=b; return n;
    });
  }, [drag]);

  const onPointerUp = useCallback(() => setDrag(null), []);

  const deleteSelected = () => {
    if (selected === null) return;
    setBoxes(prev => prev.filter((_,i)=>i!==selected));
    setSelected(null);
  };

  const addBox = () => {
    // Add a new box in the center of the image
    const { w, h, scale } = imgSize;
    const cx = Math.round(w / 2 / scale), cy = Math.round(h / 2 / scale);
    const half = 40;
    setBoxes(prev => [...prev, { x0:cx-half, y0:cy-half, x1:cx+half, y1:cy+half }]);
    setSelected(boxes.length);
  };

  const confirmCrops = () => {
    // Rebuild glyphs from adjusted boxes using the original imageData from glyphs[0]
    // We need to re-crop from original image using the adjusted blob coords
    const img = new Image();
    img.onload = () => {
      const tmp = document.createElement('canvas');
      tmp.width = img.width; tmp.height = img.height;
      const ctx = tmp.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const fullImgData = ctx.getImageData(0, 0, img.width, img.height);
      const newGlyphs = boxes.map((b, i) => {
        const x0=Math.round(b.x0), y0=Math.round(b.y0);
        const x1=Math.round(b.x1), y1=Math.round(b.y1);
        const w=x1-x0+1, h=y1-y0+1;
        const cw=w+2*PAD, ch=h+2*PAD;
        const c=document.createElement('canvas'); c.width=cw; c.height=ch;
        const cx=c.getContext('2d');
        const imd=cx.createImageData(cw,ch); imd.data.fill(255);
        for (let row=0;row<h;row++) {
          for (let col=0;col<w;col++) {
            const sp=((y0+row)*img.width+(x0+col))*4;
            const dp=((row+PAD)*cw+(col+PAD))*4;
            imd.data[dp]=fullImgData.data[sp];
            imd.data[dp+1]=fullImgData.data[sp+1];
            imd.data[dp+2]=fullImgData.data[sp+2];
            imd.data[dp+3]=fullImgData.data[sp+3];
          }
        }
        cx.putImageData(imd, 0, 0);
        return {
          id: i, blob: b, canvas: c, imageData: imd,
          thumbUrl: c.toDataURL('image/png'),
          pad: PAD, row: glyphs[i]?.row ?? 0,
        };
      });
      onConfirm(newGlyphs);
    };
    img.src = imageUrl;
  };

  const { w, h } = imgSize;

  return (
    <div>
      <div style={{ marginBottom:16 }}>
        <h2 style={{ fontSize:'1.3rem', marginBottom:4 }}>Review Detected Characters</h2>
        <p style={{ color:'var(--muted)', fontSize:'0.88rem' }}>
          {boxes.length} regions detected. Drag boxes to reposition · drag corners to resize · tap to select then delete · merge two overlapping crops.
        </p>
      </div>

      {/* Toolbar */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:12, alignItems:'center' }}>
        <button onClick={deleteSelected} disabled={selected===null}
          style={{ padding:'7px 14px', background:'rgba(248,113,113,0.12)', border:'1px solid var(--danger)',
            borderRadius:7, color:'var(--danger)', fontSize:'0.85rem', opacity: selected===null?0.45:1 }}>
          🗑 Delete #{selected!==null?selected+1:''}
        </button>
        <button onClick={() => { setMerging(m=>!m); setMergeFirst(null); setSelected(null); }}
          style={{ padding:'7px 14px', background: merging?'var(--accent2)':'var(--surface2)',
            border:`1px solid ${merging?'var(--accent2)':'var(--border)'}`,
            borderRadius:7, color: merging?'#fff':'var(--text)', fontSize:'0.85rem' }}>
          {merging ? (mergeFirst!==null ? `Tap 2nd box to merge with #${mergeFirst+1}` : 'Tap first box…') : '⊕ Merge two boxes'}
        </button>
        <button onClick={addBox}
          style={{ padding:'7px 14px', background:'var(--surface2)', border:'1px solid var(--border)',
            borderRadius:7, color:'var(--text)', fontSize:'0.85rem' }}>
          + Add box
        </button>
        <span style={{ color:'var(--muted)', fontSize:'0.82rem', marginLeft:'auto' }}>
          {boxes.length} characters
        </span>
      </div>

      {/* Canvas stack */}
      <div style={{ position:'relative', width:w, height:h, maxWidth:'100%',
        borderRadius:8, overflow:'hidden', border:'1px solid var(--border)',
        touchAction:'none', userSelect:'none', marginBottom:16 }}>
        <canvas ref={canvasRef} style={{ position:'absolute', top:0, left:0, display:'block' }} />
        <canvas ref={overlayRef}
          style={{ position:'absolute', top:0, left:0, display:'block', cursor: drag?'grabbing':'crosshair' }}
          onMouseDown={onPointerDown} onMouseMove={onPointerMove} onMouseUp={onPointerUp} onMouseLeave={onPointerUp}
          onTouchStart={onPointerDown} onTouchMove={onPointerMove} onTouchEnd={onPointerUp}
        />
      </div>

      {/* Thumbnails strip */}
      <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:8, marginBottom:20 }}>
        {boxes.map((b,i) => (
          <div key={i} onClick={()=>setSelected(selected===i?null:i)}
            style={{ flexShrink:0, border:`2px solid ${selected===i?color(i):'var(--border)'}`,
              borderRadius:6, overflow:'hidden', cursor:'pointer', background:'#fff',
              width:48, height:48, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.65rem', color:'#333', fontWeight:700 }}>#{i+1}</span>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
        <button onClick={onBack}
          style={{ padding:'10px 22px', background:'var(--surface2)', border:'1px solid var(--border)',
            borderRadius:8, color:'var(--text)', fontSize:'0.92rem' }}>
          ← Re-upload
        </button>
        <button onClick={confirmCrops} className="btn-primary"
          style={{ padding:'10px 28px', fontSize:'0.95rem' }}>
          Confirm {boxes.length} crops → Map Glyphs
        </button>
      </div>
    </div>
  );
}
