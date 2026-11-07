/* Genzaichi geometry core.
 * Image points are [u, v] in pixels of the (straightened) photo, v pointing down.
 * World points are [E, N] in metres on a local flat projection around an origin.
 * A fitted model maps image -> world (fwd) and world -> image (inv). */
(function (root) {
  'use strict';

  const D2R = Math.PI / 180;
  const R_EARTH = 6371008.8;

  // ---------- projection ----------
  function makeProj(lat0, lng0) {
    const k = D2R * R_EARTH;
    const c = Math.cos(lat0 * D2R);
    return {
      lat0, lng0,
      fwd: (lat, lng) => [(lng - lng0) * k * c, (lat - lat0) * k],
      inv: (E, N) => [lat0 + N / k, lng0 + E / (k * c)],
    };
  }

  function distanceM(lat1, lng1, lat2, lng2) {
    const p1 = lat1 * D2R, p2 = lat2 * D2R;
    const dp = p2 - p1, dl = (lng2 - lng1) * D2R;
    const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  // ---------- small linear algebra ----------
  // Solves A X = B with partial pivoting. A is n x n, B is n x m. Returns X (n x m) or null.
  function solveLinear(A, B) {
    const n = A.length;
    const m = B[0].length;
    const M = A.map((row, i) => row.concat(B[i]));
    let scale = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) scale = Math.max(scale, Math.abs(A[i][j]));
    const tiny = (scale || 1) * 1e-12;
    for (let col = 0; col < n; col++) {
      let piv = col;
      let best = Math.abs(M[col][col]);
      for (let r = col + 1; r < n; r++) {
        const v = Math.abs(M[r][col]);
        if (v > best) { best = v; piv = r; }
      }
      if (!(best > tiny)) return null;
      if (piv !== col) { const t = M[piv]; M[piv] = M[col]; M[col] = t; }
      const d = M[col][col];
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const f = M[r][col] / d;
        if (f === 0) continue;
        const Mr = M[r], Mc = M[col];
        for (let c2 = col; c2 < n + m; c2++) Mr[c2] -= f * Mc[c2];
      }
    }
    const X = [];
    for (let i = 0; i < n; i++) {
      const row = [];
      for (let j = 0; j < m; j++) row.push(M[i][n + j] / M[i][i]);
      X.push(row);
    }
    return X;
  }

  // Jacobi eigen-decomposition of a symmetric matrix. Columns of `vectors` are eigenvectors.
  function symEigen(S) {
    const n = S.length;
    const A = S.map((r) => r.slice());
    const V = [];
    for (let i = 0; i < n; i++) { V.push(new Array(n).fill(0)); V[i][i] = 1; }
    for (let sweep = 0; sweep < 80; sweep++) {
      let off = 0, diag = 0;
      for (let i = 0; i < n; i++) {
        diag += A[i][i] * A[i][i];
        for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j];
      }
      if (off <= 1e-30 * (diag || 1)) break;
      for (let p = 0; p < n; p++) {
        for (let q = p + 1; q < n; q++) {
          const apq = A[p][q];
          if (apq === 0) continue;
          const theta = (A[q][q] - A[p][p]) / (2 * apq);
          const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
          const c = 1 / Math.sqrt(t * t + 1);
          const s = t * c;
          for (let k = 0; k < n; k++) {
            const akp = A[k][p], akq = A[k][q];
            A[k][p] = c * akp - s * akq;
            A[k][q] = s * akp + c * akq;
          }
          for (let k = 0; k < n; k++) {
            const apk = A[p][k], aqk = A[q][k];
            A[p][k] = c * apk - s * aqk;
            A[q][k] = s * apk + c * aqk;
          }
          for (let k = 0; k < n; k++) {
            const vkp = V[k][p], vkq = V[k][q];
            V[k][p] = c * vkp - s * vkq;
            V[k][q] = s * vkp + c * vkq;
          }
        }
      }
    }
    return { values: A.map((r, i) => r[i]), vectors: V };
  }

  function mul3(A, B) {
    const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      C[i][j] = A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
    }
    return C;
  }

  function inv3(m) {
    const [a, b, c] = m[0], [d, e, f] = m[1], [g, h, i] = m[2];
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    const det = a * A + b * B + c * C;
    if (!det || !isFinite(det)) return null;
    const r = 1 / det;
    return [
      [A * r, -(b * i - c * h) * r, (b * f - c * e) * r],
      [B * r, (a * i - c * g) * r, -(a * f - c * d) * r],
      [C * r, -(a * h - b * g) * r, (a * e - b * d) * r],
    ];
  }

  function applyH(H, x, y) {
    const w = H[2][0] * x + H[2][1] * y + H[2][2];
    return [(H[0][0] * x + H[0][1] * y + H[0][2]) / w, (H[1][0] * x + H[1][1] * y + H[1][2]) / w, w];
  }

  // ---------- helpers ----------
  function weightsOf(n, W) { return W && W.length === n ? W : new Array(n).fill(1); }

  function centroid(P, W) {
    let sw = 0, x = 0, y = 0;
    for (let i = 0; i < P.length; i++) { sw += W[i]; x += W[i] * P[i][0]; y += W[i] * P[i][1]; }
    return [x / sw, y / sw, sw];
  }

  // Ratio of the smaller to the larger principal spread (0 = collinear, 1 = round).
  function spreadRatio(P) {
    const n = P.length;
    if (n < 2) return 0;
    const W = new Array(n).fill(1);
    const [cx, cy] = centroid(P, W);
    let sxx = 0, syy = 0, sxy = 0;
    for (const p of P) { const dx = p[0] - cx, dy = p[1] - cy; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    const tr = sxx + syy, det = sxx * syy - sxy * sxy;
    const disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
    const l1 = tr / 2 + disc, l2 = tr / 2 - disc;
    if (l1 <= 0) return 0;
    return Math.sqrt(Math.max(0, l2) / l1);
  }

  function rmsRadius(P) {
    const W = new Array(P.length).fill(1);
    const [cx, cy] = centroid(P, W);
    let s = 0;
    for (const p of P) s += (p[0] - cx) ** 2 + (p[1] - cy) ** 2;
    return Math.sqrt(s / Math.max(1, P.length));
  }

  // Numerical Jacobian of a 2D -> 2D function, returns [[dx/da, dx/db], [dy/da, dy/db]].
  function jacobian(f, a, b, h) {
    const p1 = f(a + h, b), p0 = f(a - h, b), q1 = f(a, b + h), q0 = f(a, b - h);
    if (!p1 || !p0 || !q1 || !q0) return null;
    return [
      [(p1[0] - p0[0]) / (2 * h), (q1[0] - q0[0]) / (2 * h)],
      [(p1[1] - p0[1]) / (2 * h), (q1[1] - q0[1]) / (2 * h)],
    ];
  }

  // ---------- models ----------
  // Similarity: rotation + uniform scale + shift, no mirroring (image v axis is flipped first).
  function fitSimilarity(P, Q, W) {
    const n = P.length;
    if (n < 2) return null;
    W = weightsOf(n, W);
    const Pm = P.map((p) => [p[0], -p[1]]);
    const [px, py, sw] = centroid(Pm, W);
    const [qx, qy] = centroid(Q, W);
    let re = 0, im = 0, den = 0;
    for (let i = 0; i < n; i++) {
      const X = Pm[i][0] - px, Y = Pm[i][1] - py;
      const A = Q[i][0] - qx, B = Q[i][1] - qy;
      re += W[i] * (X * A + Y * B);
      im += W[i] * (X * B - Y * A);
      den += W[i] * (X * X + Y * Y);
    }
    if (!(den > 1e-9 * sw)) return null;
    const a = re / den, b = im / den;
    const s2 = a * a + b * b;
    if (!(s2 > 0) || !isFinite(s2)) return null;
    const tx = qx - (a * px - b * py), ty = qy - (b * px + a * py);
    return {
      type: 'similarity',
      scale: Math.sqrt(s2),
      rotation: Math.atan2(b, a),
      fwd: (u, v) => [a * u - b * -v + tx, b * u + a * -v + ty],
      inv: (E, N) => {
        const x = E - tx, y = N - ty;
        const mx = (a * x + b * y) / s2, my = (-b * x + a * y) / s2;
        return [mx, -my];
      },
    };
  }

  // Affine: independent stretch and shear (6 parameters).
  function fitAffine(P, Q, W) {
    const n = P.length;
    if (n < 3) return null;
    if (spreadRatio(P) < 0.03 || spreadRatio(Q) < 0.03) return null;
    W = weightsOf(n, W);
    const [px, py] = centroid(P, W);
    const sc = rmsRadius(P) || 1;
    const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const R = [[0, 0], [0, 0], [0, 0]];
    for (let i = 0; i < n; i++) {
      const d = [(P[i][0] - px) / sc, (P[i][1] - py) / sc, 1];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) M[r][c] += W[i] * d[r] * d[c];
        R[r][0] += W[i] * d[r] * Q[i][0];
        R[r][1] += W[i] * d[r] * Q[i][1];
      }
    }
    const X = solveLinear(M, R);
    if (!X) return null;
    // E = X00*x' + X10*y' + X20 with x' = (u-px)/sc
    const a = X[0][0] / sc, b = X[1][0] / sc, c = X[2][0] - a * px - b * py;
    const d = X[0][1] / sc, e = X[1][1] / sc, f = X[2][1] - d * px - e * py;
    const det = a * e - b * d;
    if (!det || !isFinite(det)) return null;
    return {
      type: 'affine',
      matrix: [a, b, c, d, e, f],
      fwd: (u, v) => [a * u + b * v + c, d * u + e * v + f],
      inv: (E, N) => {
        const x = E - c, y = N - f;
        return [(e * x - b * y) / det, (-d * x + a * y) / det];
      },
    };
  }

  function normalizer(P) {
    const W = new Array(P.length).fill(1);
    const [cx, cy] = centroid(P, W);
    let md = 0;
    for (const p of P) md += Math.hypot(p[0] - cx, p[1] - cy);
    md /= P.length;
    const s = md > 0 ? Math.SQRT2 / md : 1;
    return [[s, 0, -s * cx], [0, s, -s * cy], [0, 0, 1]];
  }

  // Homography by normalised DLT. Returns the 3x3 matrix (src -> dst) or null.
  function homography(src, dst, W) {
    const n = src.length;
    if (n < 4) return null;
    W = weightsOf(n, W);
    const Ts = normalizer(src), Td = normalizer(dst);
    const AtA = [];
    for (let i = 0; i < 9; i++) AtA.push(new Array(9).fill(0));
    for (let i = 0; i < n; i++) {
      const [x, y] = applyH(Ts, src[i][0], src[i][1]);
      const [X, Y] = applyH(Td, dst[i][0], dst[i][1]);
      const sw = Math.sqrt(W[i]);
      const r1 = [-x, -y, -1, 0, 0, 0, X * x, X * y, X];
      const r2 = [0, 0, 0, -x, -y, -1, Y * x, Y * y, Y];
      for (let a = 0; a < 9; a++) {
        for (let b = a; b < 9; b++) {
          const v = (r1[a] * r1[b] + r2[a] * r2[b]) * sw * sw;
          AtA[a][b] += v;
          if (a !== b) AtA[b][a] += v;
        }
      }
    }
    const { values, vectors } = symEigen(AtA);
    const order = values.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]);
    // Degenerate if a second solution fits about as well (e.g. 3 collinear points among 4).
    if (n >= 4 && order[1][0] < 1e-10 * (order[8][0] || 1)) return null;
    const k = order[0][1];
    const h = vectors.map((row) => row[k]);
    const Hn = [[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], h[8]]];
    const Tdi = inv3(Td);
    if (!Tdi) return null;
    let H = mul3(Tdi, mul3(Hn, Ts));
    const z = H[2][2];
    if (Math.abs(z) > 1e-15) H = H.map((r) => r.map((v) => v / z));
    if (!H.every((r) => r.every(isFinite))) return null;
    return H;
  }

  // Perspective model, valid only if the photo's whole area stays on one side of the horizon.
  function fitPerspective(P, Q, W, opts) {
    if (P.length < 4) return null;
    if (spreadRatio(P) < 0.05 || spreadRatio(Q) < 0.05) return null;
    const H = homography(P, Q, W);
    if (!H) return null;
    const Hi = inv3(H);
    if (!Hi) return null;
    const bw = (opts && opts.width) || 0, bh = (opts && opts.height) || 0;
    const box = bw && bh ? [[-0.25 * bw, -0.25 * bh], [1.25 * bw, -0.25 * bh], [1.25 * bw, 1.25 * bh], [-0.25 * bw, 1.25 * bh]] : P;
    let sign = 0;
    for (const p of box) {
      const w = H[2][0] * p[0] + H[2][1] * p[1] + H[2][2];
      const s = w > 0 ? 1 : -1;
      if (Math.abs(w) < 1e-9) return null;
      if (!sign) sign = s; else if (s !== sign) return null;
    }
    if (bw && bh) {
      // The photo corners must map to a convex quad (no fold-over).
      const c = [[0, 0], [bw, 0], [bw, bh], [0, bh]].map((p) => applyH(H, p[0], p[1]));
      let turn = 0;
      for (let i = 0; i < 4; i++) {
        const a = c[i], b = c[(i + 1) % 4], d = c[(i + 2) % 4];
        const cr = (b[0] - a[0]) * (d[1] - b[1]) - (b[1] - a[1]) * (d[0] - b[0]);
        const s = cr > 0 ? 1 : -1;
        if (!turn) turn = s; else if (s !== turn) return null;
      }
    }
    return {
      type: 'perspective',
      H, Hi,
      fwd: (u, v) => {
        const r = applyH(H, u, v);
        return r[2] * sign > 0 ? [r[0], r[1]] : null;
      },
      inv: (E, N) => {
        const r = applyH(Hi, E, N);
        if (!isFinite(r[0]) || !isFinite(r[1])) return null;
        // the image point must be on the valid side of the horizon
        const w = H[2][0] * r[0] + H[2][1] * r[1] + H[2][2];
        return w * sign > 0 ? [r[0], r[1]] : null;
      },
    };
  }

  // Thin-plate spline ("rubber sheet"): bends to every point; for hand-drawn maps that are not to scale.
  function tpsKernel(r) { return r > 1e-12 ? r * r * Math.log(r) : 0; }

  function tpsMap(src, dst, W, lambda) {
    const n = src.length;
    if (n < 3) return null;
    const ones = new Array(n).fill(1);
    const [cx, cy] = centroid(src, ones);
    const sc = rmsRadius(src) || 1;
    const S = src.map((p) => [(p[0] - cx) / sc, (p[1] - cy) / sc]);
    const [dx, dy] = centroid(dst, ones);
    const dsc = rmsRadius(dst) || 1;
    const Dn = dst.map((p) => [(p[0] - dx) / dsc, (p[1] - dy) / dsc]);
    let wm = 0;
    for (const w of W) wm += w;
    wm /= n;
    const L = [];
    for (let i = 0; i < n + 3; i++) L.push(new Array(n + 3).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) L[i][j] = tpsKernel(Math.hypot(S[i][0] - S[j][0], S[i][1] - S[j][1]));
      L[i][i] += lambda * wm / W[i];
      L[i][n] = 1; L[i][n + 1] = S[i][0]; L[i][n + 2] = S[i][1];
      L[n][i] = 1; L[n + 1][i] = S[i][0]; L[n + 2][i] = S[i][1];
    }
    const B = Dn.map((p) => [p[0], p[1]]).concat([[0, 0], [0, 0], [0, 0]]);
    const X = solveLinear(L, B);
    if (!X) return null;
    return (a, b) => {
      const x = (a - cx) / sc, y = (b - cy) / sc;
      let ox = X[n][0] + X[n + 1][0] * x + X[n + 2][0] * y;
      let oy = X[n][1] + X[n + 1][1] * x + X[n + 2][1] * y;
      for (let i = 0; i < n; i++) {
        const k = tpsKernel(Math.hypot(x - S[i][0], y - S[i][1]));
        ox += X[i][0] * k;
        oy += X[i][1] * k;
      }
      return [ox * dsc + dx, oy * dsc + dy];
    };
  }

  function fitFlex(P, Q, W, opts) {
    const n = P.length;
    if (n < 4) return null;
    if (spreadRatio(P) < 0.05 || spreadRatio(Q) < 0.05) return null;
    W = weightsOf(n, W);
    const lambda = (opts && opts.lambda != null) ? opts.lambda : 0.004;
    const f = tpsMap(P, Q, W, lambda);
    const g = tpsMap(Q, P, W, lambda);
    if (!f || !g) return null;
    return { type: 'flex', fwd: f, inv: g };
  }

  const FITTERS = { similarity: fitSimilarity, affine: fitAffine, perspective: fitPerspective, flex: fitFlex };
  const MIN_POINTS = { similarity: 2, affine: 3, perspective: 4, flex: 5 };
  const ORDER = ['similarity', 'affine', 'perspective', 'flex'];

  function fitType(type, P, Q, W, opts) {
    const f = FITTERS[type];
    if (!f || P.length < MIN_POINTS[type]) return null;
    try { return f(P, Q, W, opts); } catch (e) { return null; }
  }

  // Leave-one-out check: how far off is each point when the model is fitted without it?
  function leaveOneOut(type, P, Q, W, opts) {
    const n = P.length;
    if (n < MIN_POINTS[type] + 1) return null;
    W = weightsOf(n, W);
    const errs = [];
    let sw = 0, s = 0;
    for (let i = 0; i < n; i++) {
      const keep = (_, j) => j !== i;
      const m = fitType(type, P.filter(keep), Q.filter(keep), W.filter(keep), opts);
      if (!m) return null;
      const q = m.fwd(P[i][0], P[i][1]);
      if (!q || !isFinite(q[0]) || !isFinite(q[1])) return null;
      const e = Math.hypot(q[0] - Q[i][0], q[1] - Q[i][1]);
      errs.push(e);
      sw += W[i];
      s += W[i] * e * e;
    }
    return { rmse: Math.sqrt(s / sw), errs };
  }

  // Picks the simplest model the points support. Complex models must beat simpler ones clearly.
  function autoFit(P, Q, W, opts) {
    opts = opts || {};
    const n = P.length;
    W = weightsOf(n, W);
    const out = { type: null, model: null, backup: null, residuals: [], loo: null, looByType: {}, n };
    if (n < 2) return out;
    const fits = {};
    for (const t of ORDER) fits[t] = fitType(t, P, Q, W, opts);
    const backup = fits.affine && n >= 4 ? fits.affine : fits.similarity;
    out.backup = backup || null;
    const loos = {};
    for (const t of ORDER) if (fits[t]) loos[t] = leaveOneOut(t, P, Q, W, opts);
    for (const t of ORDER) out.looByType[t] = loos[t] ? loos[t].rmse : null;

    let type = null;
    const forced = opts.type && opts.type !== 'auto' ? opts.type : null;
    if (forced && fits[forced]) {
      type = forced;
    } else if (n === 2) {
      type = fits.similarity ? 'similarity' : null;
    } else if (n === 3) {
      type = fits.similarity ? 'similarity' : null;
      if (fits.affine && fits.similarity) {
        // Keep rotate+scale unless it clearly cannot explain the three points.
        let s = 0;
        for (let i = 0; i < 3; i++) {
          const q = fits.similarity.fwd(P[i][0], P[i][1]);
          s += (q[0] - Q[i][0]) ** 2 + (q[1] - Q[i][1]) ** 2;
        }
        const rms = Math.sqrt(s / 3);
        const spread = rmsRadius(Q);
        const loo3 = leaveOneOut('similarity', P, Q, W, opts);
        const wellSpread = spreadRatio(P) >= 0.2 && spreadRatio(Q) >= 0.2;
        if (wellSpread && (rms > Math.max(8, 0.06 * spread) || (loo3 && loo3.rmse > Math.max(20, 0.18 * spread)))) type = 'affine';
      } else if (!fits.similarity && fits.affine) type = 'affine';
    } else {
      for (const t of ORDER) {
        if (!fits[t] || !loos[t]) continue;
        if (!type) { type = t; continue; }
        if (loos[t].rmse < 0.8 * loos[type].rmse) type = t;
      }
      if (!type) type = fits.affine ? 'affine' : (fits.similarity ? 'similarity' : null);
    }
    if (!type) return out;
    const model = fits[type];
    out.type = type;
    out.model = model;
    out.loo = loos[type] ? loos[type].rmse : null;
    out.pointErrors = loos[type] ? loos[type].errs : null;
    out.residuals = P.map((p, i) => {
      const q = model.fwd(p[0], p[1]);
      return q ? Math.hypot(q[0] - Q[i][0], q[1] - Q[i][1]) : Infinity;
    });
    out.spread = rmsRadius(Q);
    return out;
  }

  // Exact homography through 4 point pairs (used to straighten a photo).
  function homography4(src, dst) { return homography(src, dst); }

  // EXIF reader: GPS position, direction and capture time from a JPEG.
  function readExif(buf) {
    try {
      const dv = new DataView(buf);
      if (dv.getUint16(0) !== 0xffd8) return null;
      let off = 2;
      while (off + 4 < dv.byteLength) {
        const marker = dv.getUint16(off);
        const size = dv.getUint16(off + 2);
        if (marker === 0xffe1 && dv.getUint32(off + 4) === 0x45786966) return parseTiff(dv, off + 10);
        if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) break;
        off += 2 + size;
      }
    } catch (e) { /* not a readable JPEG */ }
    return null;
  }

  function parseTiff(dv, t) {
    const le = dv.getUint16(t) === 0x4949;
    const u16 = (o) => dv.getUint16(t + o, le);
    const u32 = (o) => dv.getUint32(t + o, le);
    const rat = (o) => { const d = u32(o + 4); return d ? u32(o) / d : 0; };
    const readIfd = (o) => {
      const tags = {};
      const count = u16(o);
      for (let i = 0; i < count; i++) {
        const e = o + 2 + i * 12;
        const tag = u16(e), type = u16(e + 2), num = u32(e + 4);
        const sizes = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
        const bytes = (sizes[type] || 1) * num;
        const vo = bytes > 4 ? u32(e + 8) : e + 8;
        let val;
        if (type === 2) {
          let s = '';
          for (let k = 0; k < num - 1; k++) s += String.fromCharCode(dv.getUint8(t + vo + k));
          val = s;
        } else if (type === 5 || type === 10) {
          val = [];
          for (let k = 0; k < num; k++) val.push(rat(vo + k * 8));
        } else if (type === 3) {
          val = num === 1 ? u16(vo) : null;
        } else if (type === 4) {
          val = u32(vo);
        } else if (type === 1 || type === 7) {
          val = dv.getUint8(t + vo);
        }
        tags[tag] = val;
      }
      return tags;
    };
    const ifd0 = readIfd(u32(4));
    const out = {};
    if (ifd0[0x8769]) {
      const ex = readIfd(ifd0[0x8769]);
      if (ex[0x9003]) out.time = ex[0x9003];
      if (ex[0x9011]) out.offset = ex[0x9011];
    }
    if (ifd0[0x8825]) {
      const g = readIfd(ifd0[0x8825]);
      const dms = (a) => (a && a.length >= 3 ? a[0] + a[1] / 60 + a[2] / 3600 : null);
      let lat = dms(g[2]), lng = dms(g[4]);
      if (lat != null && lng != null && (lat || lng)) {
        if (g[1] === 'S') lat = -lat;
        if (g[3] === 'W') lng = -lng;
        out.lat = lat;
        out.lng = lng;
        if (g[0x11] && g[0x11].length) out.direction = g[0x11][0];
        if (g[0x1f] && g[0x1f].length) out.accuracy = g[0x1f][0];
      }
    }
    return out;
  }

  // Magnetic declination for Japan (GSI 2020.0 approximation), degrees east. 0 outside Japan.
  function declination(lat, lng) {
    if (!(lat > 20 && lat < 46.5 && lng > 122 && lng < 154)) return 0;
    const dp = lat - 37, dl = lng - 138;
    const minutes = 460.585 + 18.484 * dp - 6.355 * dl + 0.088 * dp * dp - 0.106 * dp * dl - 0.064 * dl * dl;
    return -minutes / 60;
  }

  const api = {
    makeProj, distanceM, solveLinear, symEigen, inv3, mul3, applyH, homography, homography4,
    fitSimilarity, fitAffine, fitPerspective, fitFlex, fitType, leaveOneOut, autoFit,
    jacobian, spreadRatio, rmsRadius, readExif, declination, MIN_POINTS, ORDER,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GZGeo = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
