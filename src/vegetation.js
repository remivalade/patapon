import * as T from './vendor/three.module.min.js';
import {RADIUS,CENTER,ROAD_AXIS,MEADOW,roadNormal,normalAt,orientation,surface,roadDistance,lakeRadius,surfaceBlocked} from './navigation.js';
import {daylightAt} from './landscape.js';

export const windTime={value:0};
export const FIELDS=[
 {n:roadNormal(1.35).addScaledVector(ROAD_AXIS,-.14).normalize(),radius:31,colors:['#bda0df','#aa84ca','#ded0ed']},
 {n:roadNormal(4.45).addScaledVector(ROAD_AXIS,.14).normalize(),radius:34,colors:['#f1ca71','#ffe8a1','#f7f0cd']},
 {n:roadNormal(5.35).addScaledVector(ROAD_AXIS,-.13).normalize(),radius:29,colors:['#e8a8b0','#f3c4cb','#fcdfc3']}
];
export function fieldDistance(n){return Math.min(...FIELDS.map(f=>Math.acos(T.MathUtils.clamp(n.dot(f.n),-1,1))*RADIUS-f.radius));}
export function groveAt(n){return Math.sin(n.x*12+n.z*7)*Math.cos(n.y*9-n.z*5)>-.15;}
export function addWind(material,{amount=.08,base=0,height=1,whole=false,worldSpace=false}={}){
 const previous=material.onBeforeCompile,cache=material.customProgramCacheKey.bind(material);const key=cache();
 material.userData.wind=true;
 material.onBeforeCompile=function(shader){previous.call(this,shader);shader.uniforms.windTime=windTime;
  shader.vertexShader='uniform float windTime;\n'+shader.vertexShader;
  const deformation=worldSpace?`vec3 windUp=normalize(vec3(0.,260.,0.)-transformed);vec3 windTangent=normalize(cross(windUp,vec3(.31,.17,.91)));transformed+=windTangent*sin(windTime*.8+dot(transformed,vec3(.08,.05,.07)))*smoothstep(3.,8.,260.-length(transformed-vec3(0.,260.,0.)))*.23;`:
   `vec3 windOrigin=vec3(0.);
   #ifdef USE_INSTANCING
   windOrigin=instanceMatrix[3].xyz;
   #endif
   float windPhase=dot(windOrigin,vec3(.08,.05,.07));
   float windWeight=${whole?'1.':`clamp((position.y-(${base.toFixed(3)}))/${height.toFixed(3)},0.,1.)`};
   transformed.x+=(sin(windTime*.85+windPhase)+.3*sin(windTime*1.7+windPhase*1.8))*${amount.toFixed(3)}*windWeight;`;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n'+deformation);
 };
 material.customProgramCacheKey=()=>key+'-wind-'+[amount,base,height,whole,worldSpace].join('-');return material;
}

export function buildForest(world,trees,collisions){
 const dummy=new T.Object3D(),trunks=new T.InstancedMesh(new T.CylinderGeometry(.4,.65,4.8,5),new T.MeshStandardMaterial({color:'#795c3d',roughness:1,flatShading:true}),trees.length);
 const groups=[[],[],[]];
 trees.forEach((tree,i)=>{const {n,s}=tree;const patch=Math.sin(n.x*8+n.y*7+n.z*10);tree.kind=patch>.35?1:patch<-.28?2:0;groups[tree.kind].push(tree);collisions.add(n,.7*s,tree.kind===1?10*s:9*s);dummy.position.copy(surface(n,2.4*s));dummy.quaternion.copy(orientation(n));dummy.scale.setScalar(s);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);});world.add(trunks);
 const crowns=[];
 for(let kind=0;kind<3;kind++){
  const geometry=kind===1?new T.ConeGeometry(1,2,7):new T.IcosahedronGeometry(1,kind===0?1:0);
  const material=addWind(new T.MeshStandardMaterial({color:'#ffffff',roughness:1,flatShading:true}),{amount:kind===1?.035:.055,base:-1,height:2});
  const foliage=new T.InstancedMesh(geometry,material,groups[kind].length*(kind===1?2:1));
  let i=0;for(const {n,s} of groups[kind]){dummy.quaternion.copy(orientation(n));const palette=kind===0?['#8fa857','#a8b76d','#72934d']:kind===1?['#547e65','#648d70','#759678']:['#d6ae59','#e3bf70','#bd9447'];
   for(let tier=0;tier<(kind===1?2:1);tier++){dummy.position.copy(surface(n,(kind===1?5.5+tier*2.3:6)*s));dummy.scale.set((kind===1?3.4-tier*.8:3.7)*s,(kind===1?2.7-tier*.5:kind===2?4.6:3.6)*s,(kind===1?3.4-tier*.8:3.5)*s);dummy.updateMatrix();foliage.setMatrixAt(i,dummy.matrix);foliage.setColorAt(i++,new T.Color(palette[i%3]));}
  }foliage.computeBoundingSphere();world.add(foliage);crowns.push(foliage);
 }return{trunks,crowns,groups};
}

