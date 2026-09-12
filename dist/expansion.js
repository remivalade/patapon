import * as T from './vendor/three.module.min.js';
import {RADIUS,CENTER,TOWER_HEIGHT,ROAD_AXIS,MEADOW,roadNormal,normalAt,orientation,surface,surfacePoint,roadDistance,meadowDistance} from './navigation.js';
export function buildExpansion({world,mesh,mat,box,ball,cyl,beam,rand,towerGroup}){
 const dummy=new T.Object3D();
 // A closed great-circle road, gently following the relief.
 const positions=[],indices=[],N=720;
 for(let i=0;i<=N;i++){const n=roadNormal(i/N*Math.PI*2);for(const sign of [-1,1]){const edge=n.clone().multiplyScalar(Math.cos(5.2/RADIUS)).addScaledVector(ROAD_AXIS,Math.sin(sign*5.2/RADIUS));positions.push(...surface(edge,.16).toArray());}}
 for(let i=0;i<N;i++){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}const roadG=new T.BufferGeometry();roadG.setAttribute('position',new T.Float32BufferAttribute(positions,3));roadG.setIndex(indices);roadG.computeVertexNormals();mesh(roadG,new T.MeshStandardMaterial({color:'#8e9b8b',roughness:1,side:T.DoubleSide}),world);
 const markings=new T.InstancedMesh(new T.BoxGeometry(.2,.035,2.8),mat('#e8dcb5'),240);
 for(let i=0;i<240;i++){const t=i/240*Math.PI*2,n=roadNormal(t),f=roadNormal(t+.001).sub(n).normalize().projectOnPlane(n).normalize(),up=n.clone().negate();dummy.position.copy(surface(n,.19));dummy.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(up.clone().cross(f).normalize(),up,f));dummy.scale.set(1,1,1);dummy.updateMatrix();markings.setMatrixAt(i,dummy.matrix);}world.add(markings);
 // A colourful flower meadow beside the road.
 const mx=new T.Vector3(1,0,0).projectOnPlane(MEADOW).normalize(),mz=MEADOW.clone().cross(mx).normalize();
 function meadowNormal(x,z){return MEADOW.clone().multiplyScalar(RADIUS).addScaledVector(mx,x).addScaledVector(mz,z).normalize();}
 const flowerCount=1500,stems=new T.InstancedMesh(new T.CylinderGeometry(.035,.05,.55,4),mat('#63894c'),flowerCount),blooms=new T.InstancedMesh(new T.IcosahedronGeometry(.28,0),mat('#fff1b6'),flowerCount);
 for(let i=0;i<flowerCount;i++){const a=rand()*Math.PI*2,r=Math.sqrt(rand())*53,n=meadowNormal(Math.cos(a)*r,Math.sin(a)*r);if(roadDistance(n)<6){i--;continue;}dummy.quaternion.copy(orientation(n));dummy.position.copy(surface(n,.3));dummy.scale.setScalar(.75+rand()*.65);dummy.updateMatrix();stems.setMatrixAt(i,dummy.matrix);dummy.position.copy(surface(n,.65));dummy.scale.y=.4;dummy.updateMatrix();blooms.setMatrixAt(i,dummy.matrix);blooms.setColorAt(i,new T.Color(['#fff3bd','#ecc079','#eeb3c4','#bba8e6','#f0eee0'][i%5]));}world.add(stems,blooms);
 const animals=[];function animal(kind,x,z,index){const root=new T.Group(),cow=kind==='cow',legs=[],head=new T.Group();root.userData.kind=kind;world.add(root);
 const body=ball(root,0,cow?1.6:1.1,0,1,cow?'#f6f0db':'#ece6d0',1);body.scale.set(cow?1: .7,cow?.82:.68,cow?1.7:1.08);
 if(cow){for(const [x,y,z,s] of [[.86,1.8,.1,.48],[-.83,1.7,-.65,.5],[.1,2.35,-.45,.5]]){const p=ball(root,x,y,z,s,'#4b5047',0);p.scale.set(.8,.7,1.2);}}
 else{for(let i=0;i<11;i++){const a=i/11*Math.PI*2;ball(root,Math.cos(a)*.57,1.2+Math.sin(a)*.45,(rand()-.5)*1.45,.43,'#f5efd9',0);}}
 head.position.set(0,cow?1.85:1.25,cow?1.55:1.05);root.add(head);const skull=ball(head,0,0,0,cow?.59:.38,cow?'#f1ead9':'#68614f',1);skull.scale.z=1.25;
 const muzzle=ball(head,0,-.22,cow?.49:.3,cow?.42:.26,cow?'#dba89b':'#514b40',1);muzzle.scale.set(1,.65,.8);
 for(const sign of [-1,1]){const ear=ball(head,sign*(cow?.65:.47),.07,0,cow?.27:.22,cow?'#665f50':'#68614f');ear.scale.set(1.4,.35,.65);ball(head,sign*(cow?.4:.25),.09,cow?.35:.24,.06,'#242d26',1);if(cow){const horn=cyl(head,sign*.4,.58,-.04,.02,.1,.44,'#ccb991',5);horn.rotation.z=-sign*.3;}for(const zz of [-1,1]){const leg=new T.Group();leg.position.set(sign*(cow?.65:.45),cow?1.15:.8,zz*(cow?1.05:.68));cyl(leg,0,-.45,0,cow?.13:.095,cow?.15:.12,cow?.95:.68,cow?'#f2e9d4':'#61594a',5);box(leg,0,cow?-.94:-.76,.05,cow?.32:.24,.2,.35,'#454b40');root.add(leg);legs.push(leg);}}
 beam(root,[0,cow?1.9:1.4,cow?-1.7:-1],[0,cow?.9:.9,cow?-1.95:-1.3],cow?.06:.1,cow?'#ac9d80':'#e2d8bf');
 const a={root,head,legs,kind,x,z,index,angle:rand()*6.28,reaction:0,n:meadowNormal(x,z)};root.traverse(o=>o.userData.animal=a);animals.push(a);return a;}
 for(let i=0;i<5;i++)animal('cow',(i%3)*13,8+Math.floor(i/3)*16,i);
 for(let i=0;i<7;i++)animal('sheep',-5+(i%4)*11,-24+Math.floor(i/4)*13,i+5);
 function updateAnimals(t,dt,playerPosition){for(const a of animals){const grazing=Math.sin(t*.16+a.index*2)>.05;if(!grazing){a.angle+=dt*.15*Math.sin(t*.17+a.index);const nx=a.x+Math.sin(a.angle)*dt*.55,nz=a.z+Math.cos(a.angle)*dt*.55;if(Math.hypot(nx,nz)<43&&roadDistance(meadowNormal(nx,nz))>9){a.x=nx;a.z=nz;}else a.angle+=dt*1.4;}a.n=meadowNormal(a.x,a.z);a.root.position.copy(surface(a.n));a.root.quaternion.copy(orientation(a.n)).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),a.angle));a.head.rotation.x=a.reaction>t?-.18:grazing?.45+.08*Math.sin(t*.8):0;a.head.rotation.y=a.reaction>t?.15*Math.sin(t*5):0;if(playerPosition.distanceTo(a.root.position)<12){a.root.updateWorldMatrix(true,false);const look=a.root.worldToLocal(playerPosition.clone());a.head.rotation.y=T.MathUtils.clamp(Math.atan2(look.x,look.z),-.7,.7);a.head.rotation.x=-.05;}a.legs.forEach((leg,i)=>leg.rotation.x=grazing?0:Math.sin(t*3+i%2*Math.PI)*.18);}}
 // A compact hovering speeder, parked beside the cabin and the circuit.
 const bike=new T.Group();world.add(bike);const chassis=ball(bike,0,.5,0,1,'#a7784d',1);chassis.scale.set(.65,.4,2.4);box(bike,0,.85,-.3,.92,.3,1.4,'#514a3e');box(bike,0,1.05,.85,.65,.32,.6,'#788d82');
 for(const x of [-.54,.54]){beam(bike,[x,.4,1],[x,.35,4.2],.09,'#91a79b');box(bike,x,.35,3.8,.32,.1,1.6,'#c3b184');const engine=cyl(bike,x,.4,-1.5,.27,.32,.9,'#768981');engine.rotation.x=Math.PI/2;mesh(new T.SphereGeometry(.23,8,6),mat('#b4f5ef','#4bbba7'),bike,x,.4,-2);beam(bike,[x,.95,.9],[x*1.3,1.2,.4],.07,'#c2c5a8');}
 let bikeNormal=normalAt(64,10);bike.position.copy(surface(bikeNormal,1));bike.quaternion.copy(orientation(bikeNormal));bike.traverse(o=>o.userData.interaction='bike');
 // Glass lift shaft with a real travelling deck and a button on board.
 const glass=new T.MeshPhysicalMaterial({color:'#b4eee5',transparent:true,opacity:.15,roughness:.12,metalness:.05,clearcoat:1,depthWrite:false,side:T.DoubleSide});
 mesh(new T.CylinderGeometry(7.5,7.5,TOWER_HEIGHT,48,1,true,Math.PI/2+.43,Math.PI*2-.86),glass,towerGroup,0,TOWER_HEIGHT/2,0);
 for(const a of [.4,Math.PI*.75,Math.PI*1.25,Math.PI*1.6]){cyl(towerGroup,Math.sin(a)*7.5,TOWER_HEIGHT/2,Math.cos(a)*7.5,.12,.12,TOWER_HEIGHT,'#a6c9bd',6);}
 for(let y=0;y<=TOWER_HEIGHT;y+=21){const ring=mesh(new T.TorusGeometry(7.5,.1,5,48),mat('#c6dfcd'),towerGroup,0,y,0);ring.rotation.x=Math.PI/2;}
 cyl(towerGroup,0,-.2,0,8.7,8.7,.4,'#a8ba9e',32);
 const roomFloor=mesh(new T.RingGeometry(6.5,14,64),new T.MeshStandardMaterial({color:'#b8bb9c',side:T.DoubleSide,roughness:.65}),towerGroup,0,TOWER_HEIGHT,0);roomFloor.rotation.x=-Math.PI/2;
 const platform=new T.Group();towerGroup.add(platform);cyl(platform,0,-.15,0,6.4,6.4,.3,'#88aaa1',32);const rim=mesh(new T.TorusGeometry(6.25,.1,6,48),mat('#dcf7da','#58766d'),platform,0,.08,0);rim.rotation.x=-Math.PI/2;
 box(platform,3,1,0,.6,2,.6,'#648c83');const liftButton=ball(platform,3,2.12,0,.38,'#f9dc85',1);liftButton.material=mat('#ffe7a2','#bd944a');liftButton.userData.interaction='lift';
 const callButton=box(towerGroup,9,1.2,2.7,.65,1.9,.65,'#7c9d90');callButton.userData.interaction='call';ball(towerGroup,9,2.3,2.7,.3,'#f1da99').userData.interaction='call';
 const lift={height:0,target:0,platform,button:liftButton,moving:false};
 function updateLift(dt){const delta=lift.target-lift.height,step=dt*24;lift.height=Math.abs(delta)<step?lift.target:lift.height+Math.sign(delta)*step;lift.moving=Math.abs(lift.target-lift.height)>.001;platform.position.y=lift.height;}
 return{animals,updateAnimals,bike,lift,updateLift,meadowNormal};
}
