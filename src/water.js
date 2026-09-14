import * as T from './vendor/three.module.min.js';
import {
  RADIUS,
  CENTER,
  normalAt,
  bigLakeNormal,
  LAKE_RX,
  LAKE_RZ,
  ISLAND_CHART,
  shoreScale,
  SHORE_GLSL,
} from './navigation.js';
import { DISCO_GLSL } from './landscape.js';
export function buildWater(world, large = false) {
  const pos = [],
    uv = [],
    indices = [],
    rings = large ? 48 : 32,
    segments = large ? 128 : 96;
  const cx = large ? 0 : -29,
    cz = large ? 0 : -15,
    rx = large ? LAKE_RX : 24,
    rz = large ? LAKE_RZ : 32;
  for (let j = 0; j <= rings; j++)
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2,
        r = j / rings,
        // The big lake's rim follows the wandering shoreline, so the mesh reaches every bay.
        scale = large ? shoreScale(Math.cos(a) * rx, Math.sin(a) * rz) : 1,
        x = cx + Math.cos(a) * rx * r * scale,
        z = cz + Math.sin(a) * rz * r * scale;
      pos.push(
        ...(large ? bigLakeNormal(x, z) : normalAt(x, z))
          .multiplyScalar(RADIUS - 0.24)
          .add(CENTER)
          .toArray(),
      );
      uv.push(x, z);
    }
  for (let j = 0; j < rings; j++)
    for (let i = 0; i < segments; i++) {
      const a = j * (segments + 1) + i,
        b = a + segments + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const uniforms = {
    shape: { value: new T.Vector4(cx, cz, rx, rz) },
    large: { value: large ? 1 : 0 },
    shadeDirection: { value: new T.Vector3(0, 1, 0) },
    time: { value: 0 },
    center: { value: CENTER.clone() },
    swimmer: { value: new T.Vector2(1000, 1000) },
    wake: { value: 0 },
    mist: { value: new T.Color('#ced8c8') },
    disco: { value: 0 },
    discoTime: { value: 0 },
    // Filled by reflection.js: the mirrored picture, how to project it, and how much to show.
    reflection: { value: null },
    reflectionMatrix: { value: new T.Matrix4() },
    reflectionStrength: { value: 0 },
    // Filled by ripples.js: the height field, its window (centre, 1/width, on/off), texel size.
    ripples: { value: null },
    rippleWindow: { value: new T.Vector4(0, 0, 1, 0) },
    rippleTexel: { value: 1 / 512 },
  };
  const material = new T.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    vertexShader: `uniform vec4 shape;uniform float large;uniform vec3 shadeDirection;uniform float time;uniform vec3 center;uniform mat4 reflectionMatrix;varying vec2 lake;varying vec3 worldPosition;varying vec4 mirrored;
${SHORE_GLSL}
 void main(){lake=uv;vec2 q=(uv-shape.xy)/shape.zw;float r=length(q)/mix(1.,shoreScale(q),large);float wave=(sin(uv.x*.54+time*.9)*sin(uv.y*.43-time*.65)*.055+sin(uv.x*.2+uv.y*.3+time*.7)*.025)*smoothstep(0.,.2,1.-r);vec3 p=position+normalize(center-position)*wave;worldPosition=p;mirrored=reflectionMatrix*vec4(p,1.);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader: `uniform vec4 shape;uniform float large;uniform vec3 shadeDirection;uniform float time;uniform vec3 center;uniform vec2 swimmer;uniform float wake;uniform vec3 mist;uniform float disco;uniform float discoTime;uniform sampler2D reflection;uniform float reflectionStrength;uniform sampler2D ripples;uniform vec4 rippleWindow;uniform float rippleTexel;varying vec2 lake;varying vec3 worldPosition;varying vec4 mirrored;
${DISCO_GLSL}
${SHORE_GLSL}
 void main(){vec2 q=(lake-shape.xy)/shape.zw;float r=length(q)/mix(1.,shoreScale(q),large);float island=distance(lake,vec2(${ISLAND_CHART.x}.,${ISLAND_CHART.z}.));if(large>.5&&island<17.)discard;float depth=smoothstep(0.,large>.5?.2:.65,1.-r);if(large>.5)depth*=smoothstep(17.,25.,island);vec3 N=normalize(cross(dFdx(worldPosition),dFdy(worldPosition)));if(dot(N,center-worldPosition)<0.)N=-N;vec3 flatN=N;vec3 V=normalize(cameraPosition-worldPosition),L=normalize(center-worldPosition),H=normalize(V+L);
 // Real ripples: tilt the normal by the height field's slope; its curvature focuses light.
 vec2 rippleUv=(lake-rippleWindow.xy)*rippleWindow.z+.5;float rippleMask=rippleWindow.w*smoothstep(0.,.06,min(min(rippleUv.x,1.-rippleUv.x),min(rippleUv.y,1.-rippleUv.y)));float focus=0.;
 if(rippleMask>0.){float e=rippleTexel;float h0=texture2D(ripples,rippleUv).r,hl=texture2D(ripples,rippleUv-vec2(e,0.)).r,hr=texture2D(ripples,rippleUv+vec2(e,0.)).r,hd=texture2D(ripples,rippleUv-vec2(0.,e)).r,hu=texture2D(ripples,rippleUv+vec2(0.,e)).r;
 vec2 slope=vec2(hr-hl,hu-hd)*(rippleWindow.z/(2.*e))*rippleMask;vec3 dp1=dFdx(worldPosition),dp2=dFdy(worldPosition);vec2 duv1=dFdx(lake),duv2=dFdy(lake);float det=duv1.x*duv2.y-duv2.x*duv1.y;
 if(abs(det)>1e-9){vec3 Tu=(dp1*duv2.y-dp2*duv1.y)/det,Tv=(dp2*duv1.x-dp1*duv2.x)/det;N=normalize(N-(Tu*slope.x+Tv*slope.y)*9.);}
 focus=clamp(-(hl+hr+hd+hu-4.*h0)*90.*rippleMask,0.,1.);}
 float fresnel=pow(1.-max(0.,dot(N,V)),3.);float spec=pow(max(0.,dot(N,H)),160.);
 float caustic=pow(.5+.5*sin(lake.x*1.7+sin(lake.y*1.4+time)*1.4+time*.6),7.)*pow(.5+.5*sin(lake.y*1.2-time*.8),3.);
 vec3 color=mix(vec3(.27,.67,.58),vec3(.045,.32,.37),depth);color+=(caustic+focus*.9)*(1.-depth)*vec3(.12,.18,.10);color=mix(color,vec3(.69,.81,.68),fresnel*.48*(1.-.8*reflectionStrength));color+=spec*vec3(1.,.86,.55)*.7;
 float shore=(1.-smoothstep(.01,.045,abs(1.-r+.013*sin(time+lake.x))))*.4;float d=distance(lake,swimmer);float ripple=pow(.5+.5*sin(d*7.-time*5.),12.)*exp(-d*.65)*smoothstep(.5,1.2,d)*wake;color+=vec3(.65,.86,.78)*(shore+ripple*.4);
 vec3 sunDir=normalize(worldPosition-center);float daylight=1.-smoothstep(-.16,.16,dot(sunDir,shadeDirection));vec3 discoSpot=discoLight(sunDir,discoTime);float discoLit=max(discoSpot.r,max(discoSpot.g,discoSpot.b));daylight=mix(daylight,discoLit,disco);color*=mix(vec3(.12,.22,.4),vec3(1.),daylight)*mix(vec3(1.),discoSpot*1.4+vec3(.15),disco*discoLit);float distanceToEye=distance(cameraPosition,worldPosition);float fog=1.-exp(-pow(distanceToEye*.00205,2.));color=mix(color,mist,fog);
 if(reflectionStrength>0.){vec3 dN=(N-flatN)+(flatN-L)*.25;vec2 shift=vec2(dot(dN,vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0])),dot(dN,vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1])));vec2 mirrorUv=clamp(mirrored.xy/mirrored.w+shift*.08,.002,.998);vec3 mirrorColor=texture2D(reflection,mirrorUv).rgb*vec3(.8,.96,.94);color=mix(color,mirrorColor,reflectionStrength*mix(.1,.72,fresnel)*(.5+.5*depth)*(1.-fog*.5));}
 gl_FragColor=vec4(color,mix(.5,.9,depth));
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`,
  });
  const water = new T.Mesh(geometry, material);
  world.add(water);
  return { water, uniforms };
}
