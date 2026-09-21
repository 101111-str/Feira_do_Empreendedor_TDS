/* qr.js — codificador QR mínimo (modo byte, nível M, versões 1–10).
   Sem dependências. Exporta qrMatrix(text) -> array de arrays 0/1.
   Verificado módulo a módulo contra implementação de referência. */
(function (root) {
  'use strict';

  // ---- tabelas (nível de correção M) ----
  // versao: [ecPorBloco, [ [nBlocos, dataCwPorBloco], ... ] ]
  var EC_M = {
    1:  [10, [[1, 16]]],
    2:  [16, [[1, 28]]],
    3:  [26, [[1, 44]]],
    4:  [18, [[2, 32]]],
    5:  [24, [[2, 43]]],
    6:  [16, [[4, 27]]],
    7:  [18, [[4, 31]]],
    8:  [22, [[2, 38], [2, 39]]],
    9:  [22, [[3, 36], [2, 37]]],
    10: [26, [[4, 43], [1, 44]]]
  };
  var CAP_BYTES_M = { 1:14, 2:26, 3:42, 4:62, 5:84, 6:106, 7:122, 8:152, 9:180, 10:213 };
  var ALIGN = {
    1: [], 2: [6,18], 3: [6,22], 4: [6,26], 5: [6,30],
    6: [6,34], 7: [6,22,38], 8: [6,24,42], 9: [6,26,46], 10: [6,28,50]
  };

  // ---- GF(256) ----
  var EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = x; LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
  })();
  function gmul(a, b) { return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]]; }

  function rsGenerator(n) {
    var poly = [1];
    for (var i = 0; i < n; i++) {
      var next = new Array(poly.length + 1).fill(0);
      for (var j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= gmul(poly[j], EXP[i]);
      }
      poly = next;
    }
    return poly;
  }

  function rsEncode(data, ecLen) {
    var gen = rsGenerator(ecLen);
    var res = new Array(ecLen).fill(0);
    for (var i = 0; i < data.length; i++) {
      var factor = data[i] ^ res[0];
      res.shift(); res.push(0);
      if (factor !== 0) for (var j = 0; j < gen.length - 1; j++) res[j] ^= gmul(gen[j + 1], factor);
    }
    return res;
  }

  // ---- BCH ----
  function bch(data, poly, bits) {
    var d = data << bits;
    var polyBits = 0, t = poly;
    while (t) { polyBits++; t >>= 1; }
    var dBits = 0; t = d;
    while (t) { dBits++; t >>= 1; }
    while (dBits >= polyBits) {
      d ^= poly << (dBits - polyBits);
      dBits = 0; t = d;
      while (t) { dBits++; t >>= 1; }
    }
    return (data << bits) | d;
  }
  function formatBits(maskId) {
    // nível M = 0b00
    var v = (0x00 << 3) | maskId;
    return (bch(v, 0x537, 10)) ^ 0x5412;
  }
  function versionBits(version) {
    return bch(version, 0x1f25, 12);
  }

  // ---- bits ----
  function BitWriter() { this.bits = []; }
  BitWriter.prototype.put = function (value, len) {
    for (var i = len - 1; i >= 0; i--) this.bits.push((value >> i) & 1);
  };

  function utf8Bytes(str) {
    var out = [], s = unescape(encodeURIComponent(str));
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xff);
    return out;
  }

  function pickVersion(len) {
    for (var v = 1; v <= 10; v++) if (CAP_BYTES_M[v] >= len) return v;
    throw new Error('Conteúdo longo demais para QR versão 10 nível M');
  }

  function buildCodewords(bytes, version) {
    var spec = EC_M[version], ecLen = spec[0], groups = spec[1];
    var totalData = 0, blocks = [];
    groups.forEach(function (g) { totalData += g[0] * g[1]; });

    var bw = new BitWriter();
    bw.put(4, 4);                                   // modo byte
    bw.put(bytes.length, version < 10 ? 8 : 16);    // contador
    for (var i = 0; i < bytes.length; i++) bw.put(bytes[i], 8);
    var cap = totalData * 8;
    var term = Math.min(4, cap - bw.bits.length);
    bw.put(0, term);
    while (bw.bits.length % 8 !== 0) bw.bits.push(0);
    var data = [];
    for (var b = 0; b < bw.bits.length; b += 8) {
      var byteVal = 0;
      for (var k = 0; k < 8; k++) byteVal = (byteVal << 1) | bw.bits[b + k];
      data.push(byteVal);
    }
    var pads = [0xec, 0x11], p = 0;
    while (data.length < totalData) { data.push(pads[p % 2]); p++; }

    var idx = 0;
    groups.forEach(function (g) {
      for (var n = 0; n < g[0]; n++) {
        var d = data.slice(idx, idx + g[1]);
        idx += g[1];
        blocks.push({ data: d, ec: rsEncode(d, ecLen) });
      }
    });

    var out = [], maxData = 0;
    blocks.forEach(function (bl) { if (bl.data.length > maxData) maxData = bl.data.length; });
    for (var c = 0; c < maxData; c++)
      blocks.forEach(function (bl) { if (c < bl.data.length) out.push(bl.data[c]); });
    for (var e = 0; e < ecLen; e++)
      blocks.forEach(function (bl) { out.push(bl.ec[e]); });
    return out;
  }

  // ---- matriz ----
  function emptyMatrix(size) {
    var m = [], r;
    for (r = 0; r < size; r++) m.push(new Array(size).fill(null));
    return m;
  }

  function placeFunctionPatterns(m, version) {
    var size = m.length, i, j;

    function finder(row, col) {
      for (i = -1; i <= 7; i++) for (j = -1; j <= 7; j++) {
        var r = row + i, c = col + j;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        var on = (0 <= i && i <= 6 && (j === 0 || j === 6)) ||
                 (0 <= j && j <= 6 && (i === 0 || i === 6)) ||
                 (2 <= i && i <= 4 && 2 <= j && j <= 4);
        m[r][c] = on ? 1 : 0;
      }
    }
    finder(0, 0); finder(0, size - 7); finder(size - 7, 0);

    for (i = 8; i < size - 8; i++) {
      var v = (i % 2 === 0) ? 1 : 0;
      m[6][i] = v; m[i][6] = v;
    }

    var centers = ALIGN[version];
    for (i = 0; i < centers.length; i++) for (j = 0; j < centers.length; j++) {
      var cy = centers[i], cx = centers[j];
      if ((cy === 6 && cx === 6) || (cy === 6 && cx === size - 7) || (cy === size - 7 && cx === 6)) continue;
      for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
        var on2 = Math.max(Math.abs(dy), Math.abs(dx)) !== 1;
        m[cy + dy][cx + dx] = on2 ? 1 : 0;
      }
    }

    m[size - 8][8] = 1; // módulo escuro

    // reserva das áreas de formato
    for (i = 0; i <= 8; i++) {
      if (m[8][i] === null) m[8][i] = 0;
      if (m[i][8] === null) m[i][8] = 0;
    }
    for (i = 0; i < 8; i++) {
      if (m[8][size - 1 - i] === null) m[8][size - 1 - i] = 0;
      if (m[size - 1 - i][8] === null) m[size - 1 - i][8] = 0;
    }

    if (version >= 7) {
      var vb = versionBits(version);
      for (i = 0; i < 18; i++) {
        var bit = (vb >> i) & 1;
        m[Math.floor(i / 3)][size - 11 + (i % 3)] = bit;
        m[size - 11 + (i % 3)][Math.floor(i / 3)] = bit;
      }
    }
  }

  function reservedMask(version, size) {
    var m = emptyMatrix(size);
    placeFunctionPatterns(m, version);
    var res = [];
    for (var r = 0; r < size; r++) {
      res.push([]);
      for (var c = 0; c < size; c++) res[r].push(m[r][c] !== null);
    }
    return res;
  }

  function placeData(m, reserved, codewords) {
    var size = m.length, bitIdx = 0, total = codewords.length * 8;
    var col = size - 1, up = true;
    while (col > 0) {
      if (col === 6) col--;
      for (var n = 0; n < size; n++) {
        var row = up ? (size - 1 - n) : n;
        for (var k = 0; k < 2; k++) {
          var c = col - k;
          if (reserved[row][c]) continue;
          var bit = 0;
          if (bitIdx < total) bit = (codewords[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1;
          m[row][c] = bit;
          bitIdx++;
        }
      }
      up = !up;
      col -= 2;
    }
  }

  function maskFn(id, r, c) {
    switch (id) {
      case 0: return (r + c) % 2 === 0;
      case 1: return r % 2 === 0;
      case 2: return c % 3 === 0;
      case 3: return (r + c) % 3 === 0;
      case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
      case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
      case 6: return ((((r * c) % 2) + ((r * c) % 3)) % 2) === 0;
      case 7: return ((((r + c) % 2) + ((r * c) % 3)) % 2) === 0;
    }
  }

  function penalty(m) {
    var size = m.length, score = 0, r, c, i;

    // regra 1 — corridas de 5+
    function runs(get) {
      var s = 0;
      for (r = 0; r < size; r++) {
        var run = 1;
        for (c = 1; c < size; c++) {
          if (get(r, c) === get(r, c - 1)) run++;
          else { if (run >= 5) s += 3 + (run - 5); run = 1; }
        }
        if (run >= 5) s += 3 + (run - 5);
      }
      return s;
    }
    score += runs(function (a, b) { return m[a][b]; });
    score += runs(function (a, b) { return m[b][a]; });

    // regra 2 — blocos 2×2
    for (r = 0; r < size - 1; r++) for (c = 0; c < size - 1; c++) {
      var v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
    }

    // regra 3 — padrão 1:1:3:1:1
    var pa = [1,0,1,1,1,0,1,0,0,0,0], pb = [0,0,0,0,1,0,1,1,1,0,1];
    function match(seq, pat) {
      for (var k = 0; k < 11; k++) if (seq[k] !== pat[k]) return false;
      return true;
    }
    for (r = 0; r < size; r++) for (c = 0; c <= size - 11; c++) {
      var h = [], v2 = [];
      for (i = 0; i < 11; i++) { h.push(m[r][c + i]); v2.push(m[c + i][r]); }
      if (match(h, pa) || match(h, pb)) score += 40;
      if (match(v2, pa) || match(v2, pb)) score += 40;
    }

    // regra 4 — proporção de escuros
    var dark = 0;
    for (r = 0; r < size; r++) for (c = 0; c < size; c++) if (m[r][c]) dark++;
    var pct = dark * 100 / (size * size);
    score += Math.floor(Math.abs(pct - 50) / 5) * 10;
    return score;
  }

  function applyFormat(m, maskId) {
    var size = m.length, fb = formatBits(maskId), i, bit;
    for (i = 0; i < 15; i++) {
      bit = (fb >> i) & 1;
      // coluna vertical, à direita do finder superior esquerdo
      if (i < 6) m[i][8] = bit;
      else if (i < 8) m[i + 1][8] = bit;
      else m[size - 15 + i][8] = bit;
      // linha horizontal, abaixo do finder superior esquerdo
      if (i < 8) m[8][size - i - 1] = bit;
      else if (i === 8) m[8][15 - i - 1 + 1] = bit;
      else m[8][15 - i - 1] = bit;
    }
  }

  function qrMatrix(text) {
    var bytes = utf8Bytes(text);
    var version = pickVersion(bytes.length);
    var size = version * 4 + 17;
    var codewords = buildCodewords(bytes, version);
    var reserved = reservedMask(version, size);

    var best = null, bestScore = Infinity;
    for (var mask = 0; mask < 8; mask++) {
      var m = emptyMatrix(size);
      placeFunctionPatterns(m, version);
      placeData(m, reserved, codewords);
      for (var r = 0; r < size; r++) for (var c = 0; c < size; c++)
        if (!reserved[r][c] && maskFn(mask, r, c)) m[r][c] ^= 1;
      applyFormat(m, mask);
      var s = penalty(m);
      if (s < bestScore) { bestScore = s; best = m; }
    }
    return best;
  }

  function qrSvg(text, opts) {
    opts = opts || {};
    var m = qrMatrix(text), n = m.length, q = opts.quiet == null ? 4 : opts.quiet;
    var total = n + q * 2;
    var parts = [];
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++)
      if (m[r][c]) parts.push('M' + (c + q) + ' ' + (r + q) + 'h1v1h-1z');
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + ' ' + total +
      '" shape-rendering="crispEdges" role="img" aria-label="Código QR"><rect width="' + total +
      '" height="' + total + '" fill="#fff"/><path d="' + parts.join('') + '" fill="#000"/></svg>';
  }

  function qrMatrixWithMask(text, mask) {
    var bytes = utf8Bytes(text);
    var version = pickVersion(bytes.length);
    var size = version * 4 + 17;
    var codewords = buildCodewords(bytes, version);
    var reserved = reservedMask(version, size);
    var m = emptyMatrix(size);
    placeFunctionPatterns(m, version);
    placeData(m, reserved, codewords);
    for (var r = 0; r < size; r++) for (var c = 0; c < size; c++)
      if (!reserved[r][c] && maskFn(mask, r, c)) m[r][c] ^= 1;
    applyFormat(m, mask);
    return m;
  }

  var api = { qrMatrix: qrMatrix, qrSvg: qrSvg, qrMatrixWithMask: qrMatrixWithMask };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.QR = api;
})(typeof self !== 'undefined' ? self : this);
