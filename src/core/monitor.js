import * as THREE from 'three';

// A procedurally modelled CRT that floats in the dark. Early eras draw into
// its 2D canvas; later eras feed it a render target so the screen can show a
// 3D world before the camera dives through the glass.

export const SCREEN_W = 4.0;
export const SCREEN_H = 3.0;

const crtVert = /* glsl */`
  varying vec2 vUv;
  uniform float uBulge;
  void main(){
    vUv = uv;
    vec3 p = position;
    vec2 c = uv * 2.0 - 1.0;
    p.z += uBulge * (1.0 - 0.5 * (c.x*c.x + c.y*c.y));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const crtFrag = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tScreen;
  uniform vec2 uRes;
  uniform float uTime, uCurv, uScan, uMask, uMono, uPowerX, uPowerY, uNoise, uBright, uGlow, uFlicker, uDirect, uRGBSplit;
  uniform vec3 uTint, uOff;

  vec2 curve(vec2 uv){
    uv = uv * 2.0 - 1.0;
    vec2 o = abs(uv.yx) * uCurv;
    uv = uv + uv * o * o;
    return uv * 0.5 + 0.5;
  }
  float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }

  vec3 samp(vec2 uv){
    vec3 c;
    if (uRGBSplit > 0.0) {
      c.r = texture2D(tScreen, uv + vec2(uRGBSplit, 0.0)).r;
      c.g = texture2D(tScreen, uv).g;
      c.b = texture2D(tScreen, uv - vec2(uRGBSplit, 0.0)).b;
    } else c = texture2D(tScreen, uv).rgb;
    return c;
  }

  void main(){
    vec2 uv = mix(curve(vUv), vUv, uDirect);
    // power-on / power-off squash
    vec2 cuv = uv - 0.5;
    vec2 sq = vec2(max(uPowerX, 0.002), max(uPowerY, 0.002));
    vec2 suv = cuv / sq + 0.5;
    float inside = step(0.0, suv.x) * step(suv.x, 1.0) * step(0.0, suv.y) * step(suv.y, 1.0);
    vec2 edge = smoothstep(0.0, 0.012, uv) * smoothstep(0.0, 0.012, 1.0 - uv);
    float frame = edge.x * edge.y;

    vec3 col = samp(suv);
    // cheap halation: a few wide taps
    vec3 glow = vec3(0.0);
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.785398;
      glow += texture2D(tScreen, suv + vec2(cos(a), sin(a)) * 0.006).rgb;
    }
    col += glow / 8.0 * uGlow;

    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, lum * uTint * 1.6, uMono);
    col *= mix(vec3(1.0), uTint, 1.0 - uMono) ;

    // scanlines & aperture grille
    float sl = 0.5 + 0.5 * sin(suv.y * uRes.y * 3.14159);
    col *= mix(1.0, 0.55 + 0.45 * sl, uScan);
    float px = mod(gl_FragCoord.x, 3.0);
    vec3 mask = vec3(px < 1.0 ? 1.0 : 0.7, (px >= 1.0 && px < 2.0) ? 1.0 : 0.7, px >= 2.0 ? 1.0 : 0.7);
    col *= mix(vec3(1.0), mask, uMask);

    // noise + flicker
    col += (hash(uv * 400.0 + uTime) - 0.5) * uNoise * (0.15 + lum);
    col *= 1.0 - uFlicker * (0.5 + 0.5 * sin(uTime * 120.0)) * 0.08;

    // power squash brightens the collapsed beam
    float squashBoost = 1.0 / mix(1.0, sq.x * sq.y, 0.85);
    col *= inside * min(squashBoost, 30.0) * uBright;
    // the collapsing dot / line glow
    float lineGlow = exp(-abs(cuv.y) / max(sq.y * 0.5, 0.001) * 2.0) * (1.0 - uPowerY);
    float dotGlow = exp(-length(cuv / vec2(max(sq.x, 0.004), max(sq.y, 0.004))) * 2.0) * (1.0 - uPowerX) * step(uPowerY, 0.02);
    col += uTint * (lineGlow * 0.6 * step(0.0, 1.0 - uPowerY) * step(0.03, uPowerY) * step(uPowerY, 0.99) + dotGlow * 2.0) * step(0.0001, uPowerX);

    // vignette
    vec2 v = uv * (1.0 - uv.yx);
    col *= mix(1.0, pow(v.x * v.y * 16.0, 0.25), 1.0 - uDirect);

    // glass reflection & off-colour
    vec3 glass = uOff * 0.25 * (0.6 + 0.4 * smoothstep(1.2, 0.0, length(vUv - vec2(0.3, 0.75))));
    glass += vec3(0.012) * smoothstep(0.35, 0.0, length(vUv - vec2(0.25, 0.8))) * (1.0 - uDirect);
    col = col * frame + glass;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export class Monitor {
  constructor(renderer) {
    this.renderer = renderer;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024; this.canvas.height = 768;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: false });
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;

    this.group = new THREE.Group();
    this.uniforms = {
      tScreen: { value: this.texture },
      uRes: { value: new THREE.Vector2(1024, 768) },
      uTime: { value: 0 }, uCurv: { value: 0.22 }, uScan: { value: 0.35 }, uMask: { value: 0.25 },
      uMono: { value: 0 }, uPowerX: { value: 0 }, uPowerY: { value: 0 }, uNoise: { value: 0.03 },
      uBright: { value: 1.15 }, uGlow: { value: 0.45 }, uFlicker: { value: 0.4 }, uDirect: { value: 0 },
      uRGBSplit: { value: 0 }, uBulge: { value: 0.12 },
      uTint: { value: new THREE.Color(1, 1, 1) }, uOff: { value: new THREE.Color(0.018, 0.022, 0.02) },
    };
    this._build();
    this.avgColor = new THREE.Color(0.2, 0.6, 0.3);
    this._avgCanvas = document.createElement('canvas');
    this._avgCanvas.width = this._avgCanvas.height = 1;
    this._avgCtx = this._avgCanvas.getContext('2d', { willReadFrequently: true });
    this._frame = 0;
  }

  _build() {
    const g = this.group;
    // Screen
    const geo = new THREE.PlaneGeometry(SCREEN_W, SCREEN_H, 32, 24);
    this.screenMat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: crtVert, fragmentShader: crtFrag });
    this.screen = new THREE.Mesh(geo, this.screenMat);
    g.add(this.screen);

    // Bezel: a rounded slab with a rounded hole, extruded with a bevel.
    const rr = (s, w, h, r) => {
      s.moveTo(-w / 2 + r, -h / 2); s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
      s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
      s.lineTo(-w / 2 + r, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
      s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    };
    const outer = new THREE.Shape(); rr(outer, SCREEN_W + 0.9, SCREEN_H + 1.05, 0.28);
    const hole = new THREE.Path(); rr(hole, SCREEN_W + 0.04, SCREEN_H + 0.04, 0.22);
    outer.holes.push(hole);
    const bezelGeo = new THREE.ExtrudeGeometry(outer, { depth: 0.35, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 4, curveSegments: 12 });
    bezelGeo.translate(0, -0.12, -0.3);
    this.plastic = new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.62, metalness: 0.05 });
    const bezel = new THREE.Mesh(bezelGeo, this.plastic);
    g.add(bezel);

    // Inner recess (dark tube surround)
    const recess = new THREE.Mesh(new THREE.BoxGeometry(SCREEN_W + 0.1, SCREEN_H + 0.1, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.9, side: THREE.BackSide }));
    recess.position.z = -0.12;
    g.add(recess);

    // Tapered CRT body
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 3.35, 3.2, 4, 1, false, Math.PI / 4), this.plastic);
    body.rotation.x = Math.PI / 2; body.scale.set(1.18, 1, 0.92);
    body.position.set(0, -0.12, -1.95);
    g.add(body);

    // Base / stand
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.5, 0.35, 48), this.plastic);
    stand.position.set(0, -2.45, -1.3);
    g.add(stand);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 1.2), this.plastic);
    neck.position.set(0, -2.1, -1.3);
    g.add(neck);

    // Label plate and power LED
    const lc = document.createElement('canvas'); lc.width = 512; lc.height = 64;
    const lx = lc.getContext('2d');
    lx.fillStyle = '#2a2826'; lx.fillRect(0, 0, 512, 64);
    lx.fillStyle = '#8a857c'; lx.font = '600 22px "JetBrains Mono", monospace'; lx.textBaseline = 'middle';
    lx.fillText('MoG · MODEL 1   ▮▮▮', 16, 33);
    const lt = new THREE.CanvasTexture(lc); lt.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.2), new THREE.MeshStandardMaterial({ map: lt, roughness: 0.7 }));
    label.position.set(-1.15, -SCREEN_H / 2 - 0.36, 0.14);
    g.add(label);
    this.led = new THREE.Mesh(new THREE.CircleGeometry(0.045, 16), new THREE.MeshBasicMaterial({ color: 0x220000 }));
    this.led.position.set(SCREEN_W / 2 + 0.05, -SCREEN_H / 2 - 0.36, 0.14);
    g.add(this.led);
  }

  setPowered(on) { this.led.material.color.set(on ? 0x39ff6a : 0x220000); }

  setProfile(p) {
    const u = this.uniforms;
    if (p.tint) u.uTint.value.set(p.tint);
    if (p.mono !== undefined) u.uMono.value = p.mono;
    if (p.scan !== undefined) u.uScan.value = p.scan;
    if (p.mask !== undefined) u.uMask.value = p.mask;
    if (p.glow !== undefined) u.uGlow.value = p.glow;
    if (p.curv !== undefined) u.uCurv.value = p.curv;
    if (p.noise !== undefined) u.uNoise.value = p.noise;
    if (p.flicker !== undefined) u.uFlicker.value = p.flicker;
    if (p.bright !== undefined) u.uBright.value = p.bright;
    if (p.res) u.uRes.value.set(p.res[0], p.res[1]);
  }

  resizeCanvas(w, h) {
    if (this.canvas.width === w && this.canvas.height === h) return;
    this.canvas.width = w; this.canvas.height = h;
    this.texture.dispose();
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.uniforms.tScreen.value = this.texture;
  }

  useCanvas() { this.uniforms.tScreen.value = this.texture; }
  useTexture(tex) { this.uniforms.tScreen.value = tex; }

  update(t, dirty = true) {
    this.uniforms.uTime.value = t;
    if (dirty && this.uniforms.tScreen.value === this.texture) {
      this.texture.needsUpdate = true;
      if ((this._frame++ & 7) === 0) {
        try {
          this._avgCtx.drawImage(this.canvas, 0, 0, 1, 1);
          const d = this._avgCtx.getImageData(0, 0, 1, 1).data;
          this.avgColor.setRGB(d[0] / 255, d[1] / 255, d[2] / 255);
        } catch (e) {}
      }
    }
  }

  // Convert a raycast hit's uv into canvas pixel coordinates (applying the same
  // barrel curve the shader uses so clicks land exactly on what you see).
  uvToCanvas(uv) {
    const k = this.uniforms.uCurv.value;
    let x = uv.x * 2 - 1, y = uv.y * 2 - 1;
    const ox = Math.abs(y) * k, oy = Math.abs(x) * k;
    x = x + x * ox * ox; y = y + y * oy * oy;
    const cx = (x * 0.5 + 0.5), cy = (y * 0.5 + 0.5);
    return { x: cx * this.canvas.width, y: (1 - cy) * this.canvas.height, inside: cx >= 0 && cx <= 1 && cy >= 0 && cy <= 1 };
  }
}
