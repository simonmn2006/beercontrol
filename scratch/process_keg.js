const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');

async function processImage() {
  const img = await loadImage('/Users/simonmane/.gemini/antigravity/brain/c143f0ed-e58b-43f9-a3b2-687171f6336e/media__1777233855890.jpg');
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  
  const idata = ctx.getImageData(0, 0, img.width, img.height);
  const d = idata.data;
  const w = img.width, h = img.height;
  
  // Flood fill from corners
  const stack = [[0,0], [w-1,0], [0,h-1], [w-1,h-1]];
  const visited = new Uint8Array(w * h);
  
  while(stack.length) {
    const [x, y] = stack.pop();
    const idx = (y * w + x) * 4;
    const vIdx = y * w + x;
    if (x < 0 || x >= w || y < 0 || y >= h || visited[vIdx]) continue;
    visited[vIdx] = 1;
    
    const r = d[idx], g = d[idx+1], b = d[idx+2];
    if (r > 220 && g > 220 && b > 220) {
      d[idx+3] = 0;
      stack.push([x+1, y], [x-1, y], [x, y+1], [x, y-1]);
    }
  }

  // Handle cutouts (guess locations: center top)
  stack.push([Math.floor(w/2), Math.floor(h*0.1)]);
  stack.push([Math.floor(w/2), Math.floor(h*0.2)]);
  while(stack.length) {
    const [x, y] = stack.pop();
    const idx = (y * w + x) * 4;
    const vIdx = y * w + x;
    if (x < 0 || x >= w || y < 0 || y >= h || visited[vIdx]) continue;
    visited[vIdx] = 1;
    const r = d[idx], g = d[idx+1], b = d[idx+2];
    if (r > 150 && g > 150 && b > 150) {
      d[idx+3] = 0;
      stack.push([x+1, y], [x-1, y], [x, y+1], [x, y-1]);
    }
  }

  // Make the keg semi-transparent
  for(let i=0; i<d.length; i+=4) {
    if (d[i+3] > 0) {
      d[i+3] = 180; // 70% opacity so beer shows through
    }
  }

  ctx.putImageData(idata, 0, 0);
  
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync('./public/keg.png', buffer);
  console.log('Saved public/keg.png');
}

processImage().catch(console.error);
