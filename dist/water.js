import * as T from './vendor/three.module.min.js';
import {RADIUS,CENTER,normalAt} from './navigation.js';
export function buildWater(world){
 const pos=[],uv=[],indices=[],rings=32,segments=96;
 for(let j=0;j<=rings;j++)for(let i=0;i<=segments;i++){const a=i/segments*Math.PI*2,r=j/rings,x=-29+Math.cos(a)*24*r,z=-15+Math.sin(a)*32*r;pos.push(...normalAt(x,z).multiplyScalar(RADIUS-.24).add(CENTER).toArray());uv.push(x,z);}
 for(let j=0;j<rings;j++)for(let i=0;i<segments;i++){const a=j*(segments+1)+i,b=a+segments+1;indices.push(a,b,a+1,b,b+1,a+1);}
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(pos,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
 const uniforms={time:{value:0},center:{value:CENTER.clone()},swimmer:{value:new T.Vector2(1000,1000)},wake:{value:0},mist:{value:new T.Color('#ced8c8')}};
 const material=new T.ShaderMaterial({uniforms,transparent:true,depthWrite:false,side:T.DoubleSide,
 vertexShader:`uniform float time;uniform vec3 center;varying vec2 lake;varying vec3 worldPosition;
 void main(){lake=uv;float r=length((uv-vec2(-29.,-15.))/vec2(24.,32.));float wave=(sin(uv.x*.54+time*.9)*sin(uv.y*.43-time*.65)*.055+sin(uv.x*.2+uv.y*.3+time*.7)*.025)*smoothstep(0.,.2,1.-r);vec3 p=position+normalize(center-position)*wave;worldPosition=p;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
 fragmentShader:`uniform float time;uniform vec3 center;uniform vec2 swimmer;uniform float wake;uniform vec3 mist;varying vec2 lake;varying vec3 worldPosition;
 void main(){float r=length((lake-vec2(-29.,-15.))/vec2(24.,32.));float depth=smoothstep(0.,.65,1.-r);vec3 N=normalize(cross(dFdx(worldPosition),dFdy(worldPosition)));if(dot(N,center-worldPosition)<0.)N=-N;vec3 V=normalize(cameraPosition-worldPosition),L=normalize(center-worldPosition),H=normalize(V+L);float fresnel=pow(1.-max(0.,dot(N,V)),3.);float spec=pow(max(0.,dot(N,H)),160.);
 float caustic=pow(.5+.5*sin(lake.x*1.7+sin(lake.y*1.4+time)*1.4+time*.6),7.)*pow(.5+.5*sin(lake.y*1.2-time*.8),3.);
 vec3 color=mix(vec3(.27,.67,.58),vec3(.045,.32,.37),depth);color+=caustic*(1.-depth)*vec3(.12,.18,.10);color=mix(color,vec3(.69,.81,.68),fresnel*.48);color+=spec*vec3(1.,.86,.55)*.7;
 float shore=(1.-smoothstep(.01,.045,abs(1.-r+.013*sin(time+lake.x))))*.4;float d=distance(lake,swimmer);float ripple=pow(.5+.5*sin(d*7.-time*5.),12.)*exp(-d*.65)*smoothstep(.5,1.2,d)*wake;color+=vec3(.65,.86,.78)*(shore+ripple*.4);
 float distanceToEye=distance(cameraPosition,worldPosition);float fog=1.-exp(-pow(distanceToEye*.00205,2.));color=mix(color,mist,fog);gl_FragColor=vec4(color,mix(.5,.9,depth));
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`});
 const water=new T.Mesh(geometry,material);world.add(water);return{water,uniforms};
}
