import * as T from './vendor/three.module.min.js';
export const RADIUS=260;
export const CENTER=new T.Vector3(0,RADIUS,0);
export const TOWER_HEIGHT=RADIUS-8;

export function normalAt(x,z){const r=Math.hypot(x,z),a=r/RADIUS;return r<1e-8?new T.Vector3(0,-1,0):new T.Vector3(Math.sin(a)*x/r,-Math.cos(a),Math.sin(a)*z/r);}
export function chart(n){const a=Math.acos(T.MathUtils.clamp(-n.y,-1,1)),s=Math.hypot(n.x,n.z);return s<1e-8?{x:0,z:0}:{x:n.x/s*a*RADIUS,z:n.z/s*a*RADIUS};}
export function relief(n){const distance=Math.acos(T.MathUtils.clamp(-n.y,-1,1))*RADIUS;const blend=T.MathUtils.smoothstep(distance,115,220);return blend*(3+2*Math.sin(n.x*13+n.z*4)*Math.cos(n.y*11)+1.2*Math.sin(n.z*19+n.y*7))-lakeDepth(n);}
export function surface(n,height=0){return n.clone().multiplyScalar(RADIUS-relief(n)-height).add(CENTER);}
export function surfacePoint(x,z,height=0){return surface(normalAt(x,z),height);}
export function orientation(n){return new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),n.clone().negate());}
// Parallel transport preserves a straight course through every pole and seam.
export function advanceFrame(normal,forward,side,ahead,distance){const up=normal.clone().negate(),right=forward.clone().cross(up).normalize();const tangent=forward.clone().multiplyScalar(ahead).addScaledVector(right,side);const length=tangent.length();if(length<1e-8)return{normal:normal.clone(),forward:forward.clone()};tangent.divideScalar(length);const axis=normal.clone().cross(tangent).normalize();const q=new T.Quaternion().setFromAxisAngle(axis,distance*Math.min(1,length)/RADIUS);return{normal:normal.clone().applyQuaternion(q).normalize(),forward:forward.clone().applyQuaternion(q).normalize()};}
export function lakeRadius(n){if(n.y>-.85)return 10;const {x,z}=chart(n);return Math.sqrt(((x+29)/24)**2+((z+15)/32)**2);}
export function lakeDepth(n){const r=lakeRadius(n);return r<1?4*T.MathUtils.smoothstep(1-r,0,.65):0;}
export function surfaceBlocked(n,padding=0){if(n.y>-.8)return false;const {x,z}=chart(n);if(x>21-padding&&x<38+padding&&z>-13-padding&&z<5+padding)return true;return ((x-49)/(12+padding))**2+((z-20)/(10+padding))**2<1;}
export const ROAD_A=normalAt(73,32);
export const ROAD_B=new T.Vector3(0,0,-1).projectOnPlane(ROAD_A).normalize();
export const ROAD_AXIS=ROAD_A.clone().cross(ROAD_B).normalize();
export function roadNormal(t){return ROAD_A.clone().multiplyScalar(Math.cos(t)).addScaledVector(ROAD_B,Math.sin(t)).normalize();}
export const MEADOW=roadNormal(.69).addScaledVector(ROAD_AXIS,.085).normalize();
export function roadDistance(n){return Math.asin(Math.min(1,Math.abs(n.dot(ROAD_AXIS))))*RADIUS;}
export function meadowDistance(n){return Math.acos(T.MathUtils.clamp(n.dot(MEADOW),-1,1))*RADIUS;}
// Index obstacle footprints on the sphere; movement uses short swept substeps.
export class SurfaceCollisions{
 constructor(){this.cells=new Map();this.objects=[];this.cellSize=20;}
 add(n,radius,height){const c={n:n.clone(),radius,height};this.objects.push(c);const p=n.clone().multiplyScalar(RADIUS),d=radius+3;
 for(let x=Math.floor((p.x-d)/20);x<=Math.floor((p.x+d)/20);x++)for(let y=Math.floor((p.y-d)/20);y<=Math.floor((p.y+d)/20);y++)for(let z=Math.floor((p.z-d)/20);z<=Math.floor((p.z+d)/20);z++){const key=x+','+y+','+z;if(!this.cells.has(key))this.cells.set(key,[]);this.cells.get(key).push(c);}return c;}
 nearby(n){const p=n.clone().multiplyScalar(RADIUS);return this.cells.get(Math.floor(p.x/20)+','+Math.floor(p.y/20)+','+Math.floor(p.z/20))||[];}
 resolve(n,radius=.6,height=0){const result=n.clone();for(let pass=0;pass<4;pass++){let changed=false;for(const c of this.nearby(result)){if(height>c.height+.2)continue;const distance=result.distanceTo(c.n)*RADIUS,min=c.radius+radius;if(distance>=min)continue;let away=result.clone().addScaledVector(c.n,-result.dot(c.n));if(away.lengthSq()<1e-12)away=new T.Vector3(1,0,0).projectOnPlane(c.n);if(away.lengthSq()<1e-12)away.set(0,0,1);away.normalize();result.copy(c.n).multiplyScalar(Math.cos((min+.025)/RADIUS)).addScaledVector(away,Math.sin((min+.025)/RADIUS)).normalize();changed=true;}if(!changed)break;}return result;}
}
