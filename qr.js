/* Générateur de QR code maison — mode octets, versions 1 à 10, correction M, choix du masque
   par pénalité (ISO/IEC 18004). Écrit pour Tome : aucune bibliothèque externe ne peut être
   chargée (CSP script-src 'self'), et un QR d'invitation ne doit pas transiter par un service
   tiers (le lien contient ton pseudo). Exposé en global `tomeQR` ; utilisable aussi sous Node
   (tests) via module.exports. */
(function(root){
  'use strict';

  // ---- GF(256), polynôme 0x11D ----
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  (function(){ let x = 1; for(let i=0;i<255;i++){ EXP[i]=x; LOG[x]=i; x <<= 1; if(x & 0x100) x ^= 0x11D; } for(let i=255;i<512;i++) EXP[i]=EXP[i-255]; })();
  const gmul = (a,b) => (a===0||b===0) ? 0 : EXP[LOG[a]+LOG[b]];

  // ---- Tables (niveau M) : [total codewords, ec/bloc, blocs groupe 1, data/bloc g1, blocs g2, data/bloc g2] ----
  const VER = {
    1:[26,10,1,16,0,0], 2:[44,16,1,28,0,0], 3:[70,26,1,44,0,0], 4:[100,18,2,32,0,0], 5:[134,24,2,43,0,0],
    6:[172,16,4,27,0,0], 7:[196,18,4,31,0,0], 8:[242,22,2,38,2,39], 9:[292,22,3,36,2,37], 10:[346,26,4,43,1,44],
  };
  const ALIGN = { 1:[], 2:[6,18], 3:[6,22], 4:[6,26], 5:[6,30], 6:[6,34], 7:[6,22,38], 8:[6,24,42], 9:[6,26,46], 10:[6,28,50] };
  const dataCap = v => { const t = VER[v]; return t[2]*t[3] + t[4]*t[5]; };

  function utf8(str){ return Array.from(new TextEncoder().encode(String(str))); }

  function chooseVersion(nBytes){
    for(let v=1; v<=10; v++){
      const countBits = v <= 9 ? 8 : 16;
      const needed = Math.ceil((4 + countBits + nBytes*8) / 8);
      if(needed <= dataCap(v)) return v;
    }
    return 0; // trop long pour la plage gérée
  }

  // ---- bits de données + remplissage ----
  function dataBits(bytes, v){
    const bits = [];
    const push = (val, n) => { for(let i=n-1;i>=0;i--) bits.push((val>>i)&1); };
    push(0b0100, 4);
    push(bytes.length, v <= 9 ? 8 : 16);
    for(const b of bytes) push(b, 8);
    const capBits = dataCap(v)*8;
    for(let i=0;i<4 && bits.length<capBits;i++) bits.push(0);
    while(bits.length % 8) bits.push(0);
    const out = [];
    for(let i=0;i<bits.length;i+=8){ let x=0; for(let j=0;j<8;j++) x = (x<<1)|bits[i+j]; out.push(x); }
    const pads = [0xEC, 0x11]; let k=0;
    while(out.length < dataCap(v)) out.push(pads[(k++)&1]);
    return out;
  }

  // ---- Reed-Solomon ----
  function rsGenerator(n){
    let g = [1];
    for(let i=0;i<n;i++){
      const ng = new Array(g.length+1).fill(0);
      for(let j=0;j<g.length;j++){ ng[j] ^= g[j]; ng[j+1] ^= gmul(g[j], EXP[i]); }
      g = ng;
    }
    return g;
  }
  function rsEncode(data, n){
    const g = rsGenerator(n);
    const res = new Array(n).fill(0);
    for(const d of data){
      const f = d ^ res[0];
      res.shift(); res.push(0);
      if(f) for(let j=0;j<n;j++) res[j] ^= gmul(g[j+1], f);
    }
    return res;
  }

  function codewords(bytes, v){
    const [, ec, b1, d1, b2, d2] = VER[v];
    const data = dataBits(bytes, v);
    const blocks = [], ecs = [];
    let p = 0;
    for(let i=0;i<b1;i++){ const d = data.slice(p, p+d1); p += d1; blocks.push(d); ecs.push(rsEncode(d, ec)); }
    for(let i=0;i<b2;i++){ const d = data.slice(p, p+d2); p += d2; blocks.push(d); ecs.push(rsEncode(d, ec)); }
    const out = [];
    const maxD = Math.max(d1, d2||0);
    for(let i=0;i<maxD;i++) for(const b of blocks) if(i < b.length) out.push(b[i]);
    for(let i=0;i<ec;i++) for(const e of ecs) out.push(e[i]);
    return out;
  }

  // ---- matrice ----
  function makeMatrix(v){
    const n = v*4+17;
    const m = Array.from({length:n}, ()=>new Int8Array(n).fill(-1)); // -1 = libre
    const set = (x,y,val) => { if(x>=0&&y>=0&&x<n&&y<n) m[y][x] = val?1:0; };
    const finder = (cx,cy) => { for(let dy=-4;dy<=4;dy++) for(let dx=-4;dx<=4;dx++){
      const ax=Math.abs(dx), ay=Math.abs(dy), d=Math.max(ax,ay);
      set(cx+dx, cy+dy, d<=3 && d!==2 ? (d===3 || d<=1 ? 1 : 0) : 0);
    } };
    finder(3,3); finder(n-4,3); finder(3,n-4);
    // motifs de synchro
    for(let i=8;i<n-8;i++){ if(m[6][i]===-1) m[6][i] = i%2===0?1:0; if(m[i][6]===-1) m[i][6] = i%2===0?1:0; }
    // alignement
    const al = ALIGN[v];
    for(const cy of al) for(const cx of al){
      if(m[cy][cx] !== -1 && !(cy===6 && cx===6 && false)){ /* chevauche un finder ? */ }
      // ignorer ceux qui touchent les finders
      if((cx<=8 && cy<=8) || (cx>=n-9 && cy<=8) || (cx<=8 && cy>=n-9)) continue;
      for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++){ const d=Math.max(Math.abs(dx),Math.abs(dy)); set(cx+dx, cy+dy, d!==1); }
    }
    // réserve format (sera écrite ensuite) + module sombre
    for(let i=0;i<9;i++){ if(m[8][i]===-1) m[8][i]=0; if(m[i][8]===-1) m[i][8]=0; }
    for(let i=n-8;i<n;i++){ if(m[8][i]===-1) m[8][i]=0; if(m[i][8]===-1) m[i][8]=0; }
    m[n-8][8] = 1;
    // réserve version (v>=7)
    if(v>=7){ for(let i=0;i<6;i++) for(let j=0;j<3;j++){ m[i][n-11+j]=0; m[n-11+j][i]=0; } }
    return m;
  }

  function placeData(m, cw){
    const n = m.length;
    const bits = []; for(const c of cw) for(let i=7;i>=0;i--) bits.push((c>>i)&1);
    let k = 0, up = true;
    for(let x=n-1; x>0; x-=2){
      if(x===6) x--;
      for(let i=0;i<n;i++){
        const y = up ? n-1-i : i;
        for(const dx of [0,1]){
          const xx = x-dx;
          if(m[y][xx] === -1){ m[y][xx] = k < bits.length ? bits[k] : 0; m[y][xx] |= 0; k++; }
        }
      }
      up = !up;
    }
    return m; // les modules données sont désormais 0/1 ; on marque lesquels via une copie de masque
  }

  function functionMask(v){ // true = module de fonction (ne pas masquer)
    const m = makeMatrix(v); const n = m.length;
    return m.map(row => Array.from(row, x => x !== -1));
  }

  const MASKS = [
    (x,y)=>(x+y)%2===0, (x,y)=>y%2===0, (x,y)=>x%3===0, (x,y)=>(x+y)%3===0,
    (x,y)=>(Math.floor(y/2)+Math.floor(x/3))%2===0, (x,y)=>((x*y)%2+(x*y)%3)===0,
    (x,y)=>(((x*y)%2+(x*y)%3)%2)===0, (x,y)=>(((x+y)%2+(x*y)%3)%2)===0,
  ];

  function bch15(data){ // format : 5 bits → 15 bits
    let d = data << 10;
    for(let i=14;i>=10;i--) if((d>>i)&1) d ^= 0x537 << (i-10);
    return ((data<<10) | d) ^ 0x5412;
  }
  function bch18(v){ // version : 6 bits → 18 bits
    let d = v << 12;
    for(let i=17;i>=12;i--) if((d>>i)&1) d ^= 0x1F25 << (i-12);
    return (v<<12) | d;
  }

  function writeFormat(m, mask){
    const n = m.length, f = bch15((0b00<<3) | mask); // niveau M = 00
    const bit = i => (f>>i)&1;
    const put = (x,y,v) => { m[y][x] = v; };
    // copie 1, autour du finder haut-gauche (ordre de la norme)
    for(let i=0;i<=5;i++) put(8, i, bit(i));
    put(8, 7, bit(6)); put(8, 8, bit(7)); put(7, 8, bit(8));
    for(let i=9;i<15;i++) put(14-i, 8, bit(i));
    // copie 2 : bits 0-7 à droite du finder haut-droit (ligne 8), bits 8-14 sous le finder bas-gauche (colonne 8)
    for(let i=0;i<8;i++) put(n-1-i, 8, bit(i));
    for(let i=8;i<15;i++) put(8, n-15+i, bit(i));
    put(8, n-8, 1); // module toujours sombre
  }
  function writeVersion(m, v){
    if(v<7) return; const n = m.length, b = bch18(v);
    for(let i=0;i<18;i++){ const bit=(b>>i)&1; const a=Math.floor(i/3), c=i%3; m[a][n-11+c]=bit; m[n-11+c][a]=bit; }
  }

  function penalty(m){
    const n = m.length; let p = 0;
    // 1) séries ≥5 dans lignes/colonnes
    for(let y=0;y<n;y++){ let run=1; for(let x=1;x<n;x++){ if(m[y][x]===m[y][x-1]){ run++; if(run===5) p+=3; else if(run>5) p++; } else run=1; } }
    for(let x=0;x<n;x++){ let run=1; for(let y=1;y<n;y++){ if(m[y][x]===m[y-1][x]){ run++; if(run===5) p+=3; else if(run>5) p++; } else run=1; } }
    // 2) blocs 2×2
    for(let y=0;y<n-1;y++) for(let x=0;x<n-1;x++){ const c=m[y][x]; if(c===m[y][x+1] && c===m[y+1][x] && c===m[y+1][x+1]) p+=3; }
    // 3) motifs 1011101 bordés de 4 clairs
    const pat = [1,0,1,1,1,0,1];
    const check = (get) => { for(let i=0;i<n-6;i++){ let ok=true; for(let j=0;j<7;j++) if(get(i+j)!==pat[j]){ ok=false; break; }
      if(!ok) continue; const before = i>=4 && [1,2,3,4].every(k=>get(i-k)===0); const after = i+10<n && [7,8,9,10].every(k=>get(i+k)===0); if(before||after) p+=40; } };
    for(let y=0;y<n;y++) check(x=>m[y][x]);
    for(let x=0;x<n;x++) check(y=>m[y][x]);
    // 4) proportion de sombres
    let dark=0; for(let y=0;y<n;y++) for(let x=0;x<n;x++) dark+=m[y][x];
    const pct = dark*100/(n*n); p += Math.floor(Math.abs(pct-50)/5)*10;
    return p;
  }

  function encode(text){
    const bytes = utf8(text);
    const v = chooseVersion(bytes.length);
    if(!v) throw new Error('Texte trop long pour un QR (versions 1 à 10)');
    const cw = codewords(bytes, v);
    const isFn = functionMask(v);
    let best = null, bestScore = Infinity;
    for(let mask=0; mask<8; mask++){
      const m = placeData(makeMatrix(v), cw);
      const n = m.length;
      for(let y=0;y<n;y++) for(let x=0;x<n;x++) if(!isFn[y][x] && MASKS[mask](x,y)) m[y][x] ^= 1;
      writeFormat(m, mask); writeVersion(m, v);
      const score = penalty(m);
      if(score < bestScore){ bestScore = score; best = m; }
    }
    return { version:v, size:best.length, modules:best.map(r=>Array.from(r)), get:(x,y)=>best[y][x]===1 };
  }

  function draw(canvas, text, opts){
    const o = Object.assign({ scale:6, margin:4, dark:'#141311', light:'#ffffff' }, opts||{});
    const q = encode(text);
    const px = (q.size + o.margin*2) * o.scale;
    canvas.width = px; canvas.height = px;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = o.light; ctx.fillRect(0,0,px,px);
    ctx.fillStyle = o.dark;
    for(let y=0;y<q.size;y++) for(let x=0;x<q.size;x++) if(q.get(x,y)) ctx.fillRect((x+o.margin)*o.scale, (y+o.margin)*o.scale, o.scale, o.scale);
    return q;
  }

  const api = { encode, draw };
  root.tomeQR = api;
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
