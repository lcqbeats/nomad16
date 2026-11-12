  // ---------- Capture du son joué en direct (pour le looper) ----------
  const CAP_SECONDS = 60;
  let capRing = null, ringN = 0, capLatest = 0;
  function onCapture(f, l, r) {
    const n = l.length;
    const idx = f % ringN;
    const first = Math.min(n, ringN - idx);
    capRing[0].set(first === n ? l : l.subarray(0, first), idx);
    capRing[1].set(first === n ? r : r.subarray(0, first), idx);
    if (first < n) { capRing[0].set(l.subarray(first), 0); capRing[1].set(r.subarray(first), 0); }
    capLatest = f + n;
  }
  function extract(sF, len) {
    if (sF < capLatest - ringN || sF + len > capLatest) return null;
    const b = ctx.createBuffer(2, len, sr);
    const fade = Math.min(Math.floor(sr * 0.003), Math.floor(len / 4));
    for (let ch = 0; ch < 2; ch++) {
      const out = new Float32Array(len);
      const idx = sF % ringN;
      const first = Math.min(len, ringN - idx);
      out.set(capRing[ch].subarray(idx, idx + first));
      if (first < len) out.set(capRing[ch].subarray(0, len - first), first);
      for (let i = 0; i < fade; i++) { const g = i / fade; out[i] *= g; out[len - 1 - i] *= g; }
      b.copyToChannel(out, ch);
    }
    return b;
  }
  const WORKLET = `class Cap extends AudioWorkletProcessor{constructor(){super();this.B=1024;this.l=new Float32Array(this.B);this.r=new Float32Array(this.B);this.i=0;this.f=0;}
process(inputs){const inp=inputs[0];const L=inp&&inp[0];const R=inp&&(inp[1]||inp[0]);const n=L?L.length:128;if(this.i===0)this.f=currentFrame;
if(L){this.l.set(L,this.i);this.r.set(R,this.i);}else{this.l.fill(0,this.i,this.i+n);this.r.fill(0,this.i,this.i+n);}
this.i+=n;if(this.i>=this.B){this.port.postMessage({f:this.f,l:this.l,r:this.r},[this.l.buffer,this.r.buffer]);this.l=new Float32Array(this.B);this.r=new Float32Array(this.B);this.i=0;}return true;}}
registerProcessor('nomad-cap',Cap);
class Gate extends AudioWorkletProcessor{constructor(){super();this.env=0;this.g=0;this.open=false;this.th=Math.pow(10,-52/20);this.port.onmessage=e=>{this.th=Math.pow(10,e.data/20);};}
process(inputs,outputs){const i=inputs[0],o=outputs[0];if(!i||!i[0]){return true;}const n=i[0].length;
for(let s=0;s<n;s++){let v=0;for(let c=0;c<i.length;c++)v=Math.max(v,Math.abs(i[c][s]));this.env=Math.max(v,this.env*0.9995);
if(!this.open&&this.env>this.th)this.open=true;else if(this.open&&this.env<this.th*0.5)this.open=false;
this.g+=((this.open?1:0)-this.g)*(this.open?0.02:0.0008);for(let c=0;c<o.length;c++)o[c][s]=(i[c]||i[0])[s]*this.g;}return true;}}
registerProcessor('nomad-gate',Gate);
class Fx extends AudioWorkletProcessor{constructor(){super();this.N=(sampleRate*12)|0;this.b=[new Float32Array(this.N),new Float32Array(this.N)];this.mode=null;this.pend=null;this.mix=0;this.pos=0;this.rel=false;
this.port.onmessage=e=>{const m=e.data;if(m.type==='start')this.pend=m;else if(m.type==='stop'){this.pend=null;this.rel=true;}};}
rd(c,x){const N=this.N;let i=Math.floor(x);const f=x-i;i=((i%N)+N)%N;return this.b[c][i]*(1-f)+this.b[c][(i+1)%N]*f;}
process(inputs,outputs){const inp=inputs[0],out=outputs[0],n=out[0].length,N=this.N;
for(let s=0;s<n;s++){const fr=currentFrame+s,w=fr%N;
for(let c=0;c<2;c++){const ch=inp&&inp.length?(inp[c]||inp[0]):null;this.b[c][w]=ch?ch[s]:0;}
if(this.pend&&fr>=this.pend.at){const p=this.pend;this.pend=null;this.mode=p.mode;this.anchor=fr;this.seg=Math.max(64,p.seg|0);this.dur=Math.max(64,p.dur|0);this.pos=0;this.rel=false;this.steps=p.steps;this.stepLen=Math.max(64,p.stepLen|0);this.one=!!p.one;}
const tgt=this.mode&&!this.rel?1:0;this.mix+=(tgt-this.mix)*0.006;if(this.rel&&this.mix<0.001){this.mode=null;this.rel=false;this.mix=0;}
let ri=fr,g=1,live=false;
if(this.mode){const t=fr-this.anchor;
if(this.mode==='repeat'){const k=t%this.seg;ri=this.anchor+k;const xf=Math.min(96,this.seg>>3);g=k<xf?k/xf:(k>this.seg-xf?(this.seg-k)/xf:1);}
else if(this.mode==='reverse'){ri=this.anchor-1-t;if(t>N-4800)g=0;}
else if(this.mode==='tapestop'){const r=Math.max(0,1-t/this.dur);this.pos+=r*r;ri=this.anchor+this.pos;g=Math.min(1,r*8);}
else if(this.mode==='half'){ri=this.anchor+t*0.5;}
else if(this.mode==='gate'){const k=t%(this.seg*2);g=k<this.seg?Math.min(1,k/48,(this.seg-k)/48):0;live=true;}
else if(this.mode==='pattern'){const sl0=this.stepLen,bl=sl0*16,ns=this.steps.length,pl=sl0*ns;if(this.one&&t>=pl)this.rel=true;const T=t%pl,j=Math.min(ns-1,Math.floor(T/sl0)),p=T-j*sl0,st=this.steps[j],sl=sl0/(st.d||1),q=p%sl,r0=(st.r0===undefined?1:st.r0),r1=(st.r1===undefined?r0:st.r1);
let pos=r0*q+(r1-r0)*q*q/(2*sl);if(st.v)pos=sl*Math.abs(r0)-pos;g=(st.g===undefined?1:st.g)*Math.min(1,q/48,(sl-q)/48);if(st.s<0)live=true;else ri=this.anchor-bl+st.s*sl0+pos;
const f0=st.f||0,f1=(st.f1===undefined?f0:st.f1),fv=f0+(f1-f0)*(p/sl0);this.flt=fv;this.cr=st.x||0;}}
if(!this.mode||this.mode!=='pattern'){this.flt=0;this.cr=0;}
const fv=this.flt||0,ca=fv<0?1-Math.exp(-6.283*Math.min(18000,20000*Math.pow(2,fv*9))/sampleRate):1-Math.exp(-6.283*Math.min(8000,25*Math.pow(2,fv*8.5))/sampleRate);
if(!this.lp)this.lp=[0,0];
for(let c=0;c<2;c++){const dry=this.b[c][w];let wet=this.mode?(live?dry*g:this.rd(c,ri)*g):dry;
if(this.mode&&fv!==0){this.lp[c]+=ca*(wet-this.lp[c]);wet=fv<0?this.lp[c]:wet-this.lp[c];}else this.lp[c]=wet;
if(this.mode&&this.cr>0){const qq=Math.pow(2,15-this.cr*12);wet=Math.round(wet*qq)/qq;}
out[c][s]=dry*(1-this.mix)+wet*this.mix;}}
return true;}}
registerProcessor('nomad-fx',Fx);
class Scr extends AudioWorkletProcessor{constructor(){super();this.N=0;this.pos=0;this.vel=0;this.motor=false;this.rate=1;this.up=1e-4;this.dn=1e-4;this.hand=false;this.tp=0;this.tv=0;this.tl=0;this.g=0;this.gt=0;this.ph=null;this.pend=null;this.cnt=0;this.d=[0,0,0,0];
this.r0=0;this.r1=0;this.rn=0;this.ri=0;this.ct=false;this.push=null;this.pe=false;
this.port.onmessage=e=>{const m=e.data,t=m.type;if(t==='buf'){this.L=m.l;this.R=m.r;this.N=m.l.length;this.pos=m.cue;this.tp=m.cue;this.vel=0;this.ph=null;this.pend=null;}else if(t==='motor')this.motor=m.on;else if(t==='rate')this.rate=m.rate;else if(t==='times'){this.up=m.up;this.dn=m.dn;}else if(t==='hand'){this.hand=m.on;this.tp=this.pos;this.rn=0;this.ri=0;if(!m.on)this.ct=true;}else if(t==='tgt'){this.r0=this.tp;this.r1=m.pos;this.rn=Math.max(1,m.dur|0);this.ri=0;}else if(t==='gate')this.gt=m.open?1:0;else if(t==='seek'){this.pos=m.pos;this.tp=m.pos;}else if(t==='phrase')this.pend=m;else if(t==='stopph'){if(this.ph){this.pos=this.ph.base;this.tp=this.pos;this.vel=0;this.ph=null;}this.pend=null;this.pe=true;}else if(t==='push'){this.push=m.v;if(m.v===null)this.ct=true;}};}
rd(b,x){const N=this.N;let i=Math.floor(x);const f=x-i;i=((i%N)+N)%N;const y0=b[(i-1+N)%N],y1=b[i],y2=b[(i+1)%N],y3=b[(i+2)%N];return y1+0.5*f*(y2-y0+f*(2*y0-5*y1+4*y2-y3+f*(3*(y1-y2)+y3-y0)));}
process(inputs,outputs){const o=outputs[0],n=o[0].length,L=o[0],R=o[1];if(!this.N){L.fill(0);if(R)R.fill(0);return true;}let phEnd=false;
for(let s=0;s<n;s++){const fr=currentFrame+s;if(this.pend&&fr>=this.pend.at){const p=this.pend;this.pend=null;this.ph={segs:p.segs,i:0,t:0,base:p.base,loop:!!p.loop};this.pos=p.base;this.vel=0;}
let gate=this.gt;
if(this.ph){const ph=this.ph,sg=ph.segs[ph.i],u=ph.t/sg.d,v=sg.a*Math.sin(Math.PI*u);this.vel=v;this.pos+=v;const g=sg.g;gate=typeof g==='string'?(g.charAt(Math.min(g.length-1,Math.floor(u*g.length)))==='1'?1:0):(g?1:0);
if(++ph.t>=sg.d){ph.t=0;ph.i++;if(ph.i>=ph.segs.length){this.pos=ph.base;this.tp=ph.base;if(ph.loop){ph.i=0;}else{this.vel=0;this.ph=null;phEnd=true;}}}}
else if(this.hand){if(this.ri<this.rn){this.ri++;this.tp=this.r0+(this.r1-this.r0)*this.ri/this.rn;}const w=(this.tp-this.pos)*0.008;this.vel+=(w-this.vel)*0.15;this.pos+=this.vel;}
else if(this.push!==null){this.vel+=(this.push-this.vel)*0.006;this.pos+=this.vel;}
else{const tg=this.motor?this.rate:0;if(this.ct&&this.motor){const st=Math.abs(this.rate)/(0.012*sampleRate);if(this.vel<tg)this.vel=Math.min(tg,this.vel+st);else this.vel=Math.max(tg,this.vel-st);if(this.vel===tg)this.ct=false;}else{this.ct=false;if(this.vel<tg)this.vel=Math.min(tg,this.vel+this.up);else this.vel=Math.max(tg,this.vel-this.dn);}this.pos+=this.vel;}
this.g+=(gate-this.g)*0.025;
const a=this.rd(this.L,this.pos),b=this.rd(this.R,this.pos),d=this.d;const ya=a-d[0]+0.997*d[1];d[0]=a;d[1]=ya;const yb=b-d[2]+0.997*d[3];d[2]=b;d[3]=yb;L[s]=ya*this.g;if(R)R[s]=yb*this.g;}
if(this.pe){this.pe=false;phEnd=true;}this.cnt+=n;if(this.cnt>=512||phEnd){this.cnt=0;this.port.postMessage({pos:this.pos,vel:this.vel,phEnd:phEnd});}return true;}}
registerProcessor('nomad-scratch',Scr);
class Duck extends AudioWorkletProcessor{constructor(){super();this.env=0;this.pk=1e-3;this.armed=true;this.refr=0;this.d=0;this.atk=0;this.depth=0;this.relDec=Math.exp(-3/(0.3*sampleRate));
this.aE=1-Math.exp(-1/(0.0015*sampleRate));this.rE=Math.exp(-1/(0.03*sampleRate));this.pkD=Math.exp(-1/(1.5*sampleRate));this.aN=(0.004*sampleRate)|0;this.hits=0;
this.port.onmessage=e=>{const m=e.data;if(m.depth!==undefined)this.depth=m.depth;if(m.rel)this.relDec=Math.exp(-3/(m.rel*sampleRate));};}
process(inputs,outputs){const i=inputs[0],k=inputs[1],o=outputs[0];const n=o[0].length;
for(let s=0;s<n;s++){let kv=0;if(k&&k[0])for(let c=0;c<k.length;c++)kv=Math.max(kv,Math.abs(k[c][s]));
this.env=kv>this.env?this.env+(kv-this.env)*this.aE:this.env*this.rE;this.pk=Math.max(this.env,this.pk*this.pkD);if(this.refr>0)this.refr--;
if(this.env<0.3*this.pk)this.armed=true;
if(this.armed&&this.refr<=0&&this.env>0.004&&this.env>0.6*this.pk){this.armed=false;this.refr=(0.07*sampleRate)|0;this.atk=this.aN;this.hits++;}
if(this.atk>0){this.atk--;this.d+=(1-this.d)*0.02;}else this.d*=this.relDec;
const g=1-this.depth*this.d;for(let c=0;c<o.length;c++){const x=i&&i.length?(i[c]||i[0]):null;o[c][s]=x?x[s]*g:0;}}
return true;}}
registerProcessor('nomad-duck',Duck);
class Lofi extends AudioWorkletProcessor{constructor(){super();this.q=Math.pow(2,9);this.hold=4;this.c=0;this.v=[0,0];this.port.onmessage=e=>{const m=e.data;if(m.bits)this.q=Math.pow(2,m.bits-1);if(m.hold)this.hold=m.hold;};}
process(inputs,outputs){const i=inputs[0],o=outputs[0];if(!i||!i[0])return true;const n=o[0].length;
for(let s=0;s<n;s++){if(this.c<=0){for(let c=0;c<2;c++){const x=(i[c]||i[0])[s];this.v[c]=Math.round(x*this.q)/this.q;}this.c=this.hold;}this.c--;for(let c=0;c<o.length;c++)o[c][s]=this.v[c]||0;}return true;}}
registerProcessor('nomad-lofi',Lofi);
class DjLoop extends AudioWorkletProcessor{constructor(){super();this.N=(sampleRate*4)|0;this.b=[new Float32Array(this.N),new Float32Array(this.N)];this.w=0;this.on=false;this.len=(sampleRate*0.25)|0;this.rate=1;this.st=0;this.p=0;this.g=0;
this.port.onmessage=e=>{const m=e.data;if(m.len)this.len=Math.max(64,Math.min(this.N-1,m.len));if(m.rate)this.rate=m.rate;if(m.on!==undefined){if(m.on&&!this.on){this.st=(this.w-this.len+this.N)%this.N;this.p=0;}this.on=m.on;}};}
process(inputs,outputs){const i=inputs[0],o=outputs[0];const n=o[0].length,F=Math.min(256,this.len>>2);
for(let s=0;s<n;s++){for(let c=0;c<2;c++){const x=i&&i.length?(i[c]||i[0])[s]:0;if(!this.on)this.b[c][this.w]=x;}
this.g+=((this.on?1:0)-this.g)*0.01;let y=[0,0];
if(this.g>0.0005){const pi=Math.floor(this.p),fr=this.p-pi,e=Math.min(1,pi/F,(this.len-pi)/F);for(let c=0;c<2;c++){const a=this.b[c][(this.st+pi)%this.N],b=this.b[c][(this.st+pi+1)%this.N];y[c]=(a+(b-a)*fr)*e;}this.p+=this.rate;if(this.p>=this.len)this.p-=this.len;}
for(let c=0;c<o.length;c++){const x=i&&i.length?(i[c]||i[0])[s]:0;o[c][s]=x*(1-this.g)+y[c]*this.g;}
if(!this.on)this.w=(this.w+1)%this.N;}return true;}}
registerProcessor('nomad-djloop',DjLoop);`;
  let hasWorklet = false;
  async function setupCapture() {
    ringN = Math.floor(sr * CAP_SECONDS);
    capRing = [new Float32Array(ringN), new Float32Array(ringN)];
    const silent = ctx.createGain(); silent.gain.value = 0; silent.connect(ctx.destination);
    try {
      if (!ctx.audioWorklet) throw new Error("no worklet");
      const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
      await ctx.audioWorklet.addModule(url);
      hasWorklet = true;
      const node = new AudioWorkletNode(ctx, "nomad-cap", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: "explicit" });
      node.port.onmessage = e => onCapture(e.data.f, e.data.l, e.data.r);
      liveBus.connect(node); node.connect(silent);
    } catch (err) {
      const sp = ctx.createScriptProcessor(1024, 2, 2);
      let spF = null;
      sp.onaudioprocess = e => {
        // anciens Safari : pas de playbackTime, on compte les blocs
        const f = e.playbackTime !== undefined ? Math.round(e.playbackTime * sr) : (spF = spF === null ? Math.round(ctx.currentTime * sr) : spF + 1024);
        onCapture(f, e.inputBuffer.getChannelData(0).slice(), e.inputBuffer.getChannelData(1).slice());
      };
      liveBus.connect(sp); sp.connect(silent);
    }
  }

