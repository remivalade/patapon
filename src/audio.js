// Quiet, locally synthesized ambience. Audio starts only after the entrance tap.
export function createAmbience(){
  let context=null,master=null,wind=null,water=null,engine=null,sun=null;
  let muted=false,ready=false,lastUpdate=-1;
  function build(){
    const Context=window.AudioContext||window.webkitAudioContext;
    if(!Context)return false;
    context=new Context();master=context.createGain();master.gain.value=0;
    const limiter=context.createDynamicsCompressor();limiter.threshold.value=-15;limiter.knee.value=15;limiter.ratio.value=5;master.connect(limiter);limiter.connect(context.destination);
    const buffer=context.createBuffer(1,context.sampleRate*6,context.sampleRate),data=buffer.getChannelData(0);
    for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
    function noise(type,frequency,q){const source=context.createBufferSource();source.buffer=buffer;source.loop=true;const filter=context.createBiquadFilter();filter.type=type;filter.frequency.value=frequency;filter.Q.value=q;const gain=context.createGain();gain.gain.value=0;source.connect(filter);filter.connect(gain);gain.connect(master);source.start();return gain;}
    function tones(frequencies){const gain=context.createGain();gain.gain.value=0;gain.connect(master);for(const [frequency,volume] of frequencies){const oscillator=context.createOscillator(),level=context.createGain();oscillator.type='sine';oscillator.frequency.value=frequency;level.gain.value=volume;oscillator.connect(level);level.connect(gain);oscillator.start();}return gain;}
    wind=noise('lowpass',440,.45);water=noise('bandpass',1050,.7);
    engine=tones([[64,.65],[128,.22],[192,.08]]);sun=tones([[110,.48],[165,.2],[220,.1]]);
    ready=true;return true;
  }
  async function start(){try{if(!ready&&!build())return false;if(!muted)await context.resume();master.gain.setTargetAtTime(muted?0:.5,context.currentTime,.4);return true;}catch{return false;}}
  async function toggle(){muted=!muted;if(!ready)await start();if(context){if(!muted)try{await context.resume();}catch{}master.gain.setTargetAtTime(muted?0:.5,context.currentTime,.15);}return muted;}
  function update(t,lakeDistance,shipDistance,sunDistance,inside){if(!ready||context.state!=='running'||t-lastUpdate<.1)return;lastUpdate=t;const now=context.currentTime,near=(d,r)=>Math.max(0,1-d/r)**2;
    wind.gain.setTargetAtTime(inside?.035+.012*Math.sin(t*.19):0,now,.5);
    water.gain.setTargetAtTime(inside?near(lakeDistance,65)*(.14+.025*Math.sin(t*.9)):0,now,.35);
    engine.gain.setTargetAtTime(inside?near(shipDistance,34)*(.045+.004*Math.sin(t*1.2)):0,now,.35);
    sun.gain.setTargetAtTime(inside?near(sunDistance,190)*.045:0,now,.5);
  }
  async function visibility(hidden){if(!context)return;try{if(hidden)await context.suspend();else if(!muted)await context.resume();}catch{}}
  async function animal(kind){if(muted)return;if(!await start())return;const now=context.currentTime,duration=kind==='cow'?1.8:1.2;const oscillator=context.createOscillator(),envelope=context.createGain();oscillator.type='sawtooth';const base=kind==='cow'?100:230;oscillator.frequency.setValueAtTime(base*.8,now);oscillator.frequency.exponentialRampToValueAtTime(base*1.15,now+.3);oscillator.frequency.exponentialRampToValueAtTime(base*.72,now+duration);envelope.gain.setValueAtTime(0,now);envelope.gain.linearRampToValueAtTime(.13,now+.14);envelope.gain.setTargetAtTime(.001,now+duration*.6,.2);envelope.gain.linearRampToValueAtTime(0,now+duration);envelope.connect(master);
 for(const [hz,weight] of (kind==='cow'?[[420,.7],[850,.3]]:[[700,.65],[1400,.2]])){const filter=context.createBiquadFilter(),gain=context.createGain();filter.type='bandpass';filter.frequency.value=hz;filter.Q.value=3;gain.gain.value=weight;oscillator.connect(filter);filter.connect(gain);gain.connect(envelope);}
 const vibrato=context.createOscillator(),depth=context.createGain();vibrato.frequency.value=kind==='cow'?4:10;depth.gain.value=kind==='cow'?3:17;vibrato.connect(depth);depth.connect(oscillator.frequency);vibrato.start(now);oscillator.start(now);oscillator.stop(now+duration+.1);vibrato.stop(now+duration+.1);oscillator.onended=()=>{envelope.disconnect();};}
 return{start,toggle,update,visibility,animal,get muted(){return muted;}};
}
