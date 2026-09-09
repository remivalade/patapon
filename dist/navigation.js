import * as T from './vendor/three.module.min.js';
export const RADIUS=260;
export const CENTER=new T.Vector3(0,RADIUS,0);
export const TOWER_HEIGHT=RADIUS-8;
export const TOWER_TURNS=10;
export function normalAt(x,z){const r=Math.hypot(x,z),a=r/RADIUS;return r<1e-8?new T.Vector3(0,-1,0):new T.Vector3(Math.sin(a)*x/r,-Math.cos(a),Math.sin(a)*z/r);}
export function chart(n){const a=Math.acos(T.MathUtils.clamp(-n.y,-1,1)),s=Math.hypot(n.x,n.z);return s<1e-8?{x:0,z:0}:{x:n.x/s*a*RADIUS,z:n.z/s*a*RADIUS};}
export function relief(n){const distance=Math.acos(T.MathUtils.clamp(-n.y,-1,1))*RADIUS;const blend=T.MathUtils.smoothstep(distance,115,220);return blend*(3+2*Math.sin(n.x*13+n.z*4)*Math.cos(n.y*11)+1.2*Math.sin(n.z*19+n.y*7));}
export function surface(n,height=0){return n.clone().multiplyScalar(RADIUS-relief(n)-height).add(CENTER);}
export function surfacePoint(x,z,height=0){return surface(normalAt(x,z),height);}
export function orientation(n){return new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),n.clone().negate());}
// Parallel transport preserves a straight course through every pole and seam.
export function advanceFrame(normal,forward,side,ahead,distance){const up=normal.clone().negate(),right=forward.clone().cross(up).normalize();const tangent=forward.clone().multiplyScalar(ahead).addScaledVector(right,side);const length=tangent.length();if(length<1e-8)return{normal:normal.clone(),forward:forward.clone()};tangent.divideScalar(length);const axis=normal.clone().cross(tangent).normalize();const q=new T.Quaternion().setFromAxisAngle(axis,distance*Math.min(1,length)/RADIUS);return{normal:normal.clone().applyQuaternion(q).normalize(),forward:forward.clone().applyQuaternion(q).normalize()};}
export function surfaceBlocked(n){if(n.y>-.8)return false;const {x,z}=chart(n);if(((x+29)/24)**2+((z+15)/32)**2<1)return true;if(x>21&&x<38&&z>-13&&z<5)return true;if(((x-49)/12)**2+((z-20)/10)**2<1)return true;return Math.hypot(x,z+49)<5.6;}
export function stairHeight(x,z,current){const r=Math.hypot(x,z);if(r<5.7||r>10.6)return null;let a=Math.atan2(z,x);if(a<0)a+=2*Math.PI;let best=null,diff=Infinity;for(let t=0;t<=TOWER_TURNS;t++){const h=(a/(2*Math.PI)+t)*TOWER_HEIGHT/TOWER_TURNS;if(h>TOWER_HEIGHT+.1)continue;const d=Math.abs(current-h);if(d<diff){best=h;diff=d;}}return diff<1.5?Math.min(TOWER_HEIGHT,best):null;}
export function towerStep(x,z,y){const h=stairHeight(x,z,y);if(h!==null)return{x,z,y:h};if(y>TOWER_HEIGHT-1.3&&Math.hypot(x,z)<13)return{x,z,y:TOWER_HEIGHT};return null;}
