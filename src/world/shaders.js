// GLSL for the evolving gallery. One material renders every rasterised
// stage; uniforms switch individual ideas on and off.

const LIGHTING = /* glsl */`
uniform vec3 uLightPos, uLightColor, uLight2Pos, uLight2Color, uSky, uGround;
uniform float uLightPower, uLight2Power, uAmbient;

// Diffuse (Lambert) + Blinn specular from the softbox, a short-range warm
// light from the glowing cursor bar, and a hemisphere of ambient light.
vec3 lightAt(vec3 P, vec3 N, vec3 V, vec3 albedo, float shininess, float specK, float shadow){
  vec3 Lv = uLightPos - P; float d2 = dot(Lv, Lv); vec3 L = Lv * inversesqrt(d2);
  float att = uLightPower / (1.0 + d2 * 0.035);
  float ndl = max(dot(N, L), 0.0);
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), shininess) * specK * step(0.0001, ndl);
  vec3 c = albedo * uLightColor * ndl * att * shadow + uLightColor * spec * att * shadow;
  vec3 L2v = uLight2Pos - P; float e2 = dot(L2v, L2v);
  c += albedo * uLight2Color * max(dot(N, L2v * inversesqrt(e2)), 0.0) * uLight2Power / (1.0 + e2 * 1.6);
  c += albedo * mix(uGround, uSky, N.y * 0.5 + 0.5) * uAmbient;
  return c;
}
`;

export const WORLD_VERT = /* glsl */`
attribute vec3 aAlbedo;
attribute vec4 aMat;      // type, roughness or IOR, emission, texture id
attribute float aTri;
uniform float uSnap;
uniform vec2 uSnapRes;
varying vec3 vWP, vN, vAlbedo, vGouraud;
varying vec4 vMat;
varying float vTri, vViewZ;
varying vec2 vUv;
varying vec3 vUvW;
${LIGHTING}
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWP = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vAlbedo = aAlbedo; vMat = aMat; vTri = aTri; vUv = uv;
  vec4 mv = viewMatrix * w;
  vViewZ = -mv.z;
  vec4 clip = projectionMatrix * mv;
  if (uSnap > 0.5) { vec2 ndc = clip.xy / clip.w; ndc = floor(ndc * uSnapRes + 0.5) / uSnapRes; clip.xy = ndc * clip.w; }
  vUvW = vec3(uv * clip.w, clip.w);
  // Gouraud: light the corners here, let the rasteriser blend the colours
  vec3 V = normalize(cameraPosition - vWP);
  float shininess = aMat.x == 1.0 ? 60.0 : aMat.x == 2.0 ? 120.0 : 24.0;
  vGouraud = lightAt(vWP, vN, V, aAlbedo, shininess, aMat.x == 0.0 ? 0.15 : 0.9, 1.0) + aAlbedo * min(aMat.z, 1.0);
  gl_Position = clip;
}`;

