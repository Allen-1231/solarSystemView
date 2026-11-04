/* 太陽系模型 — 主程式（Three.js 0.160）。結構：資料 → 場景/貼圖 → 天體 → 小天體(小行星帶/古柏帶) → 攝影機與輸入 → 自由飛行 → 地球地表圖層(GROUND) → 主迴圈 */
(function () {
  var msg = document.getElementById('msg');
  var canvas = document.getElementById('scene');
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    msg.textContent = '這個瀏覽器無法啟動 WebGL，無法顯示 3D 太陽系。';
    return;
  }
  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(DPR);
  renderer.setClearColor(0x04060b, 1);

  var DEG = Math.PI / 180, TAU = Math.PI * 2;
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(35, 1, 0.03, 3000);
  var FOV_TAN = Math.tan(17.5 * DEG);
  var V3 = THREE.Vector3;

  /* ---------- textures ---------- */
  var loadTotal = Object.keys(TEX).length, loadDone = 0;
  var manager = new THREE.LoadingManager(function () { msg.classList.add('done'); });
  manager.onProgress = function () { loadDone++; msg.textContent = '載入天體貼圖 ' + Math.min(loadDone, loadTotal) + ' / ' + loadTotal; };
  var loader = new THREE.TextureLoader(manager);
  var aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  var T = {};
  Object.keys(TEX).forEach(function (k) {
    var t = loader.load(TEX[k]);
    t.anisotropy = aniso;
    if (k !== 'ring') t.wrapS = THREE.RepeatWrapping;
    T[k] = t;
  });

  /* ---------- orbital mechanics ---------- */
  var J2000 = Date.UTC(2000, 0, 1, 12, 0, 0);
  var startMs = Date.now();
  var simDays = 0;
  function daysNow() { return (startMs - J2000) / 86400000 + simDays; }
  function auMap(r) { return 3 + 7.5 * Math.pow(r, 0.52); }
  function kepler(M, e) { var E = M; for (var i = 0; i < 7; i++) E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); return E; }
  function posFromE(el, E, out) {
    var xv = el.a * (Math.cos(E) - el.e), yv = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
    var r = Math.hypot(xv, yv), nu = Math.atan2(yv, xv);
    var u = nu + (el.w - el.Om) * DEG, Om = el.Om * DEG, inc = el.i * DEG;
    var cu = Math.cos(u), su = Math.sin(u), cO = Math.cos(Om), sO = Math.sin(Om), ci = Math.cos(inc), si = Math.sin(inc);
    var X = r * (cO * cu - sO * su * ci), Y = r * (sO * cu + cO * su * ci), Z = r * su * si;
    var s = auMap(r) / r;
    out.set(X * s, Z * s, -Y * s);
    return r;
  }
  function planetPos(el, d, out) {
    var M = (el.L0 - el.w) * DEG + TAU * d / el.P;
    M = ((M % TAU) + TAU) % TAU;
    return posFromE(el, kepler(M, el.e), out);
  }

  /* ---------- body data ---------- */
  var PL = [
    { id: 'mercury', name: '水星', en: 'Mercury', R: 0.40, a: 0.38710, e: 0.20563, L0: 252.251, w: 77.457, i: 7.005, Om: 48.331, P: 87.969, tilt: 0.03, rotH: 1407.6, tex: 'mercury', bump: 'mercuryBump', bumpK: 2.0, bumpTexel: [1024, 512], fd: 2.5 },
    { id: 'venus', name: '金星', en: 'Venus', R: 0.63, a: 0.72333, e: 0.00677, L0: 181.980, w: 131.564, i: 3.395, Om: 76.680, P: 224.701, tilt: 177.36, rotH: 5832.5, tex: 'venus', atmo: { c: [1.0, 0.80, 0.45], k: 0.95, s: 1.07 }, rim: [1.0, 0.85, 0.55], rimK: 0.45, fd: 3.2 },
    { id: 'earth', name: '地球', en: 'Earth', R: 0.65, a: 1.00000, e: 0.01671, L0: 100.464, w: 102.937, i: 0, Om: 0, P: 365.256, tilt: 23.44, rotH: 23.934, earth: true, atmo: { c: [0.30, 0.56, 1.0], k: 1.0, s: 1.085 }, fd: 3.3 },
    { id: 'mars', name: '火星', en: 'Mars', R: 0.47, a: 1.52368, e: 0.09340, L0: 355.453, w: 336.060, i: 1.850, Om: 49.558, P: 686.980, tilt: 25.19, rotH: 24.623, tex: 'mars', bump: 'marsBump', bumpK: 2.4, bumpTexel: [1024, 512], atmo: { c: [0.95, 0.62, 0.42], k: 0.45, s: 1.05 }, rim: [0.95, 0.6, 0.4], rimK: 0.25, fd: 2.7 },
    { id: 'jupiter', name: '木星', en: 'Jupiter', R: 2.18, a: 5.20260, e: 0.04849, L0: 34.404, w: 14.753, i: 1.303, Om: 100.464, P: 4332.59, tilt: 3.13, rotH: 9.925, tex: 'jupiter', atmo: { c: [0.85, 0.78, 0.66], k: 0.28, s: 1.035 }, fd: 10 },
    { id: 'saturn', name: '土星', en: 'Saturn', R: 1.95, a: 9.55490, e: 0.05551, L0: 49.944, w: 92.599, i: 2.489, Om: 113.666, P: 10759.22, tilt: 26.73, rotH: 10.656, tex: 'saturn', ring: true, atmo: { c: [0.95, 0.86, 0.62], k: 0.24, s: 1.035 }, fd: 15.5 },
    { id: 'uranus', name: '天王星', en: 'Uranus', R: 1.30, a: 19.2184, e: 0.04630, L0: 313.232, w: 170.954, i: 0.773, Om: 74.017, P: 30688.5, tilt: 97.77, rotH: 17.24, tex: 'uranus', atmo: { c: [0.55, 0.92, 0.96], k: 0.65, s: 1.05 }, fd: 6.6 },
    { id: 'neptune', name: '海王星', en: 'Neptune', R: 1.28, a: 30.1104, e: 0.00899, L0: 304.880, w: 44.971, i: 1.770, Om: 131.784, P: 60182, tilt: 28.32, rotH: 16.11, tex: 'neptune', atmo: { c: [0.30, 0.50, 1.0], k: 0.75, s: 1.05 }, fd: 6.5 },
    { id: 'pluto', name: '冥王星', en: 'Pluto', R: 0.30, a: 39.482, e: 0.24883, L0: 238.929, w: 224.067, i: 17.16, Om: 110.299, P: 90560, tilt: 122.53, rotH: 153.29, tex: 'pluto', bump: 'plutoBump', bumpK: 1.6, bumpTexel: [1000, 500], fd: 1.8 }
  ];
  var MN = [
    { id: 'moon', parent: 'earth', name: '月球', en: 'Moon', R: 0.19, dist: 2.1, P: 27.3217, ph: 1.1, tex: 'moon', bump: 'moonBump', bumpK: 2.6, bumpTexel: [1440, 720], fd: 1.1 },
    { id: 'io', parent: 'jupiter', name: '木衛一', en: 'Io', R: 0.17, dist: 3.7, P: 1.7691, ph: 0.4, tex: 'io', fd: 1.0 },
    { id: 'europa', parent: 'jupiter', name: '木衛二', en: 'Europa', R: 0.15, dist: 4.6, P: 3.5512, ph: 2.3, tex: 'europa', fd: 0.9 },
    { id: 'ganymede', parent: 'jupiter', name: '木衛三', en: 'Ganymede', R: 0.22, dist: 5.7, P: 7.1546, ph: 4.0, tex: 'ganymede', fd: 1.3 },
    { id: 'callisto', parent: 'jupiter', name: '木衛四', en: 'Callisto', R: 0.20, dist: 7.1, P: 16.689, ph: 5.3, tex: 'callisto', fd: 1.2 }
  ];
  var SUN_R = 3.6;

  var INFO = {
    sun: { sub: 'G 型主序星（黃矮星）', f: [['直徑', '139.1 萬 km'], ['質量', '33.3 萬個地球'], ['表面溫度', '約 5,500 °C'], ['核心溫度', '約 1,500 萬 °C'], ['自轉', '約 25 天（赤道）'], ['年齡', '約 46 億年']], fun: '太陽占了整個太陽系約 99.86% 的質量，其餘全部加起來只是零頭。' },
    mercury: { sub: '類地行星 · 第 1 顆 · 無衛星', f: [['直徑', '4,879 km'], ['距太陽', '$AU'], ['公轉', '88 天'], ['自轉', '58.6 天'], ['軸傾角', '0.03°'], ['表面溫度', '−180～430 °C']], fun: '幾乎沒有大氣保溫，晝夜溫差超過 600 °C，是太陽系最大的溫差之一。' },
    venus: { sub: '類地行星 · 第 2 顆 · 無衛星', f: [['直徑', '12,104 km'], ['距太陽', '$AU'], ['公轉', '224.7 天'], ['自轉', '243 天（逆行）'], ['軸傾角', '177.4°'], ['平均溫度', '464 °C']], fun: '金星的一天比一年還長，而且太陽是從西邊升起。' },
    earth: { sub: '類地行星 · 第 3 顆 · 1 顆衛星', f: [['直徑', '12,742 km'], ['距太陽', '$AU'], ['公轉', '365.25 天'], ['自轉', '23 時 56 分'], ['軸傾角', '23.44°'], ['平均溫度', '15 °C']], fun: '目前唯一已知有生命的行星，表面約 71% 被海洋覆蓋。' },
    mars: { sub: '類地行星 · 第 4 顆 · 2 顆衛星', f: [['直徑', '6,779 km'], ['距太陽', '$AU'], ['公轉', '687 天'], ['自轉', '24 時 37 分'], ['軸傾角', '25.19°'], ['平均溫度', '−63 °C']], fun: '奧林帕斯山高約 22 公里，是太陽系已知最高的火山。' },
    jupiter: { sub: '氣態巨行星 · 第 5 顆 · 90+ 顆衛星', f: [['直徑', '139,820 km'], ['距太陽', '$AU'], ['公轉', '11.86 年'], ['自轉', '9 時 56 分'], ['軸傾角', '3.13°'], ['雲頂溫度', '−110 °C']], fun: '質量是其他七顆行星總和的 2.5 倍以上，大紅斑風暴已持續數百年。' },
    saturn: { sub: '氣態巨行星 · 第 6 顆 · 270+ 顆衛星', f: [['直徑', '116,460 km'], ['距太陽', '$AU'], ['公轉', '29.46 年'], ['自轉', '約 10.7 小時'], ['軸傾角', '26.73°'], ['雲頂溫度', '−140 °C']], fun: '平均密度比水還低；主環寬達數十萬公里，厚度卻通常只有十公尺左右。' },
    uranus: { sub: '冰巨行星 · 第 7 顆 · 28+ 顆衛星', f: [['直徑', '50,724 km'], ['距太陽', '$AU'], ['公轉', '84.0 年'], ['自轉', '17 時 14 分（逆行）'], ['軸傾角', '97.77°'], ['雲頂溫度', '−195 °C']], fun: '自轉軸幾乎躺平，像是側著身子滾過軌道，每個極點連續白天或黑夜約 42 年。' },
    neptune: { sub: '冰巨行星 · 第 8 顆 · 16 顆衛星', f: [['直徑', '49,244 km'], ['距太陽', '$AU'], ['公轉', '164.8 年'], ['自轉', '16 時 6 分'], ['軸傾角', '28.32°'], ['雲頂溫度', '−200 °C']], fun: '風速可超過每小時 2,000 公里，是太陽系風最強的行星。' },
    pluto: { sub: '矮行星 · 柯伊伯帶 · 5 顆衛星', f: [['直徑', '2,377 km'], ['距太陽', '$AU'], ['公轉', '248 年'], ['自轉', '6.4 天（逆行）'], ['軸傾角', '122.5°'], ['表面溫度', '約 −230 °C']], fun: '2006 年被重新分類為矮行星；軌道偏心又傾斜，有時比海王星更靠近太陽。' },
    moon: { sub: '地球的天然衛星', f: [['直徑', '3,474 km'], ['距地球', '38.4 萬 km'], ['公轉', '27.3 天'], ['自轉', '27.3 天（同步）'], ['表面重力', '1.62 m/s²'], ['表面溫度', '−173～127 °C']], fun: '潮汐鎖定，永遠以同一面朝向地球；每年約遠離 3.8 公分。' },
    io: { sub: '木星的伽利略衛星', f: [['直徑', '3,643 km'], ['距木星', '42.2 萬 km'], ['公轉', '1.77 天'], ['自轉', '1.77 天（同步）'], ['表面重力', '1.80 m/s²'], ['平均溫度', '約 −163 °C']], fun: '太陽系火山活動最劇烈的天體，潮汐拉扯讓內部不斷被揉熱。' },
    europa: { sub: '木星的伽利略衛星', f: [['直徑', '3,122 km'], ['距木星', '67.1 萬 km'], ['公轉', '3.55 天'], ['自轉', '3.55 天（同步）'], ['表面重力', '1.31 m/s²'], ['平均溫度', '約 −171 °C']], fun: '冰殼之下很可能有液態海洋，是尋找外星生命的熱門目標。' },
    ganymede: { sub: '木星的伽利略衛星', f: [['直徑', '5,268 km'], ['距木星', '107 萬 km'], ['公轉', '7.15 天'], ['自轉', '7.15 天（同步）'], ['表面重力', '1.43 m/s²'], ['平均溫度', '約 −163 °C']], fun: '太陽系最大的衛星，比水星還大，也是唯一有自己磁場的衛星。' },
    callisto: { sub: '木星的伽利略衛星', f: [['直徑', '4,821 km'], ['距木星', '188 萬 km'], ['公轉', '16.69 天'], ['自轉', '16.69 天（同步）'], ['表面重力', '1.24 m/s²'], ['平均溫度', '約 −139 °C']], fun: '表面是太陽系隕石坑最密集的地方之一，幾乎沒有地質活動抹去痕跡。' }
  };

  /* ---------- shaders ---------- */
  var PLANET_VS = [
    'varying vec2 vUv; varying vec3 vN; varying vec3 vE; varying vec3 vNo; varying vec3 vW;',
    'void main(){',
    '  vUv = uv;',
    '  vec3 n = normalize(normal);',
    '  vec3 e = normalize(cross(vec3(0.,1.,0.), n));',
    '  vec3 no = cross(n, e);',
    '  mat3 m = mat3(modelMatrix);',
    '  vN = normalize(m * n); vE = normalize(m * e); vNo = normalize(m * no);',
    '  vec4 w = modelMatrix * vec4(position, 1.0);',
    '  vW = w.xyz;',
    '  gl_Position = projectionMatrix * viewMatrix * w;',
    '}'
  ].join('\n');

  var PLANET_FS = [
    'uniform sampler2D map, bumpMap, ringMap;',
    'uniform float useBump, bumpK, rimK, ringOn, ringIn, ringOut;',
    'uniform vec2 bumpTexel;',
    'uniform vec3 sunDir, rimColor, ringN, pc;',
    'varying vec2 vUv; varying vec3 vN; varying vec3 vE; varying vec3 vNo; varying vec3 vW;',
    'void main(){',
    '  vec3 N = normalize(vN);',
    '  vec3 Nb = N;',
    '  if (useBump > 0.5) {',
    '    float hx = texture2D(bumpMap, vUv + vec2(bumpTexel.x,0.)).r - texture2D(bumpMap, vUv - vec2(bumpTexel.x,0.)).r;',
    '    float hy = texture2D(bumpMap, vUv + vec2(0.,bumpTexel.y)).r - texture2D(bumpMap, vUv - vec2(0.,bumpTexel.y)).r;',
    '    Nb = normalize(N - bumpK * (hx * normalize(vE) + hy * normalize(vNo)));',
    '  }',
    '  vec3 V = normalize(cameraPosition - vW);',
    '  float ndl = dot(N, sunDir);',
    '  float soft = smoothstep(-0.07, 0.24, ndl);',
    '  float l = clamp(dot(Nb, sunDir), 0.0, 1.0);',
    '  vec3 c = texture2D(map, vUv).rgb;',
    '  float shade = 1.0;',
    '  if (ringOn > 0.5) {',
    '    float dn = dot(sunDir, ringN);',
    '    if (abs(dn) > 0.001) {',
    '      float t = dot(pc - vW, ringN) / dn;',
    '      if (t > 0.0) {',
    '        vec3 hit = vW + sunDir * t;',
    '        float rr = length(hit - pc);',
    '        float u = (rr - ringIn) / (ringOut - ringIn);',
    '        if (u > 0.0 && u < 1.0) shade = 1.0 - texture2D(ringMap, vec2(u, 0.5)).a * 0.88;',
    '      }',
    '    }',
    '  }',
    '  vec3 col = c * (0.010 + 1.12 * pow(l, 0.78) * soft * shade);',
    '  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);',
    '  col += rimColor * fres * (0.08 + 0.92 * clamp(ndl + 0.35, 0.0, 1.0)) * rimK;',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  var EARTH_FS = [
    'uniform sampler2D dayMap, nightMap, topoMap, waterMap;',
    'uniform vec3 sunDir;',
    'varying vec2 vUv; varying vec3 vN; varying vec3 vE; varying vec3 vNo; varying vec3 vW;',
    'void main(){',
    '  vec3 N = normalize(vN);',
    '  vec2 px = vec2(1.0/2048.0, 1.0/1024.0);',
    '  float hx = texture2D(topoMap, vUv + vec2(px.x,0.)).r - texture2D(topoMap, vUv - vec2(px.x,0.)).r;',
    '  float hy = texture2D(topoMap, vUv + vec2(0.,px.y)).r - texture2D(topoMap, vUv - vec2(0.,px.y)).r;',
    '  vec3 Nb = normalize(N - 3.2 * (hx * normalize(vE) + hy * normalize(vNo)));',
    '  vec3 V = normalize(cameraPosition - vW);',
    '  float ndl = dot(N, sunDir);',
    '  float dayMix = smoothstep(-0.10, 0.20, ndl);',
    '  float diff = clamp(dot(Nb, sunDir), 0.0, 1.0);',
    '  vec3 dayC = texture2D(dayMap, vUv).rgb;',
    '  vec3 col = dayC * (0.10 + 1.02 * pow(diff, 0.7)) * dayMix;',
    '  float water = texture2D(waterMap, vUv).r;',
    '  vec3 H = normalize(sunDir + V);',
    '  float spec = pow(max(dot(Nb, H), 0.0), 70.0) * water;',
    '  col += vec3(1.0, 0.95, 0.85) * spec * 0.55 * dayMix;',
    '  vec3 nightC = texture2D(nightMap, vUv).rgb;',
    '  float nightMix = 1.0 - dayMix;',
    '  col += dayC * 0.028 * nightMix;',
    '  col += vec3(1.0, 0.82, 0.55) * pow(nightC, vec3(1.15)) * 1.5 * nightMix;',
    '  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);',
    '  float sunSide = clamp(ndl + 0.35, 0.0, 1.0);',
    '  col += vec3(0.28, 0.58, 1.0) * fres * (0.10 + 0.9 * sunSide) * 0.85;',
    '  col += vec3(1.0, 0.45, 0.2) * exp(-pow(ndl / 0.11, 2.0)) * 0.10 * (0.4 + fres);',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  var CLOUD_FS = [
    'uniform sampler2D cloudMap; uniform vec3 sunDir;',
    'varying vec2 vUv; varying vec3 vN;',
    'void main(){',
    '  float d = texture2D(cloudMap, vUv).r;',
    '  float ndl = dot(normalize(vN), sunDir);',
    '  float lit = 0.035 + 0.965 * smoothstep(-0.12, 0.28, ndl);',
    '  gl_FragColor = vec4(vec3(1.0) * lit, d * 0.92);',
    '}'
  ].join('\n');
  var CLOUD_VS = [
    'varying vec2 vUv; varying vec3 vN;',
    'void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal);',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }'
  ].join('\n');

  var ATMO_VS = [
    'varying vec3 vNw; varying vec3 vWp;',
    'void main(){ vNw = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vWp = w.xyz;',
    '  gl_Position = projectionMatrix * viewMatrix * w; }'
  ].join('\n');
  var ATMO_FS = [
    'uniform vec3 sunDir, color; uniform float k;',
    'varying vec3 vNw; varying vec3 vWp;',
    'void main(){',
    '  vec3 V = normalize(cameraPosition - vWp);',
    '  vec3 n = normalize(vNw);',
    '  float i = pow(clamp(0.60 - dot(n, V), 0.0, 1.0), 3.4);',
    '  float lit = clamp(dot(n, sunDir) + 0.55, 0.0, 1.0);',
    '  vec3 c = mix(color * 0.55, mix(color, vec3(1.0), 0.25), i);',
    '  gl_FragColor = vec4(c * i * (0.25 + 0.95 * lit) * 1.5 * k, 1.0);',
    '}'
  ].join('\n');

  var RING_VS = [
    'varying vec2 vUv; varying vec3 vW;',
    'void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;',
    '  gl_Position = projectionMatrix * viewMatrix * w; }'
  ].join('\n');
  var RING_FS = [
    'uniform sampler2D ringMap; uniform vec3 sunDir, pc, ringN; uniform float pr;',
    'varying vec2 vUv; varying vec3 vW;',
    'void main(){',
    '  vec4 t = texture2D(ringMap, vec2(vUv.x, 0.5));',
    '  vec3 oc = vW - pc;',
    '  float b = dot(oc, sunDir);',
    '  float c = dot(oc, oc) - pr * pr;',
    '  float disc = b * b - c;',
    '  float sh = 1.0;',
    '  if (disc > 0.0 && (-b - sqrt(disc)) > 0.0) sh = 1.0 - smoothstep(0.0, 0.10, disc / (pr * pr));',
    '  float lit = 0.10 + 0.90 * pow(abs(dot(ringN, sunDir)), 0.45);',
    '  gl_FragColor = vec4(t.rgb * lit * (0.06 + 0.94 * sh) * 1.05, t.a * 0.96);',
    '}'
  ].join('\n');

  var SUN_VS = [
    'varying vec2 vUv; varying vec3 vN; varying vec3 vW;',
    'void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;',
    '  gl_Position = projectionMatrix * viewMatrix * w; }'
  ].join('\n');
  var SUN_FS = [
    'uniform sampler2D map; uniform float time;',
    'varying vec2 vUv; varying vec3 vN; varying vec3 vW;',
    'void main(){',
    '  vec3 V = normalize(cameraPosition - vW);',
    '  float mu = clamp(dot(normalize(vN), V), 0.0, 1.0);',
    '  vec3 a = texture2D(map, vUv + vec2(time * 0.0040, 0.0)).rgb;',
    '  vec3 b = texture2D(map, vUv + vec2(0.37 - time * 0.0027, 0.0)).rgb;',
    '  vec3 c = mix(a, b, 0.5);',
    '  float lum = dot(c, vec3(0.3, 0.59, 0.11));',
    '  c = mix(c, vec3(1.0, 0.82, 0.5) * (lum * 1.5 + 0.2), 0.3);',
    '  c *= 0.52 + 0.78 * pow(mu, 0.5);',
    '  c += vec3(1.0, 0.5, 0.12) * pow(1.0 - mu, 3.0) * 0.30;',
    '  gl_FragColor = vec4(c * 1.05, 1.0);',
    '}'
  ].join('\n');

  /* ---------- scene graph ---------- */
  var root = new THREE.Group();
  scene.add(root);
  var BODY = {};
  var bodyList = [];
  var sunTime = { value: 0 };
  var orbitLines = [];

  function sphereGeo(r, hi) { return new THREE.SphereGeometry(r, hi ? 160 : 96, hi ? 96 : 64); }

  function makeAtmo(parentGroup, R, spec, sunU) {
    var m = new THREE.ShaderMaterial({
      uniforms: { sunDir: sunU, color: { value: new V3(spec.c[0], spec.c[1], spec.c[2]) }, k: { value: spec.k } },
      vertexShader: ATMO_VS, fragmentShader: ATMO_FS,
      side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    var mesh = new THREE.Mesh(new THREE.SphereGeometry(R * spec.s, 80, 56), m);
    parentGroup.add(mesh);
    return mesh;
  }

  function makeBody(o, isMoon) {
    var b = { id: o.id, name: o.name, en: o.en, R: o.R, def: o, isMoon: !!isMoon };
    b.group = new THREE.Group();
    b.tilt = new THREE.Group();
    b.group.add(b.tilt);
    b.sunU = { value: new V3(1, 0, 0) };
    b.spin = isMoon ? 0 : TAU * (24 / Math.abs(o.rotH)) * 0.03;
    if (!isMoon) b.tilt.rotation.z = -o.tilt * DEG;
    var mat;
    if (o.earth) {
      mat = new THREE.ShaderMaterial({
        uniforms: { dayMap: { value: T.earth_day }, nightMap: { value: T.earth_night }, topoMap: { value: T.earth_topo }, waterMap: { value: T.earth_water }, sunDir: b.sunU },
        vertexShader: PLANET_VS, fragmentShader: EARTH_FS
      });
    } else {
      var rim = o.rim || [0.5, 0.65, 0.9];
      mat = new THREE.ShaderMaterial({
        uniforms: {
          map: { value: T[o.tex] }, bumpMap: { value: o.bump ? T[o.bump] : T[o.tex] }, ringMap: { value: T.ring },
          useBump: { value: o.bump ? 1 : 0 }, bumpK: { value: o.bumpK || 0 },
          bumpTexel: { value: new THREE.Vector2(1 / (o.bumpTexel ? o.bumpTexel[0] : 1024), 1 / (o.bumpTexel ? o.bumpTexel[1] : 512)) },
          rimK: { value: o.rim ? o.rimK : 0 }, rimColor: { value: new V3(rim[0], rim[1], rim[2]) },
          sunDir: b.sunU, ringOn: { value: o.ring ? 1 : 0 }, ringN: { value: new V3(0, 1, 0) }, pc: { value: new V3() },
          ringIn: { value: o.R * 1.24 }, ringOut: { value: o.R * 2.27 }
        },
        vertexShader: PLANET_VS, fragmentShader: PLANET_FS
      });
    }
    b.mat = mat;
    b.mesh = new THREE.Mesh(sphereGeo(o.R, !!o.earth), mat);
    b.tilt.add(b.mesh);

    if (o.earth) {
      var cm = new THREE.ShaderMaterial({
        uniforms: { cloudMap: { value: T.earth_clouds }, sunDir: b.sunU },
        vertexShader: CLOUD_VS, fragmentShader: CLOUD_FS, transparent: true, depthWrite: false
      });
      b.clouds = new THREE.Mesh(new THREE.SphereGeometry(o.R * 1.009, 128, 80), cm);
      b.tilt.add(b.clouds);
      b.cloudDrift = 0;
    }
    if (o.atmo) b.atmo = makeAtmo(b.group, o.R, o.atmo, b.sunU);

    if (o.ring) {
      var inner = o.R * 1.24, outer = o.R * 2.27;
      var rg = new THREE.RingGeometry(inner, outer, 160, 1);
      var p = rg.attributes.position, uv = rg.attributes.uv;
      for (var i = 0; i < p.count; i++) {
        var rr = Math.hypot(p.getX(i), p.getY(i));
        uv.setXY(i, (rr - inner) / (outer - inner), 0.5);
      }
      rg.rotateX(-Math.PI / 2);
      var rmat = new THREE.ShaderMaterial({
        uniforms: { ringMap: { value: T.ring }, sunDir: b.sunU, pc: mat.uniforms.pc, ringN: mat.uniforms.ringN, pr: { value: o.R } },
        vertexShader: RING_VS, fragmentShader: RING_FS, transparent: true, side: THREE.DoubleSide, depthWrite: false
      });
      b.ring = new THREE.Mesh(rg, rmat);
      b.tilt.add(b.ring);
    }
    bodyList.push(b); BODY[o.id] = b;
    return b;
  }

  /* sun */
  (function () {
    var b = { id: 'sun', name: '太陽', en: 'Sun', R: SUN_R, def: { fd: 12.6 }, isSun: true };
    b.group = new THREE.Group();
    var mat = new THREE.ShaderMaterial({ uniforms: { map: { value: T.sun }, time: sunTime }, vertexShader: SUN_VS, fragmentShader: SUN_FS });
    b.mesh = new THREE.Mesh(new THREE.SphereGeometry(SUN_R, 128, 80), mat);
    b.group.add(b.mesh);
    b.spin = TAU * (24 / 609) * 0.03;
    function glow(size, stops) {
      var c = document.createElement('canvas'); c.width = c.height = 256;
      var g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
      stops.forEach(function (s) { gr.addColorStop(s[0], s[1]); });
      g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
      var tex = new THREE.CanvasTexture(c);
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      sp.scale.set(size, size, 1);
      return sp;
    }
    b.glowA = glow(SUN_R * 5.2, [[0, 'rgba(255,240,200,0.95)'], [0.2, 'rgba(255,196,110,0.55)'], [0.45, 'rgba(255,140,50,0.18)'], [1, 'rgba(255,100,20,0)']]);
    b.glowB = glow(SUN_R * 16, [[0, 'rgba(255,190,110,0.28)'], [0.3, 'rgba(255,150,70,0.09)'], [1, 'rgba(255,120,40,0)']]);
    b.group.add(b.glowA); b.group.add(b.glowB);
    root.add(b.group);
    BODY.sun = b; bodyList.push(b);
  })();

  PL.forEach(function (o) {
    var b = makeBody(o, false);
    b.el = o;
    root.add(b.group);
    /* orbit line */
    var pts = [], tmp = new V3();
    for (var k = 0; k <= 256; k++) { posFromE(o, k / 256 * TAU, tmp); pts.push(tmp.clone()); }
    var line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x8fb4e8, transparent: true, opacity: 0.28, depthWrite: false }));
    root.add(line); b.line = line; orbitLines.push(line);
  });

  var moonAng = {};
  MN.forEach(function (o) {
    var b = makeBody(o, true);
    b.parentId = o.parent;
    BODY[o.parent].group.add(b.group);
    moonAng[o.id] = o.ph;
    var pts = [];
    for (var k = 0; k <= 128; k++) { var a = k / 128 * TAU; pts.push(new V3(Math.cos(a) * o.dist, 0, -Math.sin(a) * o.dist)); }
    var line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x8fb4e8, transparent: true, opacity: 0.22, depthWrite: false }));
    BODY[o.parent].group.add(line); b.line = line; b.line.visible = false;
  });

  /* small-body populations (Keplerian, evaluated per vertex): main belt with Kirkwood gaps, Hungarias, Hildas,
     Jupiter Trojans (L4/L5), near-Earth asteroids, classical Kuiper belt, Plutinos and scattered disc */
  var belt;
  (function () {
    function gs() { return (Math.random() + Math.random() + Math.random() + Math.random() - 2) / 0.58; }
    function G(x, m, w, h) { var t = (x - m) / w; return h * Math.exp(-t * t); }
    function dens(a) {
      var d = G(a, 2.28, 0.12, 1.0) + G(a, 2.37, 0.06, 0.7) + G(a, 2.62, 0.10, 1.0) + G(a, 2.88, 0.10, 0.8) + G(a, 3.13, 0.08, 1.1) + 0.12;
      [[2.065, 0.008], [2.50, 0.012], [2.82, 0.02], [2.958, 0.012], [3.27, 0.015]].forEach(function (g) { d *= 1 - 0.93 * Math.exp(-Math.pow((a - g[0]) / g[1], 2)); });
      return d;
    }
    var pops = [], DR = DEG;
    function add(n, f) { for (var i = 0; i < n; i++) pops.push(f()); }
    function el(a, e, iDeg, Om, w, M0, B, col, per) { return [a, e, iDeg * DR, Om, w, M0, B, col[0], col[1], col[2], per || 365.256 * Math.pow(a, 1.5)]; }
    function bright(k) { return 0.28 + 0.72 * Math.pow(Math.random(), k || 2.2); }
    var JL0 = 34.404 * DR, JW = 14.753 * DR, JP = 4332.59;
    /* main belt (~38 000) */
    add(38000, function () {
      var a, e, t = 0; do { a = 2.05 + Math.random() * 1.3; t++; } while (Math.random() * 3.4 > dens(a) && t < 60);
      e = Math.min(0.34, Math.abs(gs()) * 0.09 + 0.02); if (a * (1 - e) < 1.7) e = Math.max(0.01, 1 - 1.7 / a);
      var inc = Math.abs(gs()) * 5.5 + (Math.random() < 0.18 ? Math.abs(gs()) * 9 : 0); if (inc > 32) inc = 32;
      var col = a < 2.5 ? [0.95, 0.80, 0.60] : (a < 2.82 ? [0.80, 0.78, 0.74] : [0.62, 0.66, 0.74]);
      return el(a, e, inc, Math.random() * TAU, Math.random() * TAU, Math.random() * TAU, bright(2.4), col);
    });
    /* Hungaria group (1.78-2.0 AU, steep inclination) */
    add(1500, function () { return el(1.78 + Math.random() * 0.22, 0.05 + Math.random() * 0.12, 16 + Math.random() * 14, Math.random() * TAU, Math.random() * TAU, Math.random() * TAU, bright(2.4), [1.0, 0.82, 0.58]); });
    /* Hildas (3:2 with Jupiter, ~3.97 AU) */
    add(1800, function () { var a = 3.97 + gs() * 0.05, ph = Math.floor(Math.random() * 3) * TAU / 3; return el(a, 0.12 + Math.random() * 0.16, Math.abs(gs()) * 6, Math.random() * TAU, Math.random() * TAU, ph + gs() * 0.35, bright(2.4), [0.72, 0.62, 0.55]); });
    /* Jupiter Trojans: ahead (L4) and behind (L5) by 60 degrees, locked to Jupiter's period */
    add(4200, function () {
      var side = Math.random() < 0.55 ? 1 : -1, om = Math.random() * TAU, vp = JW + gs() * 0.5, lam = JL0 + side * (Math.PI / 3) + gs() * 0.28;
      return el(5.2026 + gs() * 0.05, Math.abs(gs()) * 0.05 + 0.01, Math.abs(gs()) * 9 + Math.random() * 3, om, vp - om, lam - vp, bright(2.6), [0.88, 0.62, 0.50], JP);
    });
    /* near-Earth asteroids (Aten / Apollo / Amor style) */
    add(900, function () { var q = 0.75 + Math.random() * 0.55, e = 0.25 + Math.random() * 0.55, a = q / (1 - e); if (a > 3) a = 2.2 + Math.random() * 0.7; return el(a, Math.min(0.85, e), Math.abs(gs()) * 11 + Math.random() * 3, Math.random() * TAU, Math.random() * TAU, Math.random() * TAU, 0.55 + Math.random() * 0.45, [1.0, 0.86, 0.45]); });
    /* classical Kuiper belt (cold + hot) */
    add(6500, function () { var hot = Math.random() < 0.4, a = 41.5 + Math.random() * 6.5; return el(a, Math.abs(gs()) * (hot ? 0.09 : 0.04) + 0.01, Math.abs(gs()) * (hot ? 12 : 2.5), Math.random() * TAU, Math.random() * TAU, Math.random() * TAU, bright(2.2) * 0.9, [0.70, 0.78, 0.96]); });
    /* Plutinos: 3:2 with Neptune (39.4 AU) */
    add(2600, function () { var ph = Math.floor(Math.random() * 3) * TAU / 3; return el(39.4 + gs() * 0.25, 0.1 + Math.random() * 0.17, Math.abs(gs()) * 9, Math.random() * TAU, Math.random() * TAU, ph + gs() * 0.5, bright(2.2) * 0.9, [0.92, 0.72, 0.68]); });
    /* scattered disc */
    add(900, function () { var a = 50 + Math.pow(Math.random(), 1.6) * 40; return el(a, 0.3 + Math.random() * 0.35, Math.abs(gs()) * 14 + 3, Math.random() * TAU, Math.random() * TAU, Math.random() * TAU, bright(2) * 0.8, [0.78, 0.74, 0.92]); });
    var n = pops.length, E1 = new Float32Array(n * 4), E2 = new Float32Array(n * 4), C = new Float32Array(n * 3), P = new Float32Array(n * 3);
    pops.forEach(function (q, i) {
      E1[i * 4] = q[0]; E1[i * 4 + 1] = q[1]; E1[i * 4 + 2] = q[2]; E1[i * 4 + 3] = q[3];
      E2[i * 4] = q[4]; E2[i * 4 + 1] = q[5]; E2[i * 4 + 2] = q[6]; E2[i * 4 + 3] = q[10];
      C[i * 3] = q[7]; C[i * 3 + 1] = q[8]; C[i * 3 + 2] = q[9];
    });
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('aE1', new THREE.BufferAttribute(E1, 4));
    g.setAttribute('aE2', new THREE.BufferAttribute(E2, 4));
    g.setAttribute('aC', new THREE.BufferAttribute(C, 3));
    belt = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: { uDays: { value: 0 }, uPx: { value: DPR } },
      vertexShader: [
        'attribute vec4 aE1; attribute vec4 aE2; attribute vec3 aC; uniform float uDays; uniform float uPx; varying vec3 vC; varying float vB;',
        'void main(){',
        '  float a = aE1.x, e = aE1.y, inc = aE1.z, Om = aE1.w, w = aE2.x, B = aE2.z;',
        '  float M = mod(aE2.y + 6.2831853 * uDays / aE2.w, 6.2831853);',
        '  float E = M + e * sin(M) * (1.0 + e * cos(M));',
        '  for (int k = 0; k < 6; k++) { E = E - (E - e * sin(E) - M) / (1.0 - e * cos(E)); }',
        '  float xv = a * (cos(E) - e), yv = a * sqrt(1.0 - e * e) * sin(E);',
        '  float r = sqrt(xv * xv + yv * yv), u = atan(yv, xv) + w;',
        '  float cu = cos(u), su = sin(u), cO = cos(Om), sO = sin(Om), ci = cos(inc), si = sin(inc);',
        '  float X = r * (cO * cu - sO * su * ci), Y = r * (sO * cu + cO * su * ci), Z = r * su * si;',
        '  float s = (3.0 + 7.5 * pow(r, 0.52)) / r;',
        '  vec3 p = vec3(X * s, Z * s, -Y * s);',
        '  vec4 mv = viewMatrix * vec4(p, 1.0);',
        '  vB = B; vC = aC;',
        '  gl_PointSize = (1.0 + B * 1.1) * uPx * clamp(14.0 / max(-mv.z, 1.0), 0.75, 4.0);',
        '  gl_Position = projectionMatrix * mv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'varying vec3 vC; varying float vB;',
        'void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;',
        '  gl_FragColor = vec4(vC * vB, 0.85 * (1.0 - d * 1.2)); }'
      ].join('\n'),
      transparent: true, depthWrite: false
    }));
    belt.frustumCulled = false;
    root.add(belt);
  })();

  /* stars + milky way band (follows camera) */
  var sky = new THREE.Group();
  scene.add(sky);
  (function () {
    function gauss() { return (Math.random() + Math.random() + Math.random() + Math.random() - 2) / 0.58; }
    function make(n, bandFrac, size, alpha) {
      var pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
      var nrm = new V3(0.32, 0.88, 0.34).normalize();
      var q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), nrm);
      for (var i = 0; i < n; i++) {
        var v = new V3(), a = Math.random() * TAU;
        if (Math.random() < bandFrac) {
          var lat = gauss() * 0.13;
          v.set(Math.cos(a) * Math.cos(lat), Math.sin(lat), Math.sin(a) * Math.cos(lat)).applyQuaternion(q);
        } else {
          var u = Math.random() * 2 - 1, s = Math.sqrt(1 - u * u);
          v.set(s * Math.cos(a), u, s * Math.sin(a));
        }
        v.multiplyScalar(1500);
        pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
        var b = 0.3 + Math.pow(Math.random(), 3) * 0.7, w = Math.random();
        col[i * 3] = b * (0.85 + 0.15 * w); col[i * 3 + 1] = b * 0.92; col[i * 3 + 2] = b * (1.0 - 0.18 * w);
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      var p = new THREE.Points(g, new THREE.PointsMaterial({ size: size, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: alpha, depthWrite: false }));
      p.frustumCulled = false;
      sky.add(p);
    }
    make(2600, 0.0, 1.5, 1.0);
    make(16000, 0.85, 1.0, 0.42);
  })();

  /* ---------- camera rig ---------- */
  var cam = { theta: 0.35, phi: 0.5, dist: 100, goalDist: 100, minD: 2, maxD: 520, target: new V3(), offset: new V3(), thetaGoal: 0.35, phiGoal: 0.5, aim: false, free: false, pos: new V3(), tTheta: 0, tPhi: 0 };
  var focusId = 'overview';
  var aspect = 1;
  function overviewDist() { return (aspect < 0.8 ? 66 : 58) / (FOV_TAN * Math.min(aspect, 1.55)); }
  function fitDist(d) { return d * Math.max(1, 0.85 / aspect); }
  function clampDist(d) { return Math.min(cam.maxD, Math.max(cam.minD, d)); }

  var stage = document.getElementById('stage');
  function resize() {
    var w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight);
    renderer.setSize(w, h, false);
    aspect = w / h;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    cam.goalDist = focusId === 'overview' ? overviewDist() : fitDist(BODY[focusId].def.fd);
  }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage); else window.addEventListener('resize', resize);

  /* ---------- UI ---------- */
  var elName = document.getElementById('name'), elSub = document.getElementById('sub'), elFacts = document.getElementById('facts'), elFun = document.getElementById('fun'), elEye = document.getElementById('eyebrow');
  var chipsEl = document.getElementById('chips'), labelsEl = document.getElementById('labels');
  var chipMap = {}, labelMap = {};
  var liveEl = null;

  var ORDER = [['overview', '全景'], ['sun', '太陽'], ['mercury', '水星'], ['venus', '金星'], ['earth', '地球'], ['moon', '月球'], ['mars', '火星'], ['jupiter', '木星'], ['io', '木衛一'], ['europa', '木衛二'], ['ganymede', '木衛三'], ['callisto', '木衛四'], ['saturn', '土星'], ['uranus', '天王星'], ['neptune', '海王星'], ['pluto', '冥王星']];
  ORDER.forEach(function (it) {
    var btn = document.createElement('button');
    btn.type = 'button'; btn.textContent = it[1]; btn.setAttribute('aria-pressed', 'false');
    if (BODY[it[0]] && BODY[it[0]].isMoon) btn.className = 'moon';
    btn.addEventListener('click', function () { setFocus(it[0]); });
    chipsEl.appendChild(btn); chipMap[it[0]] = btn;
    if (it[0] !== 'overview') {
      var lb = document.createElement('button');
      lb.type = 'button'; lb.className = 'lbl'; lb.textContent = it[1];
      lb.addEventListener('click', function () { setFocus(it[0]); });
      labelsEl.appendChild(lb); labelMap[it[0]] = lb;
    }
  });

  function fmtSub(b) { return b.en + ' · ' + INFO[b.id].sub; }
  function setFocus(id) {
    if (cam.free) exitFly();
    var prevTarget = cam.target.clone();
    focusId = id;
    Object.keys(chipMap).forEach(function (k) { chipMap[k].setAttribute('aria-pressed', k === id ? 'true' : 'false'); });
    Object.keys(labelMap).forEach(function (k) { labelMap[k].classList.toggle('sel', k === id); });
    var wp = new V3();
    if (id === 'overview') {
      elEye.textContent = 'Solar System'; elName.textContent = '太陽系';
      elSub.textContent = '八大行星、矮行星冥王星與主要衛星';
      elFacts.innerHTML = '';
      var rows = [['行星', '8 顆'], ['矮行星', '冥王星（此處收錄）'], ['海王星軌道', '約 30 AU'], ['光走到海王星', '約 4.2 小時'], ['1 AU', '1.496 億 km'], ['年齡', '約 46 億年']];
      rows.forEach(function (r) { var d = document.createElement('div'); d.innerHTML = '<dt></dt><dd></dd>'; d.firstChild.textContent = r[0]; d.lastChild.textContent = r[1]; elFacts.appendChild(d); });
      elFun.textContent = '點選天體、名稱或下方按鈕飛過去；拖曳旋轉，雙指或滾輪縮放，雙擊空白處回全景。';
      liveEl = null;
      cam.goalDist = overviewDist(); cam.minD = 8; wp.set(0, 0, 0);
      cam.thetaGoal = cam.theta; cam.phiGoal = aspect < 0.8 ? 0.9 : 0.5; cam.aim = true;
    } else {
      var b = BODY[id], inf = INFO[id];
      elEye.textContent = b.en;
      elName.textContent = b.name;
      elSub.textContent = fmtSub(b).slice(b.en.length + 3);
      elFacts.innerHTML = ''; liveEl = null;
      inf.f.forEach(function (r) {
        var d = document.createElement('div'); d.innerHTML = '<dt></dt><dd></dd>';
        d.firstChild.textContent = r[0];
        if (r[1] === '$AU') { liveEl = d.lastChild; liveEl.textContent = '—'; } else d.lastChild.textContent = r[1];
        elFacts.appendChild(d);
      });
      elFun.textContent = inf.fun;
      cam.goalDist = fitDist(b.def.fd); cam.minD = b.R * (b.ring ? 2.4 : 1.7);
      b.group.getWorldPosition(wp);
      var sx = -wp.x, sz = -wp.z;
      var th = Math.atan2(sx, sz);
      cam.thetaGoal = (id === 'sun') ? cam.theta : th + 0.75;
      cam.phiGoal = id === 'sun' ? 0.3 : 0.22; cam.aim = true;
      if (b.ring) {
        var nR = new V3(Math.sin(b.def.tilt * DEG), Math.cos(b.def.tilt * DEG), 0);
        var openness = function (t) { var c = new V3(Math.cos(0.5) * Math.sin(t), Math.sin(0.5), Math.cos(0.5) * Math.cos(t)); return Math.abs(c.dot(nR)); };
        cam.thetaGoal = openness(th + 0.75) >= openness(th - 0.75) ? th + 0.75 : th - 0.75;
        cam.phiGoal = 0.5;
      }
    }
    cam.offset.copy(prevTarget).sub(wp);
    var chip = chipMap[id];
    if (chip && chip.scrollIntoView) { try { chip.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); } catch (_) {} }
  }

  var uiState = { orbit: true, label: true, play: !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) };
  function toggleBtn(id, get, set) {
    var b = document.getElementById(id);
    b.setAttribute('aria-pressed', get() ? 'true' : 'false');
    b.addEventListener('click', function () { var v = !get(); set(v); b.setAttribute('aria-pressed', v ? 'true' : 'false'); });
  }
  if (window.innerWidth < 560) document.getElementById('info').classList.add('off');
  toggleBtn('bOrbit', function () { return uiState.orbit; }, function (v) { uiState.orbit = v; });
  toggleBtn('bLabel', function () { return uiState.label; }, function (v) { uiState.label = v; labelsEl.style.display = v ? '' : 'none'; });
  toggleBtn('bBelt', function () { return belt.visible; }, function (v) { belt.visible = v; });
  toggleBtn('bInfo', function () { return !document.getElementById('info').classList.contains('off'); }, function (v) { document.getElementById('info').classList.toggle('off', !v); });
  var bPlay = document.getElementById('bPlay');
  function syncPlay() { bPlay.setAttribute('aria-pressed', uiState.play ? 'false' : 'true'); bPlay.textContent = uiState.play ? '暫停' : '繼續'; }
  bPlay.addEventListener('click', function () { uiState.play = !uiState.play; syncPlay(); });
  syncPlay();
  document.getElementById('bNow').addEventListener('click', function () { simDays = 0; });

  /* collapsible UI: dock + header details */
  var bDock = document.getElementById('bDock'), dateMini = document.getElementById('dateMini');
  var CLEAN_KEY = 'solarUiClean';
  function setClean(on, save) {
    document.body.classList.toggle('clean', on);
    bDock.setAttribute('aria-expanded', on ? 'false' : 'true');
    bDock.textContent = on ? '展開介面 ▴' : '收合介面 ▾';
    if (save) { try { localStorage.setItem(CLEAN_KEY, on ? '1' : '0'); } catch (_) {} }
  }
  var savedClean = null;
  try { savedClean = localStorage.getItem(CLEAN_KEY); } catch (_) {}
  setClean(savedClean === '1', false);
  bDock.addEventListener('click', function () { setClean(!document.body.classList.contains('clean'), true); });
  document.addEventListener('click', function (e) { var b = e.target && e.target.closest ? e.target.closest('button') : null; if (b && e.detail > 0) b.blur(); });

  /* fullscreen (falls back to the collapsed view where the browser has no page fullscreen) */
  var bFull = document.getElementById('bFull'), toastEl = document.getElementById('toast'), toastT = 0, fsRoot = document.documentElement;
  function showToast(t) { toastEl.textContent = t; toastEl.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove('on'); }, 3200); }
  function fsActive() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  function syncFull() { var on = fsActive(); bFull.textContent = on ? '離開全螢幕' : '全螢幕'; bFull.setAttribute('aria-pressed', on ? 'true' : 'false'); }
  function fsFallback() { setClean(true, false); showToast('這個瀏覽器無法使用網頁全螢幕，已改為收合介面。'); }
  function toggleFull() {
    if (fsActive()) {
      var ex = document.exitFullscreen || document.webkitExitFullscreen;
      try { var r0 = ex.call(document); if (r0 && r0.catch) r0.catch(function () {}); } catch (_) {}
      return;
    }
    var req = fsRoot.requestFullscreen || fsRoot.webkitRequestFullscreen;
    if (!req || document.fullscreenEnabled === false) { fsFallback(); return; }
    try { var r = req.call(fsRoot); if (r && r.catch) r.catch(fsFallback); } catch (_) { fsFallback(); }
  }
  bFull.addEventListener('click', toggleFull);
  document.addEventListener('fullscreenchange', syncFull);
  document.addEventListener('webkitfullscreenchange', syncFull);
  syncFull();

  var SPEEDS = [1, 5, 20, 60, 200, 800];
  var speedIdx = 2;
  var speedEl = document.getElementById('speed'), speedOut = document.getElementById('speedOut');
  function showSpeed() { speedOut.textContent = SPEEDS[speedIdx] + ' 天 / 秒'; }
  speedEl.addEventListener('input', function () { speedIdx = +speedEl.value; showSpeed(); });
  showSpeed();
  var dateEl = document.getElementById('date');

  /* ---------- input ---------- */
  var pointers = new Map(), lastPinch = 0, dragging = false;
  var vel = new THREE.Vector2(), lastMove = 0;
  function rotateBy(dx, dy) {
    if (cam.free) {
      cam.tTheta -= dx * 0.0034;
      cam.tPhi = Math.max(-1.45, Math.min(1.45, cam.tPhi + dy * 0.0034));
      return;
    }
    cam.theta -= dx * 0.0034;
    cam.phi = Math.max(-1.45, Math.min(1.45, cam.phi + dy * 0.0034));
    cam.aim = false;
  }
  function startPointer(e, lbl) {
    if (e.pointerType === 'mouse') { if (e.button !== 0) return; pointers.clear(); }
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), lbl: lbl || null });
    dragging = true; vel.set(0, 0); lastPinch = 0; canvas.classList.add('drag');
  }
  function resetPointers() { pointers.clear(); lastPinch = 0; dragging = false; canvas.classList.remove('drag'); }
  canvas.addEventListener('pointerdown', function (e) { startPointer(e, null); });
  /* labels sit on top of the canvas: a drag that starts on one must still turn the view */
  labelsEl.addEventListener('pointerdown', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('.lbl') : null;
    if (!t) return;
    var id = null; Object.keys(labelMap).forEach(function (k) { if (labelMap[k] === t) id = k; });
    startPointer(e, id);
  });
  window.addEventListener('blur', resetPointers);
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); resetPointers(); });
  canvas.addEventListener('lostpointercapture', function (e) { if (pointers.has(e.pointerId)) endPointer(e); });
  canvas.addEventListener('pointermove', function (e) {
    var p = pointers.get(e.pointerId);
    if (!p) return;
    if (e.pointerType === 'mouse' && e.buttons === 0) { endPointer(e); return; }
    var dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pointers.size === 1) { rotateBy(dx, dy); vel.set(dx, dy); lastMove = performance.now(); }
    else if (pointers.size === 2) {
      var v = Array.from(pointers.values());
      var d = Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y);
      if (lastPinch > 0 && d > 0) cam.goalDist = clampDist(cam.goalDist * lastPinch / d);
      lastPinch = d;
    }
  });
  function endPointer(e) {
    pointers.delete(e.pointerId); lastPinch = 0;
    if (pointers.size === 0) { dragging = false; canvas.classList.remove('drag'); if (performance.now() - lastMove > 90) vel.set(0, 0); }
  }
  var lastTap = { t: 0, x: 0, y: 0 };
  var TAP_R = (window.matchMedia && matchMedia('(pointer: coarse)').matches) ? 30 : 18;
  function handleTap(cx, cy) {
    if (cam.free) return;
    var w = stage.clientWidth, h = stage.clientHeight;
    var fam = BODY[focusId] && BODY[focusId].isMoon ? BODY[focusId].parentId : focusId;
    var best = null, bs = 1e9;
    ORDER.forEach(function (it) {
      var id = it[0]; if (id === 'overview') return;
      var b = BODY[id];
      if (b.isMoon && fam !== famOf[id]) return;
      b.group.getWorldPosition(tmpW);
      var dist = camera.position.distanceTo(tmpW);
      proj.copy(tmpW).project(camera);
      if (proj.z > 1 || proj.z < -1) return;
      var sx = (proj.x * 0.5 + 0.5) * w, sy = (-proj.y * 0.5 + 0.5) * h;
      var rad = Math.max(b.R / (dist * FOV_TAN) * h / 2, TAP_R);
      var d = Math.hypot(cx - sx, cy - sy);
      if (d <= rad) { var sc = d / rad + dist * 1e-6; if (sc < bs) { bs = sc; best = id; } }
    });
    if (best) { setFocus(best); lastTap.t = 0; return; }
    var now = performance.now();
    if (now - lastTap.t < 380 && Math.hypot(cx - lastTap.x, cy - lastTap.y) < 30) { setFocus('overview'); lastTap.t = 0; }
    else { lastTap.t = now; lastTap.x = cx; lastTap.y = cy; }
  }
  canvas.addEventListener('pointerup', function (e) {
    var p = pointers.get(e.pointerId);
    if (p && pointers.size === 1 && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 7 && performance.now() - p.t < 450) {
      if (p.lbl) setFocus(p.lbl); else handleTap(e.clientX, e.clientY);
    }
    endPointer(e);
  });
  canvas.addEventListener('pointercancel', endPointer);
  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var ae = document.activeElement, tag = ae ? ae.tagName : '', k = e.key;
    if (tag === 'INPUT' && k.indexOf('Arrow') === 0) return;
    if (k === 'ArrowRight' || k === 'ArrowLeft') {
      var i = 0; ORDER.forEach(function (it, n) { if (it[0] === focusId) i = n; });
      i = (i + (k === 'ArrowRight' ? 1 : ORDER.length - 1)) % ORDER.length;
      setFocus(ORDER[i][0]); e.preventDefault();
    } else if (e.code === 'Space') { if (tag === 'BUTTON' || tag === 'INPUT') return; e.preventDefault(); bPlay.click(); }
    else if (k === 'h' || k === 'H') bDock.click();
    else if (k === 'f' || k === 'F') toggleFull();
    else if (k === 'o' || k === 'O') document.getElementById('bOrbit').click();
    else if (k === 'l' || k === 'L') document.getElementById('bLabel').click();
    else if (k === '0' || k === 'Home' || k === 'Escape') setFocus('overview');
    else if (k === '+' || k === '=') cam.goalDist = clampDist(cam.goalDist * 0.8);
    else if (k === '-' || k === '_') cam.goalDist = clampDist(cam.goalDist * 1.25);
  });
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    if (cam.free) { flyDirLocal(flyF, cam.theta, cam.phi).applyQuaternion(flyQ); flyV.addScaledVector(flyF, -Math.max(-120, Math.min(120, e.deltaY)) * 0.012 * FLY_K * SPEEDS[speedIdx]); return; }
    cam.goalDist = clampDist(cam.goalDist * Math.exp(e.deltaY * 0.0013));
  }, { passive: false });


  /* ---------- free flight: W/A/S/D move, Q/E down/up, Shift boost, drag to look ---------- */
  var FLY_K = 0.15; /* scene units per second for each 'day / second' of the time-flow setting */
  var FLYKEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE'];
  var fk = {}, flyF = new V3(), flyR = new V3(), flyW = new V3(), flyUp = new V3(0, 1, 0), flyV = new V3(), flyWant = new V3();
  var fly = { alt: 10, near: '', fam: '', speed: 0 };
  var flyHud = document.createElement('div'); flyHud.id = 'flyHud'; document.body.appendChild(flyHud);
  (function () {
    var st = document.createElement('style');
    st.textContent = '#flyHud{position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:6;padding:7px 14px;border-radius:16px;white-space:pre-wrap;overflow-wrap:anywhere;text-align:center;line-height:1.55;max-width:min(520px,calc(100vw - 640px));background:rgba(6,12,22,.72);border:1px solid rgba(127,227,255,.45);color:#cfe9ff;font:12px/1.4 "IBM Plex Mono",monospace;letter-spacing:.04em;line-height:1.55;pointer-events:none;opacity:0;transition:opacity .25s;text-shadow:0 1px 3px #000}body.flying #flyHud{opacity:1}@media (max-width:700px){#flyHud{top:auto;bottom:130px;font-size:11px;max-width:94vw;overflow:hidden;text-overflow:ellipsis}}';
    document.head.appendChild(st);
    var hint = document.getElementById('hint'); if (hint) hint.textContent += '　WASD 自由飛行（Q/E 下降/上升，Shift 加速，X 精細，Z 極細）';
  })();
  function flyDir(out) { var cp = Math.cos(cam.phi); return out.set(-cp * Math.sin(cam.theta), -Math.sin(cam.phi), -cp * Math.cos(cam.theta)); }
  var flyQ = new THREE.Quaternion(), flyQ2 = new THREE.Quaternion(), flyU = new V3(), flyPU = new V3(), flyA = new V3(), flyC = new V3(), flyL = new V3();
  fly.surf = false; fly.lock = null; fly.boost = 1; fly.fine = 1;
  function flyDirLocal(out, th, ph) { var cp = Math.cos(ph); return out.set(-cp * Math.sin(th), -Math.sin(ph), -cp * Math.cos(th)); }
  function flyAnglesFromWorld(f, q) { /* local angles of world forward f in frame q */
    flyL.copy(f).applyQuaternion(flyQ2.copy(q).invert());
    return { th: Math.atan2(-flyL.x, -flyL.z), ph: Math.asin(Math.max(-1, Math.min(1, -flyL.y))) };
  }
  function setFlyFrame(q) { /* switch the reference frame without turning the view */
    flyDirLocal(flyF, cam.theta, cam.phi).applyQuaternion(flyQ);
    var dT = cam.tTheta - cam.theta, dP = cam.tPhi - cam.phi;
    var an = flyAnglesFromWorld(flyF, q);
    cam.theta = an.th; cam.phi = an.ph; cam.tTheta = an.th + dT; cam.tPhi = an.ph + dP;
    flyQ.copy(q);
  }
  function enterFly() {
    if (cam.free) return;
    cam.pos.copy(camera.position); cam.free = true; cam.aim = false; cam.dist = cam.goalDist = 1; flyV.set(0, 0, 0);
    fly.surf = false; fly.lock = null; flyQ.identity(); cam.tTheta = cam.theta; cam.tPhi = cam.phi; vel.set(0, 0);
    document.body.classList.add('flying');
  }
  function exitFly() { cam.free = false; flyV.set(0, 0, 0); fly.surf = false; fly.lock = null; flyQ.identity(); camera.up.set(0, 1, 0); document.body.classList.remove('flying'); }
  function updateFly(dt) {
    cam.dist = cam.goalDist = 1; vel.set(0, 0);
    /* smooth look: the pointer moves a target, the view eases toward it */
    var kl = 1 - Math.exp(-dt * 22);
    cam.theta += (cam.tTheta - cam.theta) * kl; cam.phi += (cam.tPhi - cam.phi) * kl;
    /* ride along with the body we are close to (it moves/spins fast at high time-flow) */
    var lk = fly.lock;
    if (lk) {
      var lb = BODY[lk.id]; lb.group.getWorldPosition(flyW);
      cam.pos.add(flyL.copy(flyW).sub(lk.pos)); lk.pos.copy(flyW);
      if (fly.surf && !lb.isMoon) {
        var dr = lb.mesh.rotation.y - lk.rot;
        if (dr) { lb.tilt.getWorldQuaternion(tmpQ); flyA.set(0, 1, 0).applyQuaternion(tmpQ); flyQ2.setFromAxisAngle(flyA, dr); cam.pos.sub(flyW).applyQuaternion(flyQ2).add(flyW); flyQ.premultiply(flyQ2); flyV.applyQuaternion(flyQ2); }
      }
      lk.rot = lb.mesh.rotation.y;
    }
    /* local "up": the planet's radial direction when low, otherwise world up */
    if (fly.surf && lk) {
      BODY[lk.id].group.getWorldPosition(flyW); flyU.copy(cam.pos).sub(flyW).normalize();
      flyPU.copy(flyUp).applyQuaternion(flyQ);
      flyQ2.setFromUnitVectors(flyPU, flyU); flyQ.premultiply(flyQ2);
    } else flyU.set(0, 1, 0);
    flyDirLocal(flyF, cam.theta, cam.phi).applyQuaternion(flyQ);
    flyR.crossVectors(flyF, flyU); if (flyR.lengthSq() < 1e-8) flyR.set(1, 0, 0); flyR.normalize();
    var base = FLY_K * SPEEDS[speedIdx];
    var wantBoost = (fk.ShiftLeft || fk.ShiftRight) ? 4 : 1, wantFine = fk.KeyX ? 0.02 : (fk.KeyZ ? 0.001 : 1);
    fly.boost += (wantBoost - fly.boost) * (1 - Math.exp(-dt * 6)); fly.fine += (wantFine - fly.fine) * (1 - Math.exp(-dt * 10));
    var fw = (fk.KeyW ? 1 : 0) - (fk.KeyS ? 1 : 0), sd = (fk.KeyD ? 1 : 0) - (fk.KeyA ? 1 : 0), ud = (fk.KeyE ? 1 : 0) - (fk.KeyQ ? 1 : 0);
    flyWant.set(0, 0, 0).addScaledVector(flyF, fw).addScaledVector(flyR, sd).addScaledVector(flyU, ud);
    var moving = flyWant.lengthSq() > 0;
    if (moving) flyWant.normalize().multiplyScalar(base * fly.boost * fly.fine);
    /* ease in gently, brake a little faster than we accelerate */
    flyV.lerp(flyWant, 1 - Math.exp(-dt * (moving ? 3.2 : 6))); fly.speed = flyV.length();
    if (fly.speed < base * 1e-4 && !moving) flyV.set(0, 0, 0);
    cam.pos.addScaledVector(flyV, dt);
    /* nearest body + keep out of bodies and inside the sky sphere */
    var alt = 1e9, near = null;
    ORDER.forEach(function (it) {
      var id = it[0]; if (id === 'overview') return; var b = BODY[id]; b.group.getWorldPosition(flyW);
      var rr = b.R * (b.ring ? 1.12 : 1.06) + 0.02;
      if (b.def && b.def.earth) rr = b.R + groundFloor(flyW) + 2e-5;
      var d = cam.pos.distanceTo(flyW);
      if (d < rr) { cam.pos.sub(flyW).setLength(rr).add(flyW); flyV.multiplyScalar(0.3); d = rr; }
      d -= b.R; if (d < alt) { alt = d; near = id; }
    });
    fly.alt = alt; fly.near = near; var nb = near ? BODY[near] : null; fly.fam = nb ? (nb.isMoon ? nb.parentId : near) : '';
    /* lock bookkeeping for the next frame */
    var wantLock = nb && !nb.isSun && alt < nb.R * 2.5;
    if (wantLock) { if (!fly.lock || fly.lock.id !== near) { nb.group.getWorldPosition(flyW); fly.lock = { id: near, pos: flyW.clone(), rot: nb.mesh.rotation.y }; } }
    else fly.lock = null;
    var wantSurf = !!(fly.lock && !nb.isMoon && alt < nb.R * (fly.surf ? 0.7 : 0.5));
    if (wantSurf !== fly.surf) {
      fly.surf = wantSurf;
      if (wantSurf) { nb.group.getWorldPosition(flyW); flyU.copy(cam.pos).sub(flyW).normalize(); flyQ2.setFromUnitVectors(flyUp, flyU); setFlyFrame(flyQ2.clone()); }
      else setFlyFrame(flyQ2.identity().clone());
    }
    if (cam.pos.length() > 2200) cam.pos.setLength(2200);
    flyDirLocal(flyF, cam.theta, cam.phi).applyQuaternion(flyQ);
    if (fly.surf) { BODY[near].group.getWorldPosition(flyW); flyU.copy(cam.pos).sub(flyW).normalize(); camera.up.copy(flyU); } else camera.up.set(0, 1, 0);
    cam.target.copy(cam.pos).add(flyF);
    camera.position.copy(cam.pos); camera.lookAt(cam.target); sky.position.copy(camera.position);
    var nm = nb ? nb.name : '';
    var spd = fly.fine < 0.5 ? (fly.fine < 0.01 ? '　〔極細〕' : '　〔精細〕') : '';
    flyHud.textContent = '自由飛行　速度 ' + fly.speed.toFixed(fly.speed < 0.1 ? 4 : 1) + ' 單位/秒（時間流速 ' + SPEEDS[speedIdx] + ' 天/秒）' + spd + '　' + (nm ? '最近：' + nm + '　距表面 ' + (alt * 9800 < 10000 ? Math.round(Math.max(0, alt) * 9800) + ' km' : Math.max(0, alt).toFixed(2)) : '') + '　　Esc 返回' + (GROUND.active ? GROUND.info : '');
  }
  var groundFloorFn = null;
  function groundFloor(wp) { return groundFloorFn ? groundFloorFn(wp) : 0; }
  function typingTarget(e) { var t = e.target && e.target.tagName; return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT'; }
  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey || typingTarget(e)) return;
    if (FLYKEYS.indexOf(e.code) >= 0) { fk[e.code] = true; enterFly(); e.preventDefault(); }
    else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyX' || e.code === 'KeyZ') fk[e.code] = true;
  });
  document.addEventListener('keyup', function (e) { fk[e.code] = false; });
  window.addEventListener('blur', function () { fk = {}; });

  /* ---------- Earth surface layer: streamed imagery + terrain tiles, borders, place names ----------
     No API keys. Sources (change here if you prefer others):
       imagery : Esri World Imagery tiles          (attribution shown on screen)
       terrain : AWS Open Data "Terrain Tiles" (Terrarium PNG, elevation encoded in RGB)
       borders / names : Natural Earth via raw.githubusercontent.com                                */
  var GROUND = {
    enabled: true,
    imgUrl: function (z, x, y) { return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/' + z + '/' + y + '/' + x; },
    elevUrl: function (z, x, y) { return 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/' + z + '/' + x + '/' + y + '.png'; },
    countriesUrl: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson',
    placesUrl: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_populated_places_simple.geojson',
    maxZ: 15, exag: 8, activeAlt: 0.12,
    active: false, shift: false, alt: 1e9, info: '', ready: 0, loading: 0, errors: 0
  };
  var ground = (function () {
    var EB = BODY.earth, ER = EB.R, EM = EB.mesh, GRP = new THREE.Group();
    EM.add(GRP);
    var M_PER_U = 6371000 / ER;                       /* metres per scene unit */
    var HK = GROUND.exag / M_PER_U;                   /* elevation metres -> scene units (exaggerated) */
    var tiles = new Map(), queue = [], inflight = 0, MAXFLIGHT = 10, MAXCACHE = 220, tickN = 0;
    var inv = new THREE.Matrix4(), frus = new THREE.Frustum(), pv = new THREE.Matrix4(), sph = new THREE.Sphere();
    var camL = new V3(), camDirL = new V3(), tmpA = new V3(), tmpB = new V3(), sunW = new V3();
    var GEO = null, PLACES = null, geoState = 0;
    var lastProj = { n: 0.03, f: 3000 };

    function tx2lon(x, z) { return x / Math.pow(2, z) * 360 - 180; }
    function ty2lat(y, z) { var n = Math.PI - 2 * Math.PI * y / Math.pow(2, z); return Math.atan(Math.sinh(n)) / DEG; }
    function lat2ty(lat, z) { var r = lat * DEG; return (1 - Math.log(Math.tan(Math.PI / 4 + r / 2)) / Math.PI) / 2 * Math.pow(2, z); }
    function llToLocal(lat, lon, r, out) { var la = lat * DEG, lo = lon * DEG, c = Math.cos(la); return out.set(c * Math.cos(lo), Math.sin(la), -c * Math.sin(lo)).multiplyScalar(r); }
    function key(z, x, y) { return z + '/' + x + '/' + y; }

    /* ---- tile shader ---- */
    var TVS = [
      'varying vec2 vUv; varying vec3 vN; varying float vD;',
      'void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normalize(position));',
      '  vec4 w = modelMatrix * vec4(position, 1.0); vec4 mv = viewMatrix * w; vD = length(mv.xyz);',
      '  gl_Position = projectionMatrix * mv; }'
    ].join('\n');
    var TFS = [
      'uniform sampler2D map; uniform vec3 sunDir; uniform vec3 fogC; uniform float fogK;',
      'varying vec2 vUv; varying vec3 vN; varying float vD;',
      'void main(){',
      '  float ndl = dot(normalize(vN), sunDir);',
      '  float l = smoothstep(-0.10, 0.28, ndl);',
      '  vec3 c = texture2D(map, vUv).rgb;',
      '  vec3 warm = mix(vec3(1.0, 0.66, 0.46), vec3(1.0), smoothstep(0.0, 0.35, ndl));',
      '  c = c * warm * (0.06 + 0.94 * l);',
      '  float f = 1.0 - exp(-vD * fogK);',
      '  gl_FragColor = vec4(mix(c, fogC, f), 1.0); }'
    ].join('\n');
    var U = { sunDir: EB.sunU, fogC: { value: new V3(0.4, 0.6, 0.95) }, fogK: { value: 0 } };

    /* ---- tiles ---- */
    function mkTile(z, x, y) {
      var t = { z: z, x: x, y: y, k: key(z, x, y), state: 0, img: null, elev: null, mesh: null, used: 0, vis: false };
      var lat0 = ty2lat(y + 0.5, z), lon0 = tx2lon(x + 0.5, z);
      t.c = llToLocal(lat0, lon0, ER, new V3());
      t.dir = t.c.clone().normalize();
      var la1 = ty2lat(y, z), la2 = ty2lat(y + 1, z), lo1 = tx2lon(x, z), lo2 = tx2lon(x + 1, z);
      t.bb = { la1: Math.min(la1, la2), la2: Math.max(la1, la2), lo1: lo1, lo2: lo2 };
      var rad = 0; [[la1, lo1], [la1, lo2], [la2, lo1], [la2, lo2]].forEach(function (q) { rad = Math.max(rad, llToLocal(q[0], q[1], ER, tmpA).distanceTo(t.c)); });
      t.size = rad * 1.4;                           /* ~ edge length */
      t.rad = rad + Math.min(0.0075, rad * 0.6);
      t.ang = z < 3 ? Math.PI : Math.acos(Math.min(1, 1 - rad * rad / (2 * ER * ER)));
      tiles.set(t.k, t); return t;
    }
    function getTile(z, x, y) { return tiles.get(key(z, x, y)) || mkTile(z, x, y); }
    function request(t, pri) {
      if (t.state !== 0) return;
      t.state = 1; t.pri = pri; queue.push(t);
    }
    function loadImg(url, cb) {
      var im = new Image(); im.crossOrigin = 'anonymous';
      im.onload = function () { cb(im); }; im.onerror = function () { cb(null); };
      im.src = url;
    }
    function pump() {
      while (inflight < MAXFLIGHT && queue.length) {
        queue.sort(function (a, b) { return a.pri - b.pri; });
        var t = queue.shift(); if (t.state !== 1) continue;
        t.state = 2; inflight++; GROUND.loading = inflight + queue.length;
        (function (t) {
          var got = 0, imgR = null, elR = null;
          function done() {
            if (++got < 2) return;
            inflight--; GROUND.loading = inflight + queue.length;
            if (!imgR) { t.state = 9; GROUND.errors++; return; }
            t.img = imgR; buildTile(t, elR); t.state = 3; GROUND.ready++;
          }
          loadImg(GROUND.imgUrl(t.z, t.x, t.y), function (im) { imgR = im; done(); });
          loadImg(GROUND.elevUrl(t.z, t.x, t.y), function (im) { elR = im; done(); });
        })(t);
      }
    }
    var ecv = document.createElement('canvas'); ecv.width = ecv.height = 256;
    var ectx = ecv.getContext('2d', { willReadFrequently: true });
    function buildTile(t, elImg) {
      var N = t.z < 7 ? 10 : (t.z < 11 ? 18 : 26), px = null;
      if (elImg) { try { ectx.drawImage(elImg, 0, 0, 256, 256); px = ectx.getImageData(0, 0, 256, 256).data; } catch (e) { px = null; } }
      function h(u, v) {
        if (!px) return 0;
        var fx = Math.min(254.999, u * 255), fy = Math.min(254.999, v * 255), x0 = fx | 0, y0 = fy | 0, ax = fx - x0, ay = fy - y0;
        function H(xx, yy) { var i = (yy * 256 + xx) * 4; return px[i] * 256 + px[i + 1] + px[i + 2] / 256 - 32768; }
        var v0 = H(x0, y0) * (1 - ax) + H(x0 + 1, y0) * ax, v1 = H(x0, y0 + 1) * (1 - ax) + H(x0 + 1, y0 + 1) * ax;
        return Math.max(0, v0 * (1 - ay) + v1 * ay);
      }
      var W = N + 1, nv = W * W + 4 * W, pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), hh = new Float32Array(W * W), idx = [];
      var skirt = t.size * 0.006, p = new V3();
      for (var j = 0; j <= N; j++) for (var i = 0; i <= N; i++) {
        var u = i / N, v = j / N, k = j * W + i;
        var lat = ty2lat(t.y + v, t.z), lon = tx2lon(t.x + u, t.z), he = h(u, v) * HK; hh[k] = he;
        llToLocal(lat, lon, ER + he, p); pos[k * 3] = p.x; pos[k * 3 + 1] = p.y; pos[k * 3 + 2] = p.z; uv[k * 2] = u; uv[k * 2 + 1] = 1 - v;
      }
      for (j = 0; j < N; j++) for (i = 0; i < N; i++) { var a = j * W + i, b = a + 1, c = a + W, d = c + 1; idx.push(a, c, b, b, c, d); }
      /* skirts hide cracks between tiles of different detail */
      var edges = []; for (i = 0; i <= N; i++) edges.push([i, 0], [i, N]); for (j = 0; j <= N; j++) edges.push([0, j], [N, j]);
      var base = W * W, sk = [];
      edges.forEach(function (e, n) {
        var k = e[1] * W + e[0], s = base + n; p.set(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]); p.multiplyScalar(1 - skirt / p.length());
        pos[s * 3] = p.x; pos[s * 3 + 1] = p.y; pos[s * 3 + 2] = p.z; uv[s * 2] = uv[k * 2]; uv[s * 2 + 1] = uv[k * 2 + 1]; sk.push(k, s);
      });
      for (i = 0; i < N; i++) { /* bottom (j=N) & top (j=0) strips, then left & right */
        var q = function (e0, e1) { var k0 = sk[e0 * 2], s0 = sk[e0 * 2 + 1], k1 = sk[e1 * 2], s1 = sk[e1 * 2 + 1]; idx.push(k0, s0, k1, k1, s0, s1, k0, k1, s0, s0, k1, s1); };
        q(2 * i, 2 * (i + 1)); q(2 * i + 1, 2 * (i + 1) + 1);
      }
      for (j = 0; j < N; j++) { var o = 2 * W; q2(o + 2 * j, o + 2 * (j + 1)); q2(o + 2 * j + 1, o + 2 * (j + 1) + 1); }
      function q2(e0, e1) { var k0 = sk[e0 * 2], s0 = sk[e0 * 2 + 1], k1 = sk[e1 * 2], s1 = sk[e1 * 2 + 1]; idx.push(k0, s0, k1, k1, s0, s1, k0, k1, s0, s0, k1, s1); }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
      g.computeBoundingSphere(); g.boundingSphere.radius += 0.01;
      t.N = N; t.hh = hh;
      t.cv = document.createElement('canvas'); t.cv.width = t.cv.height = 256;
      t.tex = new THREE.CanvasTexture(t.cv); t.tex.anisotropy = 4; t.tex.minFilter = THREE.LinearMipmapLinearFilter;
      paintTile(t);
      var mat = new THREE.ShaderMaterial({ uniforms: { map: { value: t.tex }, sunDir: U.sunDir, fogC: U.fogC, fogK: U.fogK }, vertexShader: TVS, fragmentShader: TFS, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -(t.z * 3 + 4) });
      t.mesh = new THREE.Mesh(g, mat); t.mesh.frustumCulled = false; t.mesh.visible = false; t.mesh.renderOrder = 1;
      GRP.add(t.mesh);
    }
    function paintTile(t) {
      var c = t.cv.getContext('2d'); c.drawImage(t.img, 0, 0, 256, 256);
      if (GEO && t.z >= 2) drawBorders(c, t);
      t.tex.needsUpdate = true;
    }
    function drawBorders(c, t) {
      var b = t.bb, padLon = (b.lo2 - b.lo1) * 0.05, padLat = (b.la2 - b.la1) * 0.05;
      var L1 = b.lo1 - padLon, L2 = b.lo2 + padLon, A1 = b.la1 - padLat, A2 = b.la2 + padLat, n2 = Math.pow(2, t.z);
      var sx = 256 / (b.lo2 - b.lo1);
      function PX(lo) { return (lo - b.lo1) * sx; } function PY(la) { return (lat2ty(la, t.z) - t.y) * 256; }
      c.lineJoin = 'round'; c.lineCap = 'round';
      [[3.2, 'rgba(0,0,0,0.35)'], [1.4, 'rgba(255,214,110,0.95)']].forEach(function (st) {
        c.lineWidth = st[0]; c.strokeStyle = st[1]; c.beginPath();
        for (var r = 0; r < GEO.rings.length; r++) {
          var R = GEO.rings[r]; if (R.mx < L1 || R.nx > L2 || R.my < A1 || R.ny > A2) continue;
          var P = R.p, pen = false;
          for (var i = 0; i < P.length - 2; i += 2) {
            var x0 = P[i], y0 = P[i + 1], x1 = P[i + 2], y1 = P[i + 3];
            if ((x0 < L1 && x1 < L1) || (x0 > L2 && x1 > L2) || (y0 < A1 && y1 < A1) || (y0 > A2 && y1 > A2)) { pen = false; continue; }
            if (!pen) c.moveTo(PX(x0), PY(y0)); c.lineTo(PX(x1), PY(y1)); pen = true;
          }
        }
        c.stroke();
      });
    }
    function disposeTile(t) {
      if (t.mesh) { GRP.remove(t.mesh); t.mesh.geometry.dispose(); t.mesh.material.dispose(); }
      if (t.tex) t.tex.dispose(); tiles.delete(t.k); GROUND.ready = Math.max(0, GROUND.ready - 1);
    }

    /* ---- selection ---- */
    var want = [];
    var horizonAng = 1;
    /* build the visible quadtree; every node knows its children, culled children are dropped */
    function visit(z, x, y) {
      var t = getTile(z, x, y);
      var ang = Math.acos(Math.max(-1, Math.min(1, camDirL.dot(t.dir))));
      if (ang > horizonAng + t.ang) return null;
      sph.center.copy(t.c).applyMatrix4(EM.matrixWorld); sph.radius = t.rad;
      if (!frus.intersectsSphere(sph)) return null;
      var node = { t: t, kids: null }, d = camL.distanceTo(t.c); t.used = tickN; t.d = d;
      if (z < GROUND.maxZ && (z < 2 || d < t.size * 1.9)) {
        var x2 = x * 2, y2 = y * 2, ks = [visit(z + 1, x2, y2), visit(z + 1, x2 + 1, y2), visit(z + 1, x2, y2 + 1), visit(z + 1, x2 + 1, y2 + 1)];
        node.kids = ks.filter(function (k) { return k; });
      }
      return node;
    }
    /* choose tiles so that they partition the surface: children replace their parent only when all of them are ready */
    function resolve(n, out) {
      var t = n.t;
      if (t.state === 0) request(t, t.d + (t.z < 3 ? -10 : 0) - (n.kids ? 0.5 : 0) * 0);
      if (n.kids && n.kids.length) {
        var tmp = [], ok = true;
        for (var i = 0; i < n.kids.length; i++) { if (!resolve(n.kids[i], tmp)) ok = false; }
        if (ok) { for (i = 0; i < tmp.length; i++) out.push(tmp[i]); return true; }
      }
      if (t.state === 3) { out.push(t); return true; }
      return false;
    }
    function select() {
      var root = visit(0, 0, 0), show = new Set(), list = [], now = tickN;
      if (root) resolve(root, list);
      list.forEach(function (t) { show.add(t); });
      tiles.forEach(function (t) { if (t.mesh) { var v = show.has(t); if (t.mesh.visible !== v) t.mesh.visible = v; t.vis = v; } });
      GROUND.shown = show.size;
      if (tiles.size > MAXCACHE) {
        var arr = []; tiles.forEach(function (t) { if (t.state === 3 || t.state === 9) arr.push(t); });
        arr.sort(function (a, b) { return a.used - b.used; });
        for (var i = 0; i < arr.length && tiles.size > MAXCACHE * 0.8; i++) if (arr[i].used < now - 30) disposeTile(arr[i]);
      }
      pump();
    }

    /* ---- Natural Earth borders and names ---- */
    function loadGeo() {
      if (geoState) return; geoState = 1;
      fetch(GROUND.countriesUrl).then(function (r) { return r.json(); }).then(function (j) {
        var rings = [], labels = [];
        j.features.forEach(function (f) {
          var g = f.geometry, pr = f.properties || {}; if (!g) return;
          var polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
          polys.forEach(function (poly) { poly.forEach(function (ring) {
            var p = [], nx = 1e9, mx = -1e9, ny = 1e9, my = -1e9;
            ring.forEach(function (q) { p.push(q[0], q[1]); nx = Math.min(nx, q[0]); mx = Math.max(mx, q[0]); ny = Math.min(ny, q[1]); my = Math.max(my, q[1]); });
            rings.push({ p: p, nx: nx, mx: mx, ny: ny, my: my });
          }); });
          var lx = pr.LABEL_X, ly = pr.LABEL_Y; if (lx == null || ly == null) return;
          labels.push({ t: pr.NAME_ZH || pr.NAME || pr.ADMIN, e: pr.NAME || '', lat: ly, lon: lx, r: pr.LABELRANK == null ? 6 : pr.LABELRANK, kind: 'c' });
        });
        GEO = { rings: rings, labels: labels };
        tiles.forEach(function (t) { if (t.state === 3) paintTile(t); });
      }).catch(function () { geoState = 0; GROUND.errors++; });
      fetch(GROUND.placesUrl).then(function (r) { return r.json(); }).then(function (j) {
        PLACES = j.features.map(function (f) { var pr = f.properties || {}; return { t: pr.name || pr.nameascii, lat: pr.latitude != null ? pr.latitude : f.geometry.coordinates[1], lon: pr.longitude != null ? pr.longitude : f.geometry.coordinates[0], pop: pr.pop_max || 0, kind: 'p' }; })
          .filter(function (q) { return q.t; }).sort(function (a, b) { return b.pop - a.pop; });
      }).catch(function () {});
    }

    /* ---- labels (DOM pool) ---- */
    var lbEl = document.createElement('div'); lbEl.id = 'gLabels'; document.body.appendChild(lbEl);
    var pool = [], POOL = 46;
    for (var pi = 0; pi < POOL; pi++) { var d = document.createElement('div'); d.className = 'gl'; d.style.display = 'none'; lbEl.appendChild(d); pool.push(d); }
    var attr = document.createElement('div'); attr.id = 'gAttr'; attr.style.display = 'none';
    attr.textContent = '影像 © Esri, Maxar, Earthstar Geographics 等　地形 AWS Terrain Tiles（Mapzen / SRTM / NASADEM 等）　國界與地名 Natural Earth　地形高度為 ' + GROUND.exag + ' 倍誇大';
    document.body.appendChild(attr);
    var gst = document.createElement('style');
    gst.textContent = '#gLabels{position:fixed;inset:0;z-index:2;pointer-events:none;overflow:hidden}#gLabels .gl{position:absolute;left:0;top:0;white-space:nowrap;color:#fff;font:600 12px/1 "Noto Sans TC",system-ui,sans-serif;text-shadow:0 0 3px #000,0 0 6px #000,0 1px 2px #000;transform-origin:0 0}#gLabels .gl.c{color:#ffe9a8;letter-spacing:.12em;font-weight:700}#gLabels .gl.p::before{content:"";display:inline-block;width:5px;height:5px;margin-right:5px;border-radius:50%;background:#fff;box-shadow:0 0 3px #000;vertical-align:1px}#gAttr{position:fixed;left:8px;bottom:4px;z-index:3;max-width:min(92vw,720px);font-size:10px;color:rgba(220,230,245,.7);text-shadow:0 0 3px #000;pointer-events:none}';
    document.head.appendChild(gst);
    var lp = new V3(), lw = new V3(), lq = new V3(), eW = new V3(), cD = new V3(), used = [];
    function labels(alt) {
      var shown = 0, w = stage.clientWidth, h = stage.clientHeight;
      function place(q, cls, text, fs) {
        if (shown >= POOL) return false;
        llToLocal(q.lat, q.lon, ER, lp); lw.copy(lp).applyMatrix4(EM.matrixWorld);
        lq.copy(lw).sub(eW).normalize();
        var cs = lq.dot(cD); if (cs < horizonCosW) return false;
        lw.project(camera); if (lw.z > 1 || lw.z < -1 || Math.abs(lw.x) > 1.05 || Math.abs(lw.y) > 1.05) return false;
        var sx = (lw.x * 0.5 + 0.5) * w, sy = (-lw.y * 0.5 + 0.5) * h;
        for (var i = 0; i < used.length; i++) { if (Math.abs(used[i][0] - sx) < used[i][2] + text.length * fs * 0.5 && Math.abs(used[i][1] - sy) < fs * 1.5) return false; }
        used.push([sx, sy, text.length * fs * 0.5]);
        var el = pool[shown++]; el.style.display = ''; el.className = 'gl ' + cls; el.textContent = text; el.style.fontSize = fs + 'px';
        el.style.transform = 'translate(' + (sx + 6).toFixed(0) + 'px,' + (sy - fs / 2).toFixed(0) + 'px)';
        return true;
      }
      used.length = 0;
      EB.group.getWorldPosition(eW); cD.copy(camera.position).sub(eW); var cdist = cD.length(); cD.normalize();
      var horizonCosW = ER / Math.max(ER * 1.0001, cdist) - 0.01;
      if (GEO && alt > 0.012 && alt < 0.5) {
        var fs = alt > 0.15 ? 15 : 17, lim = alt > 0.15 ? 5 : 8;
        GEO.labels.slice().sort(function (a, b) { return a.r - b.r; }).forEach(function (q) { if (q.r <= lim) place(q, 'c', q.t, fs + (q.r < 3 ? 3 : 0)); });
      }
      if (PLACES && alt < 0.06) {
        var cnt = 0, minPop = alt > 0.03 ? 3e6 : (alt > 0.012 ? 8e5 : (alt > 0.004 ? 1e5 : 0));
        for (var i = 0; i < PLACES.length && cnt < 34; i++) { var q = PLACES[i]; if (q.pop < minPop) break; if (place(q, 'p', q.t, 12)) cnt++; }
      }
      for (var k = shown; k < POOL; k++) if (pool[k].style.display !== 'none') pool[k].style.display = 'none';
    }

    /* ---- per-frame ---- */
    var skyDay = new V3(0.36, 0.60, 0.96), skyNight = new V3(0.0, 0.0, 0.012), skyDusk = new V3(0.95, 0.52, 0.30), clearC = new THREE.Color();
    function smooth(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
    function update(dt) {
      tickN++;
      EB.group.getWorldPosition(tmpB); var dist = camera.position.distanceTo(tmpB), alt = dist - ER;
      GROUND.alt = alt;
      var act = GROUND.enabled && alt < GROUND.activeAlt;
      if (act !== GROUND.active) {
        GROUND.active = act; GRP.visible = act; attr.style.display = act ? 'block' : 'none';
        if (!act) { lbEl.style.display = 'none'; resetProj(); sky.visible = true; renderer.setClearColor(0x000000, 1); EB.atmo && (EB.atmo.visible = true); GROUND.shift = false; groundFloorFn = null; GROUND.info = ''; return; }
        lbEl.style.display = ''; loadGeo(); groundFloorFn = floorAt;
      }
      if (!act) return;
      /* camera in Earth-local space */
      EM.updateWorldMatrix(true, false); inv.copy(EM.matrixWorld).invert();
      camL.copy(camera.position).applyMatrix4(inv); camDirL.copy(camL).normalize();
      var cd = camL.length(); horizonAng = Math.acos(Math.min(1, ER / Math.max(cd, ER)));
      camera.updateMatrixWorld(true); pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frus.setFromProjectionMatrix(pv);
      if (tickN % 5 === 1) select();
      /* depth range follows altitude */
      var n = Math.max(4e-6, Math.min(0.03, alt * 0.35)), f = alt < 0.5 ? 40 : 3000;
      if (Math.abs(n - lastProj.n) > lastProj.n * 0.05 || f !== lastProj.f) { camera.near = n; camera.far = f; camera.updateProjectionMatrix(); lastProj.n = n; lastProj.f = f; }
      GROUND.shift = true;
      /* sky / haze */
      EB.group.getWorldPosition(tmpB); tmpA.copy(camera.position).sub(tmpB).normalize();
      var sunUp = tmpA.dot(EB.sunU.value), day = smooth(-0.12, 0.2, sunUp), atm = 1 - smooth(0.004, 0.025, alt);
      var dusk = (1 - Math.abs(sunUp) * 5 > 0 ? 1 - Math.min(1, Math.abs(sunUp) * 5) : 0) * 0.6;
      U.fogC.value.copy(skyNight).lerp(skyDay, day).lerp(skyDusk, dusk * day);
      U.fogK.value = atm * 38 + (1 - atm) * 0;
      clearC.setRGB(skyNight.x, skyNight.y, skyNight.z).lerp(new THREE.Color(U.fogC.value.x, U.fogC.value.y, U.fogC.value.z), atm);
      renderer.setClearColor(clearC, 1);
      sky.visible = atm * day < 0.45;
      if (EB.atmo) { var ak = smooth(0.02, 0.06, alt); EB.atmo.visible = ak > 0.01; EB.atmo.material.uniforms.k.value = EB.def.atmo.k * ak; }
      /* labels + readout */
      if (tickN % 3 === 0) labels(alt);
      var ll = latLonOf(camL);
      var hGround = floorAt(camera.position) / HK;
      GROUND.info = '\n緯度 ' + Math.abs(ll[0]).toFixed(2) + '°' + (ll[0] >= 0 ? 'N' : 'S') + ' 經度 ' + Math.abs(ll[1]).toFixed(2) + '°' + (ll[1] >= 0 ? 'E' : 'W') +
        '\n地面海拔 ' + Math.round(hGround) + ' m　高度 ' + ((alt - floorAt(camera.position)) * M_PER_U > 20000 ? Math.round((alt - floorAt(camera.position)) * M_PER_U / 1000) + ' km' : Math.max(0, Math.round((alt - floorAt(camera.position)) * M_PER_U)) + ' m') +
        '\n地圖 ' + GROUND.ready + ' 塊' + (GROUND.loading ? '（載入中 ' + GROUND.loading + '）' : '') + (GROUND.errors && !GROUND.ready ? '（載入失敗：網路或來源被擋）' : '');
    }
    function resetProj() { if (lastProj.n !== 0.03 || lastProj.f !== 3000) { camera.near = 0.03; camera.far = 3000; camera.updateProjectionMatrix(); lastProj.n = 0.03; lastProj.f = 3000; } }
    function latLonOf(v) { var r = v.length(); return [Math.asin(v.y / r) / DEG, Math.atan2(-v.z, v.x) / DEG]; }
    /* terrain height (scene units) under a world position, from the finest tile that is on screen */
    var fl = new V3();
    function floorAt(wp) {
      if (!GROUND.active) return 0;
      fl.copy(wp).applyMatrix4(inv); var ll = latLonOf(fl), best = null;
      tiles.forEach(function (t) { if (t.state === 3 && t.vis && ll[0] >= t.bb.la1 && ll[0] <= t.bb.la2 && ll[1] >= t.bb.lo1 && ll[1] <= t.bb.lo2 && (!best || t.z > best.z)) best = t; });
      if (!best) return 0;
      var u = (ll[1] - best.bb.lo1) / (best.bb.lo2 - best.bb.lo1), v = lat2ty(ll[0], best.z) - best.y, N = best.N, W = N + 1;
      var fx = Math.max(0, Math.min(N - 1e-6, u * N)), fy = Math.max(0, Math.min(N - 1e-6, v * N)), x0 = fx | 0, y0 = fy | 0, ax = fx - x0, ay = fy - y0, H = best.hh;
      return (H[y0 * W + x0] * (1 - ax) + H[y0 * W + x0 + 1] * ax) * (1 - ay) + (H[(y0 + 1) * W + x0] * (1 - ax) + H[(y0 + 1) * W + x0 + 1] * ax) * ay;
    }
    /* jump to a place: position above lat/lon, heading in degrees clockwise from north, pitch in degrees (negative = look down) */
    var gp = new V3(), gu = new V3(), gn = new V3(), gf = new V3(), gq = new THREE.Quaternion();
    function gotoLL(lat, lon, alt, hd, pt) {
      enterFly(); EM.updateWorldMatrix(true, false);
      /* if it is night there, turn the planet so the Sun is up (morning light) */
      inv.copy(EM.matrixWorld).invert(); gf.copy(EB.sunU.value).transformDirection(inv);
      if (llToLocal(lat, lon, 1, gp).dot(gf) < 0.18) { EM.rotation.y += (Math.atan2(-gf.z, gf.x) / DEG - (lon + 28)) * DEG; EM.updateMatrixWorld(true); }
      llToLocal(lat, lon, ER + alt, gp).applyMatrix4(EM.matrixWorld); cam.pos.copy(gp);
      EB.group.getWorldPosition(flyW); gu.copy(gp).sub(flyW).normalize();
      EB.tilt.getWorldQuaternion(gq); gn.set(0, 1, 0).applyQuaternion(gq); gn.addScaledVector(gu, -gn.dot(gu)).normalize();
      gf.copy(gn).applyAxisAngle(gu, -(hd || 0) * DEG); var pr = (pt || 0) * DEG;
      gf.multiplyScalar(Math.cos(pr)).addScaledVector(gu, Math.sin(pr));
      flyQ2.setFromUnitVectors(flyUp, gu); flyQ.copy(flyQ2); fly.surf = true; fly.lock = { id: 'earth', pos: flyW.clone(), rot: EM.rotation.y }; flyV.set(0, 0, 0);
      var an = flyAnglesFromWorld(gf, flyQ); cam.theta = cam.tTheta = an.th; cam.phi = cam.tPhi = an.ph;
      camera.position.copy(cam.pos); tickN = 0;
    }
    window.__fly = fly; window.__cam = cam; window.__goto = gotoLL;
    window.__ground = { EM: EM, camL: camL, tiles: tiles, G: GROUND, queue: queue };
    return { goto: gotoLL, update: update, floor: floorAt, tiles: tiles, GRP: GRP, select: select, U: U };
  })();


  /* "land on Earth" button: shows while Earth is the focus */
  var landBtn = document.createElement('button'); landBtn.id = 'gLand'; landBtn.type = 'button'; landBtn.textContent = '降落地球';
  document.body.appendChild(landBtn);
  var lst = document.createElement('style');
  lst.textContent = '#gLand{position:fixed;right:14px;top:14px;z-index:6;display:none;padding:8px 14px;border-radius:999px;background:rgba(10,24,44,.82);border:1px solid rgba(127,227,255,.55);color:#cfe9ff;font:600 13px "Noto Sans TC",system-ui,sans-serif;cursor:pointer}#gLand:hover{background:rgba(24,60,100,.9)}#gPlace{position:fixed;right:14px;top:52px;z-index:6;display:none;padding:6px 10px;border-radius:10px;background:rgba(10,24,44,.82);border:1px solid rgba(127,227,255,.4);color:#cfe9ff;font:12px "Noto Sans TC",system-ui,sans-serif}body.clean #gLand,body.clean #gPlace{display:none!important}body.flying #gLand{display:none!important}';
  document.head.appendChild(lst);
  function landOnEarth() {
    var b = BODY.earth; b.mesh.updateWorldMatrix(true, false); b.group.getWorldPosition(flyW);
    flyL.copy(camera.position).applyMatrix4(flyQ2.identity() && new THREE.Matrix4().copy(b.mesh.matrixWorld).invert());
    ground.goto(Math.asin(flyL.y / flyL.length()) / DEG, Math.atan2(-flyL.z, flyL.x) / DEG, 0.05, 0, -22);
  }
  landBtn.addEventListener('click', function () { landOnEarth(); });
  var PRE = [['前往地點…', null], ['台北', [25.04, 121.56, 0.004, 0, -32]], ['東京', [35.68, 139.76, 0.004, 0, -32]], ['紐約', [40.71, -74.0, 0.004, 0, -32]], ['巴黎', [48.86, 2.35, 0.004, 0, -32]],
    ['開羅與金字塔', [29.98, 31.13, 0.0025, 0, -28]], ['聖母峰', [27.99, 86.93, 0.0022, 200, -14]], ['阿爾卑斯山（白朗峰）', [45.83, 6.86, 0.0022, 20, -14]], ['大峽谷', [36.1, -112.1, 0.0016, 0, -22]], ['富士山', [35.36, 138.73, 0.0018, 270, -14]], ['雪梨', [-33.86, 151.21, 0.004, 0, -32]]];
  var landSel = document.createElement('select'); landSel.id = 'gPlace';
  PRE.forEach(function (p, i) { var o = document.createElement('option'); o.value = i; o.textContent = p[0]; landSel.appendChild(o); });
  document.body.appendChild(landSel);
  landSel.addEventListener('change', function () { var p = PRE[+landSel.value][1]; landSel.value = 0; landSel.blur(); if (p) ground.goto(p[0], p[1], p[2], p[3], p[4]); });
  setInterval(function () { var onE = focusId === 'earth' || (cam.free && fly.near === 'earth'); landBtn.style.display = (focusId === 'earth' && !cam.free) ? 'block' : 'none'; landSel.style.display = onE ? 'block' : 'none'; landSel.style.top = (cam.free ? 14 : 52) + 'px'; }, 250);

  /* ---------- frame loop ---------- */
  var dtReal = 0.016;
  var tmpV = new V3(), tmpW = new V3(), tmpQ = new THREE.Quaternion(), proj = new V3();
  var last = performance.now(), frame = 0;
  function shortest(a, b) { var d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }

  function updateBodies(dt) {
    var d = daysNow();
    PL.forEach(function (o) {
      var b = BODY[o.id];
      b.r = planetPos(o, d, tmpV);
      b.group.position.copy(tmpV);
    });
    /* moons (soft-capped angular speed) */
    var rate = uiState.play ? SPEEDS[speedIdx] : 0;
    MN.forEach(function (o) {
      var om = TAU * rate / o.P, eff = om / (1 + om / 2.4);
      moonAng[o.id] += eff * dt;
      var a = moonAng[o.id], b = BODY[o.id];
      b.group.position.set(Math.cos(a) * o.dist, 0, -Math.sin(a) * o.dist);
      b.mesh.rotation.y = a + Math.PI;
    });
    root.updateMatrixWorld(true);
    bodyList.forEach(function (b) {
      b.group.getWorldPosition(tmpW);
      if (!b.isSun) {
        b.sunU.value.copy(tmpW).multiplyScalar(-1).normalize();
        if (b.mat.uniforms.pc) {
          b.mat.uniforms.pc.value.copy(tmpW);
          if (b.ring) { b.tilt.getWorldQuaternion(tmpQ); b.mat.uniforms.ringN.value.set(0, 1, 0).applyQuaternion(tmpQ); }
        }
      }
      if (uiState.play && !b.isMoon) b.mesh.rotation.y += b.spin * dt;
      if (b.clouds) { b.cloudDrift += (uiState.play ? 0.0035 : 0) * dt; b.clouds.rotation.y = b.mesh.rotation.y + b.cloudDrift; }
    });
  }

  function updateCamera(dt) {
    dt = Math.min(0.25, dtReal);
    if (cam.free) { updateFly(dt); return; }
    var b = focusId === 'overview' ? BODY.sun : BODY[focusId];
    b.group.getWorldPosition(tmpW);
    if (focusId === 'overview') tmpW.set(0, 0, 0);
    cam.offset.multiplyScalar(Math.exp(-dt * 4.5));
    cam.target.copy(tmpW).add(cam.offset);
    cam.dist += (cam.goalDist - cam.dist) * (1 - Math.exp(-dt * 6));
    if (!dragging && vel.lengthSq() > 0.02) { rotateBy(vel.x, vel.y); vel.multiplyScalar(0.94); cam.aim = false; }
    if (cam.aim) {
      cam.theta += shortest(cam.theta, cam.thetaGoal) * (1 - Math.exp(-dt * 3));
      cam.phi += (cam.phiGoal - cam.phi) * (1 - Math.exp(-dt * 3));
    }
    var cp = Math.cos(cam.phi);
    camera.position.set(cam.target.x + cam.dist * cp * Math.sin(cam.theta), cam.target.y + cam.dist * Math.sin(cam.phi), cam.target.z + cam.dist * cp * Math.cos(cam.theta));
    camera.lookAt(cam.target);
    sky.position.copy(camera.position);
  }

  var oT = new V3(), oC = new V3(), oD = new V3();
  function occluded(cp, bp, sc, sr) {
    oD.copy(bp).sub(cp); var len = oD.length(); oD.multiplyScalar(1 / len);
    oC.copy(sc).sub(cp); var t = oC.dot(oD);
    if (t < 0 || t > len) return false;
    oC.addScaledVector(oD, -t);
    return oC.length() < sr * 0.98;
  }
  var famOf = { moon: 'earth', io: 'jupiter', europa: 'jupiter', ganymede: 'jupiter', callisto: 'jupiter' };
  function updateLabels() {
    var w = stage.clientWidth, h = stage.clientHeight;
    var fam = BODY[focusId] && BODY[focusId].isMoon ? BODY[focusId].parentId : focusId;
    if (cam.free && fly.fam) fam = fly.fam;
    ORDER.forEach(function (it) {
      var id = it[0]; if (id === 'overview') return;
      var b = BODY[id], el = labelMap[id];
      var isM = !!b.isMoon;
      b.group.getWorldPosition(tmpW);
      proj.copy(tmpW).project(camera);
      var dist = camera.position.distanceTo(tmpW);
      var sr = (b.R / (dist * FOV_TAN)) * (h / 2);
      var show = proj.z < 1 && proj.z > -1 && sr < (id === focusId ? 28 : 90) && (!isM || fam === famOf[id]) && Math.abs(proj.x) < 1.2 && Math.abs(proj.y) < 1.2;
      if (show && !b.isSun && occluded(camera.position, tmpW, oT.set(0, 0, 0), SUN_R)) show = false;
      if (show && focusId !== 'overview' && focusId !== id) { var fbd = BODY[focusId]; fbd.group.getWorldPosition(oT); if (occluded(camera.position, tmpW, oT, fbd.R)) show = false; }
      el.classList.toggle('hide', !show);
      el.style.transform = 'translate(' + (((proj.x * 0.5 + 0.5) * w) - 4.5).toFixed(1) + 'px,' + (((-proj.y * 0.5 + 0.5) * h) - 14).toFixed(1) + 'px)';
    });
  }

  function tick(now) {
    requestAnimationFrame(tick);
    dtReal = (now - last) / 1000; var dt = Math.min(0.05, dtReal); last = now;
    if (uiState.play) simDays += SPEEDS[speedIdx] * dt;
    sunTime.value += dt * (uiState.play ? 1 : 0);
    updateBodies(dt);
    updateCamera(dt);
    ground.update(dt);
    belt.material.uniforms.uDays.value = daysNow();
    /* orbit visibility */
    var fb = BODY[focusId];
    orbitLines.forEach(function (l) { l.visible = uiState.orbit; });
    var near = focusId !== 'overview' && cam.dist < 40;
    PL.forEach(function (o) { var bb = BODY[o.id]; bb.line.material.opacity = (focusId === o.id || (fb && fb.parentId === o.id)) ? 0.7 : (near ? 0.06 : 0.26); });
    var sunB = BODY.sun, dSun = camera.position.length();
    sunB.glowA.material.opacity = Math.min(1, Math.max(0.35, dSun / 26));
    sunB.glowB.material.opacity = Math.min(1, Math.max(0.12, dSun / 70));
    MN.forEach(function (o) { var m = BODY[o.id]; m.line.visible = uiState.orbit && (focusId === o.id || focusId === o.parent || (fb && fb.parentId === o.parent)); });
    var realCam = null;
    if (GROUND.shift) { /* floating origin: render relative to the camera so metre-scale detail survives float32 */
      realCam = camera.position.clone(); scene.position.copy(realCam).negate(); camera.position.set(0, 0, 0);
    }
    renderer.render(scene, camera);
    if (realCam) { scene.position.set(0, 0, 0); camera.position.copy(realCam); scene.updateMatrixWorld(true); camera.updateMatrixWorld(true); }
    if (uiState.label) updateLabels();
    if (frame++ % 6 === 0) {
      var ds = new Date(startMs + simDays * 86400000).toISOString().slice(0, 10); dateEl.textContent = ds;
      dateMini.textContent = ds + (uiState.play ? '　' + SPEEDS[speedIdx] + ' 天 / 秒' : '　已暫停');
      if (liveEl && BODY[focusId] && BODY[focusId].r) liveEl.textContent = BODY[focusId].r.toFixed(2) + ' AU';
    }
  }

  resize();
  cam.dist = cam.goalDist = overviewDist();
  setFocus('overview');
  cam.offset.set(0, 0, 0);
  requestAnimationFrame(tick);

  /* debug/test hook: lets a headless check jump to a body */
  window.__solar = { toggleFull: toggleFull, focus: setFocus, project: function (id) { var b = BODY[id]; b.group.getWorldPosition(tmpW); proj.copy(tmpW).project(camera); return [(proj.x * 0.5 + 0.5) * stage.clientWidth, (-proj.y * 0.5 + 0.5) * stage.clientHeight]; }, get focusId() { return focusId; } };
})();