export function buildFields(world,rand){
 const count=2100,dummy=new T.Object3D(),locations=[];
 const stemMaterial=addWind(new T.MeshStandardMaterial({color:'#6b894a',roughness:1}),{base:-.3,height:.6,amount:.1});
 const bloomMaterial=addWind(new T.MeshStandardMaterial({color:'#ffffff',roughness:1,flatShading:true,side:T.DoubleSide}),{whole:true,amount:.1});
 const stems=new T.InstancedMesh(new T.CylinderGeometry(.025,.035,.6,3),stemMaterial,count);
 const petalVertices=[];for(let j=0;j<5;j++){const a=j*Math.PI*2/5,point=(r,b)=>[Math.cos(b)*r,0,Math.sin(b)*r],root=point(.045,a),left=point(.24,a-.28),tip=point(.32,a),right=point(.24,a+.28);petalVertices.push(...root,...tip,...left,...root,...right,...tip);}const flowerGeometry=new T.BufferGeometry();flowerGeometry.setAttribute('position',new T.Float32BufferAttribute(petalVertices,3));flowerGeometry.computeVertexNormals();
 const petals=new T.InstancedMesh(flowerGeometry,bloomMaterial,count);const centerGeometry=new T.CircleGeometry(.085,6);centerGeometry.rotateX(-Math.PI/2);
 const centers=new T.InstancedMesh(centerGeometry,addWind(new T.MeshStandardMaterial({color:'#edc263',roughness:1}),{whole:true,amount:.1}),count);
 for(let i=0;i<count;i++){const f=FIELDS[i%3],x=new T.Vector3(1,0,0).projectOnPlane(f.n).normalize(),z=f.n.clone().cross(x),angle=rand()*Math.PI*2,r=Math.sqrt(rand())*f.radius,n=f.n.clone().multiplyScalar(RADIUS).addScaledVector(x,Math.cos(angle)*r).addScaledVector(z,Math.sin(angle)*r).normalize();
  if(roadDistance(n)<7||lakeRadius(n)<1.08||surfaceBlocked(n,3)){i--;continue;}locations.push(n);const scale=.7+rand()*.7;dummy.quaternion.copy(orientation(n));dummy.scale.setScalar(scale);dummy.position.copy(surface(n,.3*scale));dummy.updateMatrix();stems.setMatrixAt(i,dummy.matrix);dummy.position.copy(surface(n,.62*scale));dummy.updateMatrix();petals.setMatrixAt(i,dummy.matrix);petals.setColorAt(i,new T.Color(f.colors[Math.floor(rand()*f.colors.length)]));dummy.position.copy(surface(n,.69*scale));dummy.updateMatrix();centers.setMatrixAt(i,dummy.matrix);
 }world.add(stems,petals,centers);
 // Two animated wings and a small body, instanced across all meadows.
 const anchors=[MEADOW,...FIELDS.map(f=>f.n),normalAt(0,20)],butterflies=Array.from({length:30},(_,i)=>({anchor:anchors[i%anchors.length],phase:rand()*Math.PI*2,r:3+rand()*12}));
 const wingGeometry=new T.BufferGeometry();wingGeometry.setAttribute('position',new T.Float32BufferAttribute([0,0,0,.52,0,.23,.38,0,-.26,0,0,0,.38,0,-.26,.16,0,-.43],3));wingGeometry.computeVertexNormals();
 const wings=new T.InstancedMesh(wingGeometry,new T.MeshStandardMaterial({color:'#ffffff',side:T.DoubleSide,roughness:1}),butterflies.length*2),bodies=new T.InstancedMesh(new T.IcosahedronGeometry(1,0),new T.MeshStandardMaterial({color:'#66503b'}),butterflies.length);wings.frustumCulled=bodies.frustumCulled=false;
 for(let i=0;i<butterflies.length*2;i++)wings.setColorAt(i,new T.Color(['#f8d994','#f1ba96','#e6d9f4'][Math.floor(i/2)%3]));world.add(wings,bodies);
 function update(t,playerPosition,shade){windTime.value=t;let visible=0;
  butterflies.forEach((b,i)=>{const day=daylightAt(b.anchor,shade),near=surface(b.anchor).distanceTo(playerPosition)<85,scale=near?T.MathUtils.smoothstep(day,.15,.7):0;visible+=scale>0?1:0;
   if(scale===0){dummy.scale.setScalar(0);dummy.updateMatrix();wings.setMatrixAt(i*2,dummy.matrix);wings.setMatrixAt(i*2+1,dummy.matrix);bodies.setMatrixAt(i,dummy.matrix);return;}
   const x=new T.Vector3(1,0,0).projectOnPlane(b.anchor).normalize(),z=b.anchor.clone().cross(x),a=t*.24+b.phase,n=b.anchor.clone().multiplyScalar(RADIUS).addScaledVector(x,Math.cos(a)*b.r).addScaledVector(z,Math.sin(a*.7)*b.r).normalize(),q=orientation(n).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),-a));dummy.position.copy(surface(n,1.2+Math.sin(t*1.7+b.phase)*.28));
   for(const sign of [-1,1]){dummy.quaternion.copy(q).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),sign*(.3+Math.sin(t*21+b.phase)*.9)));dummy.scale.set(sign*scale,scale,scale);dummy.updateMatrix();wings.setMatrixAt(i*2+(sign===1?1:0),dummy.matrix);}dummy.quaternion.copy(q);dummy.scale.set(.055*scale,.06*scale,.25*scale);dummy.updateMatrix();bodies.setMatrixAt(i,dummy.matrix);
  });wings.visible=bodies.visible=visible>0;wings.instanceMatrix.needsUpdate=bodies.instanceMatrix.needsUpdate=true;
 }
 return{locations,stems,petals,centers,butterflies,wings,bodies,update};
}