export const WORLD_FRAG = /* glsl */`
uniform int uShade, uView;
uniform float uTexOn, uEnvOn, uShadowOn, uHDR, uAffine, uMipViz, uTime, uNear, uFar, uEnvBright, uEmitScale;
uniform sampler2D uTexFloor, uTexWall, uTexMip, uShadowMap;
uniform mat4 uShadowMat;
uniform vec3 uRoomMin, uRoomMax, uWallL, uWallR, uWallC;
varying vec3 vWP, vN, vAlbedo, vGouraud;
varying vec4 vMat;
varying float vTri, vViewZ;
varying vec2 vUv;
varying vec3 vUvW;
${LIGHTING}

vec3 hash3(float n){ return fract(sin(vec3(n, n + 1.7, n + 3.1)) * vec3(43758.5453, 22578.145, 19642.349)); }

float shadowAt(vec3 P, vec3 N){
  if (uShadowOn < 0.5) return 1.0;
  vec4 sc = uShadowMat * vec4(P + N * 0.04, 1.0);
  vec3 c = sc.xyz / sc.w * 0.5 + 0.5;
  if (c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0 || c.z > 1.0) return 1.0;
  float s = 0.0;
  vec2 texel = vec2(1.0 / 2048.0);
  for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) s += step(c.z - 0.0008, texture2D(uShadowMap, c.xy + vec2(x, y) * texel * 1.6).r);
  return s / 25.0;
}

// What a reflected or refracted ray sees: the inside of the room box.
vec3 roomColor(vec3 ro, vec3 rd){
  vec3 inv = 1.0 / rd;
  vec3 tmax = max((uRoomMin - ro) * inv, (uRoomMax - ro) * inv);
  float t = min(min(tmax.x, tmax.y), tmax.z);
  vec3 p = ro + rd * t, c;
  if (t == tmax.x) c = rd.x < 0.0 ? uWallL : uWallR;
  else if (t == tmax.y) {
    if (rd.y < 0.0) c = vec3(mix(0.06, 0.32, mod(floor(p.x) + floor(p.z), 2.0)));
    else { if (abs(p.x) < 1.8 && p.z > -2.0 && p.z < 1.2) return vec3(7.5) * uEmitScale; c = vec3(0.7); }
  } else c = uWallC;
  float lit = 0.35 + 0.9 * smoothstep(9.0, 1.0, length(p - uLightPos));
  return c * lit * uEnvBright;
}

// Per-triangle constants arrive as interpolated varyings, which some GPUs do
// not reproduce exactly; round them before comparing.
float matType(){ return floor(vMat.x + 0.5); }
float matTex(){ return floor(vMat.w + 0.5); }

vec2 surfaceUv(){ return mix(vUv, vUvW.xy / vUvW.z, uAffine); }

vec3 albedoAt(vec2 uv){
  vec3 a = vAlbedo;
  if (uTexOn > 0.5) {
    if (matTex() == 1.0) a = uMipViz > 0.5 ? texture2D(uTexMip, uv).rgb : texture2D(uTexFloor, uv).rgb;
    else if (matTex() == 2.0) a *= texture2D(uTexWall, uv).rgb;
  }
  return a;
}

void main(){
  vec3 V = normalize(cameraPosition - vWP);
  vec3 Nf = normalize(cross(dFdx(vWP), dFdy(vWP)));
  if (dot(Nf, V) < 0.0) Nf = -Nf;
  vec3 N = normalize(vN);
  vec2 uv = surfaceUv();
  vec3 albedo = albedoAt(uv);
  float type = matType(), emit = vMat.z * uEmitScale;
  float sh = shadowAt(vWP, N);
  vec3 col;

  if (uShade == 0) {
    col = 0.25 + 0.75 * hash3(floor(vTri + 0.5));
  } else if (uShade == 1) {
    col = albedo + vAlbedo * min(emit, 1.0);
  } else if (uShade == 2) {
    col = lightAt(vWP, Nf, V, albedo, 24.0, 0.0, sh);
  } else if (uShade == 3) {
    col = vGouraud;
  } else {
    float shininess = type == 1.0 ? mix(400.0, 30.0, vMat.y * 3.0) : type == 2.0 ? 300.0 : 24.0;
    float specK = type == 0.0 ? 0.12 : 1.0;
    col = lightAt(vWP, N, V, type == 1.0 ? albedo * 0.25 : albedo, shininess, specK, sh);
    if (uEnvOn > 0.5) {
      vec3 R = reflect(-V, N);
      if (type == 1.0) col += albedo * roomColor(vWP, normalize(R + (fract(sin(dot(vWP, vec3(12.9, 78.2, 37.7))) * 43758.5) - 0.5) * vMat.y * 0.5));
      if (type == 4.0) col += 0.22 * roomColor(vWP, R) * (0.4 + 0.6 * pow(1.0 - max(dot(N, V), 0.0), 2.0));
      if (type == 2.0) {
        float cosi = max(dot(N, V), 0.0);
        float f = 0.04 + 0.96 * pow(1.0 - cosi, 5.0);
        vec3 T = refract(-V, N, 1.0 / vMat.y);
        // second refraction on the far side of the ball, approximated by bending again
        vec3 T2 = normalize(T - N * 0.35);
        col = mix(roomColor(vWP, T2) * albedo, roomColor(vWP, R), f) + lightAt(vWP, N, V, vec3(0.0), shininess, 1.0, sh);
      }
    }
  }
  if (type == 3.0 && uShade >= 1) col = vAlbedo * (uHDR > 0.5 ? emit : min(emit, 1.4));

  if (uView == 1) col = vec3(1.0 - clamp((vViewZ - uNear) / (uFar - uNear), 0.0, 1.0));
  else if (uView == 2) col = N * 0.5 + 0.5;
  else if (uView == 3) col = albedo;
  else if (uView == 4) col = vec3(fract(uv), 0.15);
  else if (uView == 5) col = vec3(sh);
  else if (uView == 6) col = lightAt(vWP, N, V, albedo, 24.0, 0.0, sh);
  else if (uView == 7) col = max(col - lightAt(vWP, N, V, albedo, 24.0, 0.0, sh), 0.0);

  if (uHDR < 0.5) col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}`;

