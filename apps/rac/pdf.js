/* Generador mínimo de PDF (A4) sin dependencias: texto Helvetica, tablas, rectángulos e imágenes JPEG.
   Funciona sin internet. Uso: const d = new MiniPDF(); d.newPage(); d.text(...); const bytes = d.build(); */
(function (root) {
  const W = 595.28, H = 841.89;
  const CP = { '—': 0x97, '–': 0x96, '·': 0xB7, '•': 0x95, '“': 0x93, '”': 0x94, '‘': 0x91, '’': 0x92, '€': 0x80, '…': 0x85 };
  const SUB = { '→': '->', '✓': 'OK', '▼': 'v', '▲': '^', '≈': '~', '⧉': '', '＋': '+' };
  const bin = (s) => { let o = ''; for (const ch of String(s == null ? '' : s)) { const c = ch.codePointAt(0); o += SUB[ch] != null ? SUB[ch] : (CP[ch] ? String.fromCharCode(CP[ch]) : (c < 256 ? ch : '?')); } return o; };
  const esc = (s) => bin(s).replace(/([\\()])/g, '\\$1').replace(/\r|\n/g, ' ');
  const f2 = (n) => (Math.round(n * 100) / 100).toString();
  const rgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h || '#000000'); const v = parseInt(m ? m[1] : '000000', 16); return [(v >> 16) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255].map(f2).join(' '); };

  // anchos aproximados de Helvetica (milésimas de em)
  function ancho(s, size, bold) {
    let w = 0;
    for (const ch of bin(s)) {
      let a;
      if (ch >= '0' && ch <= '9') a = 556; else if (' .,:;/|!'.includes(ch)) a = 278; else if ('-()[]'.includes(ch)) a = 333;
      else if ('ijl'.includes(ch)) a = 222; else if ('ftI'.includes(ch)) a = 278; else if (ch === 'r') a = 333; else if (ch === 's' || ch === 'c' || ch === 'k' || ch === 'v' || ch === 'x' || ch === 'y' || ch === 'z') a = 500;
      else if (ch === 'm') a = 833; else if (ch === 'w') a = 722; else if (ch === 'M') a = 833; else if (ch === 'W') a = 944; else if (ch === '·') a = 278;
      else if (ch >= 'A' && ch <= 'Z') a = 667; else a = 556;
      w += a;
    }
    return (w / 1000) * size * (bold ? 1.06 : 1);
  }
  function ajusta(s, maxW, size, bold) {
    s = String(s == null ? '' : s); if (ancho(s, size, bold) <= maxW) return s;
    while (s.length > 1 && ancho(s + '…', size, bold) > maxW) s = s.slice(0, -1);
    return s + '…';
  }
  function jpegInfo(b64) {
    const d = atob(b64.replace(/^data:image\/jpeg;base64,/, ''));
    let i = 2;
    while (i < d.length) {
      if (d.charCodeAt(i) !== 0xFF) { i++; continue; }
      const m = d.charCodeAt(i + 1);
      if (m === 0xC0 || m === 0xC1 || m === 0xC2) return { data: d, h: d.charCodeAt(i + 5) * 256 + d.charCodeAt(i + 6), w: d.charCodeAt(i + 7) * 256 + d.charCodeAt(i + 8), n: d.charCodeAt(i + 9) };
      i += 2 + d.charCodeAt(i + 2) * 256 + d.charCodeAt(i + 3);
    }
    throw new Error('JPEG no válido');
  }

  class MiniPDF {
    constructor(titulo) { this.pages = []; this.imgs = []; this.titulo = titulo || 'Documento'; this.W = W; this.H = H; }
    newPage() { this.pages.push({ ops: [], im: new Set() }); return this.pages.length - 1; }
    get cur() { return this.pages[this._p != null ? this._p : this.pages.length - 1]; }
    pagina(i) { this._p = i; }   // escribir en una página ya creada (null = la última)
    ancho(s, size, bold) { return ancho(s, size, bold); }
    fit(s, maxW, size, bold) { return ajusta(s, maxW, size, bold); }
    // y = distancia desde el borde superior hasta la línea base
    text(x, y, s, o = {}) {
      const size = o.size || 10, w = ancho(s, size, o.bold);
      let px = x; if (o.align === 'right') px = x - w; else if (o.align === 'center') px = x - w / 2;
      this.cur.ops.push(`BT /${o.bold ? 'F2' : 'F1'} ${f2(size)} Tf ${rgb(o.color)} rg ${f2(px)} ${f2(H - y)} Td (${esc(s)}) Tj ET`);
      return w;
    }
    rect(x, y, w, h, o = {}) {   // y = borde superior
      const op = [];
      if (o.fill) op.push(`${rgb(o.fill)} rg`); if (o.stroke) op.push(`${rgb(o.stroke)} RG ${f2(o.lw || 0.6)} w`);
      op.push(`${f2(x)} ${f2(H - y - h)} ${f2(w)} ${f2(h)} re ${o.fill && o.stroke ? 'B' : o.fill ? 'f' : 'S'}`);
      this.cur.ops.push(op.join(' '));
    }
    line(x1, y1, x2, y2, o = {}) { this.cur.ops.push(`${rgb(o.color || '#999999')} RG ${f2(o.lw || 0.5)} w ${f2(x1)} ${f2(H - y1)} m ${f2(x2)} ${f2(H - y2)} l S`); }
    addJpeg(dataUrl) { this.imgs.push(jpegInfo(dataUrl)); return this.imgs.length - 1; }
    image(idx, x, y, w, h) { this.cur.im.add(idx); this.cur.ops.push(`q ${f2(w)} 0 0 ${f2(h)} ${f2(x)} ${f2(H - y - h)} cm /Im${idx} Do Q`); }
    build() {
      const out = []; let pos = 0; const off = [];
      const put = (s) => { out.push(s); pos += s.length; };
      const obj = (n, body) => { off[n] = pos; put(`${n} 0 obj\n${body}\nendobj\n`); };
      const nP = this.pages.length, base = 5 + this.imgs.length;   // 1 catálogo, 2 páginas, 3 F1, 4 F2, 5.. imágenes, luego páginas y contenidos
      const pageNo = (i) => base + i * 2, contNo = (i) => base + i * 2 + 1, info = base + nP * 2;
      put('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
      obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
      obj(2, `<< /Type /Pages /Count ${nP} /Kids [${this.pages.map((_, i) => `${pageNo(i)} 0 R`).join(' ')}] >>`);
      obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
      obj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
      this.imgs.forEach((im, i) => obj(5 + i, `<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace ${im.n === 1 ? '/DeviceGray' : '/DeviceRGB'} /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.data.length} >>\nstream\n${im.data}\nendstream`));
      this.pages.forEach((p, i) => {
        const xo = [...p.im].map((k) => `/Im${k} ${5 + k} 0 R`).join(' ');
        obj(pageNo(i), `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f2(W)} ${f2(H)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xo ? ` /XObject << ${xo} >>` : ''} >> /Contents ${contNo(i)} 0 R >>`);
        const c = p.ops.join('\n'); obj(contNo(i), `<< /Length ${c.length} >>\nstream\n${c}\nendstream`);
      });
      obj(info, `<< /Title (${esc(this.titulo)}) /Producer (INFOAGRO) >>`);
      const xr = pos, n = info + 1;
      let x = `xref\n0 ${n}\n0000000000 65535 f \n`;
      for (let i = 1; i < n; i++) x += String(off[i]).padStart(10, '0') + ' 00000 n \n';
      put(x + `trailer\n<< /Size ${n} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xr}\n%%EOF`);
      const s = out.join(''), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255;
      return u;
    }
  }
  root.MiniPDF = MiniPDF;
})(typeof window !== 'undefined' ? window : globalThis);