export const MASK_VERT = /* glsl */`
varying vec3 vWP;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

/** r: how far the upgrade has reached (1 = behind the wavefront), g: the bright edge. */
export const MASK_FRAG = /* glsl */`
uniform vec3 uOrigin; uniform float uRadius, uWidth;
varying vec3 vWP;
void main(){
  float d = length(vWP - uOrigin);
  float behind = 1.0 - smoothstep(uRadius - uWidth * 0.25, uRadius, d);
  float edge = exp(-abs(d - uRadius) / uWidth * 3.0);
  gl_FragColor = vec4(behind, edge, 0.0, 1.0);
}`;

export const COMPOSITE_FRAG = /* glsl */`
uniform sampler2D tA, tB, tMask; uniform float uTime; uniform vec3 uEdge;
varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec4 m = texture2D(tMask, vUv);
  vec3 c = mix(texture2D(tA, vUv).rgb, texture2D(tB, vUv).rgb, m.r);
  float sparkle = step(0.985, hash(floor(vUv * 420.0) + floor(uTime * 24.0)));
  c += uEdge * m.g * (1.2 + sparkle * 3.0);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

export const PRESENT_FRAG = /* glsl */`
uniform sampler2D tSrc; varying vec2 vUv;
void main(){ gl_FragColor = vec4(texture2D(tSrc, vUv).rgb, 1.0);
  #include <colorspace_fragment>
}`;

export const COPY_FRAG = /* glsl */`
uniform sampler2D tSrc; varying vec2 vUv;
void main(){ gl_FragColor = vec4(clamp(texture2D(tSrc, vUv).rgb, 0.0, 1.0), 1.0); }`;

export const TONEMAP_FRAG = /* glsl */`
uniform sampler2D tScene, tBloom; uniform float uBloom, uExposure;
varying vec2 vUv;
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main(){
  vec3 c = (texture2D(tScene, vUv).rgb + texture2D(tBloom, vUv).rgb * uBloom) * uExposure;
  gl_FragColor = vec4(aces(c), 1.0);
}`;

export const BRIGHT_FRAG = /* glsl */`
uniform sampler2D tSrc; uniform float uThresh, uKnee; varying vec2 vUv;
void main(){
  vec3 c = texture2D(tSrc, vUv).rgb; float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThresh + uKnee, 0.0, 2.0 * uKnee); soft = soft * soft / (4.0 * uKnee + 1e-4);
  gl_FragColor = vec4(c * max(soft, br - uThresh) / max(br, 1e-4), 1.0);
}`;

export const DOWN_FRAG = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
void main(){
  vec2 o = uTexel * 0.5;
  vec3 s = texture2D(tSrc, vUv).rgb * 4.0 + texture2D(tSrc, vUv - o).rgb + texture2D(tSrc, vUv + o).rgb
         + texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb + texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb;
  gl_FragColor = vec4(s / 8.0, 1.0);
}`;

export const UP_FRAG = /* glsl */`
uniform sampler2D tSrc, tPrev; uniform vec2 uTexel; varying vec2 vUv;
void main(){
  vec2 o = uTexel;
  vec3 s = texture2D(tSrc, vUv + vec2(-o.x, 0.0)).rgb + texture2D(tSrc, vUv + vec2(o.x, 0.0)).rgb
         + texture2D(tSrc, vUv + vec2(0.0, -o.y)).rgb + texture2D(tSrc, vUv + vec2(0.0, o.y)).rgb;
  s += (texture2D(tSrc, vUv + o * 0.5).rgb + texture2D(tSrc, vUv - o * 0.5).rgb
      + texture2D(tSrc, vUv + vec2(o.x, -o.y) * 0.5).rgb + texture2D(tSrc, vUv + vec2(-o.x, o.y) * 0.5).rgb) * 2.0;
  gl_FragColor = vec4(s / 12.0 + texture2D(tPrev, vUv).rgb, 1.0);
}`;
