import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SavePass } from 'three/addons/postprocessing/SavePass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { createBlackHolePass } from './black-hole.js';
import { createPlanets } from './planets.js';

const $ = selector => document.querySelector(selector);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = matchMedia('(max-width: 760px)').matches;
const state = { chapter: 0, speed: 1, direction: 1, paused: false, time: 0, transition: null, collected: new Set(), sound: false };
const chapters = [
  { name: '余晖', accent: '#d6b585', rgb: '214,181,133', core: '#ffc078', outer: '#894728', nebula: '#164454', poem: '当最后一颗恒星熄灭，<br>谁来记住，光曾经到过这里。', object: '奇点 / SINGULARITY', sub: '光也无法逃离的地方', epoch: '宇宙暮年 · 第 10¹⁰⁰ 年', enter: '越过事件视界', message: '第一章 · 余晖 / 最后的光，仍在抵达。' },
  { name: '静默', accent: '#9ecbd9', rgb: '158,203,217', core: '#9ee9ff', outer: '#354f9a', nebula: '#162958', poem: '时间终于停止了流淌，<br>而你的凝望，让永恒有了形状。', object: '永恒 / THE GREAT SILENCE', sub: '一切已逝，一切仍在', epoch: '热寂之后 · 时间已失去意义', enter: '点亮下一次黎明', message: '第二章 · 静默 / 倾听宇宙没有声音的回响。' },
  { name: '新生', accent: '#e8bdac', rgb: '232,189,172', core: '#ffe3c2', outer: '#b34b75', nebula: '#3e255a', poem: '也许终点，只是另一场开始。<br>你手中的微光，足够诞生一个宇宙。', object: '初光 / THE FIRST LIGHT', sub: '从虚无中，重新开始', epoch: '新宇宙 · 第一个瞬间', enter: '回到时间的尽头', message: '第三章 · 新生 / 每一次结束，都藏着一颗种子。' }
];
const memories = [
  { title: '一束光的来信', text: '我穿过了一百三十八亿年的黑暗。\n不是为了照亮整个宇宙，\n只是想在消失之前，\n轻轻落在你的眼睛里。', label: '最初的光', position: new THREE.Vector3(-7.5, 3.1, 1) },
  { title: '星尘记得你', text: '构成你的每一颗原子，\n都曾在恒星的心脏里燃烧。\n你抬头仰望星空的时候，\n也是宇宙，在看它自己的故乡。', label: '星尘的记忆', position: new THREE.Vector3(7.8, 2.8, 1.5) },
  { title: '留给明天的种子', text: '当所有的钟都停止，\n当所有的名字都被遗忘，\n仍有某个温柔的瞬间，\n值得让宇宙，再发生一次。', label: '永恒的种子', position: new THREE.Vector3(4.6, -3.5, 4.5) }
];

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', alpha: false });
} catch (error) {
  $('#loading').remove();
  $('#error').hidden = false;
  throw error;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1 : 1.6));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
$('#universe').appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#04070c');
const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 240);
const homePosition = new THREE.Vector3(0, 3.5, 24.8);
camera.position.copy(homePosition);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.enablePan = false;
controls.minDistance = 8;
controls.maxDistance = 46;
controls.minPolarAngle = 0.12;
controls.maxPolarAngle = Math.PI - 0.12;
controls.rotateSpeed = 0.45;
controls.zoomSpeed = 0.65;
controls.autoRotate = !reducedMotion;
controls.autoRotateSpeed = 0.12;
const composer = new EffectComposer(renderer);
// Keep scene depth available to the lens so foreground planets can pass in
// front of the disk, while distant planets are hidden behind its shadow.
for (const target of [composer.renderTarget1, composer.renderTarget2]) {
  target.depthTexture = new THREE.DepthTexture(target.width, target.height, THREE.UnsignedIntType);
}
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.28, 0.08, 1.0);


const uniforms = {
  uTime: { value: 0 },
  uCore: { value: new THREE.Color(chapters[0].core) },
  uOuter: { value: new THREE.Color(chapters[0].outer) },
  uNebula: { value: new THREE.Color(chapters[0].nebula) },
  uBirth: { value: 0 },
  uPulse: { value: 0 }
};
const noise = /* glsl */`
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  float noise3(vec3 p) {
    vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    float n = i.x + i.y*57.0 + 113.0*i.z;
    return mix(mix(mix(hash(n),hash(n+1.0),f.x),mix(hash(n+57.0),hash(n+58.0),f.x),f.y),
      mix(mix(hash(n+113.0),hash(n+114.0),f.x),mix(hash(n+170.0),hash(n+171.0),f.x),f.y),f.z);
  }
  float fbm(vec3 p) {
    float v=0.0, a=0.5;
    for(int i=0;i<5;i++){v+=a*noise3(p);p=p*2.03+vec3(7.3,3.9,1.7);a*=0.5;}
    return v;
  }
`;

// A surrounding nebula gives the camera an actual volume to explore.
const sky = new THREE.Mesh(new THREE.SphereGeometry(110, 32, 24), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false,
  uniforms,
  vertexShader: `varying vec3 vDirection; void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader: /* glsl */`
    varying vec3 vDirection; uniform float uTime; uniform vec3 uNebula; uniform vec3 uOuter;
    ${noise}
    void main(){
      vec3 p=normalize(vDirection);
      float cloud=fbm(p*4.0+vec3(0.0,uTime*.001,0.0));
      float dust=fbm(p*13.0+cloud*2.0);
      float band=pow(max(0.0,1.0-abs(p.y*.9+p.x*.3+.12)),6.0);
      float density=pow(cloud,2.6)*band;
      vec3 color=vec3(.004,.007,.012)+uNebula*density*.65;
      color+=uOuter*pow(dust,4.0)*band*.09;
      color*=.5+smoothstep(.24,.66,dust)*.8;
      gl_FragColor=vec4(color,1.0);
    }`
}));
scene.add(sky);

let randomSeed = 48293;
function random() { randomSeed = (randomSeed * 16807) % 2147483647; return (randomSeed - 1) / 2147483646; }
const starCount = mobile ? 4200 : 7800;
const starPositions = new Float32Array(starCount * 3);
const starColors = new Float32Array(starCount * 3);
const starSizes = new Float32Array(starCount);
for (let i = 0; i < starCount; i++) {
  const azimuth = random() * Math.PI * 2;
  const cosine = random() * 2 - 1;
  const radius = 45 + random() * 55;
  const sine = Math.sqrt(1 - cosine * cosine);
  starPositions.set([Math.cos(azimuth) * sine * radius, cosine * radius, Math.sin(azimuth) * sine * radius], i * 3);
  const tint = random();
  starColors.set(tint < .6 ? [.57, .73, .88] : [1, .78, .51], i * 3);
  starSizes[i] = random() < .025 ? 3.4 + random() * 2 : .5 + random() * 1.7;
}
const starGeometry = new THREE.BufferGeometry();
starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
starGeometry.setAttribute('aSize', new THREE.BufferAttribute(starSizes, 1));
const stars = new THREE.Points(starGeometry, new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uTime: uniforms.uTime, uPixel: { value: renderer.getPixelRatio() } },
  vertexShader: `attribute vec3 color;attribute float aSize;varying vec3 vColor;uniform float uTime;uniform float uPixel;varying float vSize;void main(){vColor=color;vSize=aSize;vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=aSize*uPixel*(.85+.15*sin(uTime*.35+position.x));}`,
  fragmentShader: `varying vec3 vColor;varying float vSize;void main(){float d=length(gl_PointCoord-.5)*2.;float a=exp(-d*d*4.);if(d>1.)discard;gl_FragColor=vec4(vColor*(vSize>3.?2.:1.),a*.8);}`
}));
scene.add(stars);

const system = new THREE.Group();
system.rotation.z = -0.13;
scene.add(system);
const blackHolePass = createBlackHolePass(camera, uniforms);
const shadowSource = new SavePass();
const preserveShadow = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uOriginal: { value: null } },
  vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: `varying vec2 vUv;uniform sampler2D tDiffuse;uniform sampler2D uOriginal;void main(){vec4 original=texture2D(uOriginal,vUv);vec3 glow=texture2D(tDiffuse,vUv).rgb;gl_FragColor=vec4(mix(original.rgb,glow,original.a),1.);}`
});
// Bloom must not fill the captured-light shadow with light from nearby gas.
preserveShadow.uniforms.uOriginal.value = shadowSource.renderTarget.texture;
composer.addPass(blackHolePass);
composer.addPass(shadowSource);
composer.addPass(bloom);
composer.addPass(preserveShadow);
composer.addPass(new OutputPass());

// Dust follows differential orbital velocities, preserving depth and parallax.
const dustCount = mobile ? 3000 : 6500;
const dustPosition = new Float32Array(dustCount * 3);
const dustData = new Float32Array(dustCount * 3);
for (let i = 0; i < dustCount; i++) {
  const radius = 10.5 + random() * 5.0;
  dustPosition.set([radius, random() * Math.PI * 2, (random() - .5) * .4], i * 3);
  dustData.set([random(), random(), random()], i * 3);
}
const dustGeometry = new THREE.BufferGeometry();
dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPosition, 3));
dustGeometry.setAttribute('aData', new THREE.BufferAttribute(dustData, 3));
const dust = new THREE.Points(dustGeometry, new THREE.ShaderMaterial({
  uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: /* glsl */`
    uniform float uTime;uniform float uPulse;attribute vec3 aData;varying float vHeat;varying float vAlpha;
    void main(){float r=position.x;float a=position.y+uTime*.3/pow(r*.27,1.5);r+=uPulse*sin(aData.x*6.28)*.28;vec3 p=vec3(cos(a)*r,position.z+sin(a*3.+uTime*.1)*.04,sin(a)*r);vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp((.5+aData.y*1.7)*38./-mv.z,1.,4.5);vHeat=1.-smoothstep(2.5,12.,r);vAlpha=(.2+aData.z*.8)*(.4+vHeat*.6);}`,
  fragmentShader: `uniform vec3 uCore;uniform vec3 uOuter;varying float vHeat;varying float vAlpha;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;float a=exp(-d*d*4.);vec3 c=mix(uOuter,uCore,vHeat)*1.6;gl_FragColor=vec4(c,a*vAlpha*.16);}`
}));
system.add(dust);

const ruins = new THREE.Group();
system.add(ruins);
const stoneMaterial = new THREE.MeshStandardMaterial({ color: '#22272b', metalness: .72, roughness: .68, flatShading: true });
const bronzeMaterial = new THREE.MeshStandardMaterial({ color: '#6b5944', metalness: .85, roughness: .42 });
const stoneGeometry = new THREE.IcosahedronGeometry(1, 0);
const rocks = new THREE.InstancedMesh(stoneGeometry, stoneMaterial, 80);
const rockData = [];
const dummy = new THREE.Object3D();
for (let i = 0; i < 80; i++) {
  const a = random() * Math.PI * 2;
  const radius = 11.0 + random() * 5;
  const size = .035 + Math.pow(random(), 3) * .26;
  rockData.push({ a, radius, y: (random() - .5) * 3.2, size, rx: random() * 6, rz: random() * 6 });
}
ruins.add(rocks);
const astrolabe = new THREE.Group();
astrolabe.rotation.set(.16, .08, -.14);
system.add(astrolabe);
for (let i = 0; i < 9; i++) {
  const segment = new THREE.Mesh(new THREE.TorusGeometry(10.5, .036, 5, 72, .42), bronzeMaterial);
  segment.rotation.x = Math.PI / 2;
  segment.rotation.z = i * Math.PI * 2 / 9;
  astrolabe.add(segment);
}
const tickPositions = [];
for (let i = 0; i < 180; i++) {
  if (i % 39 > 32) continue;
  const a = i * Math.PI * 2 / 180;
  const r = 10.5;
  const outer = r + (i % 5 === 0 ? .22 : .09);
  tickPositions.push(Math.cos(a)*r,0,Math.sin(a)*r,Math.cos(a)*outer,0,Math.sin(a)*outer);
}
const tickGeometry = new THREE.BufferGeometry();
tickGeometry.setAttribute('position',new THREE.Float32BufferAttribute(tickPositions,3));
const ticks = new THREE.LineSegments(tickGeometry,new THREE.LineBasicMaterial({ color:'#947e5b',transparent:true,opacity:.48 }));
astrolabe.add(ticks);

const planets = createPlanets(system, noise);

const keyLight = new THREE.PointLight('#ffb66b', 160, 35, 2);
keyLight.position.set(0, 1.6, 0);
system.add(keyLight);
const fillLight = new THREE.DirectionalLight('#658ba7', 2.8);
fillLight.position.set(-6, 12, 4);
scene.add(fillLight, new THREE.AmbientLight('#7997ac', .28));
const rimLight = new THREE.DirectionalLight('#dfb47a', 2);
rimLight.position.set(3, -2, -6);
scene.add(rimLight);

const memoryObjects=memories.map((memory,index)=>{
  const group=new THREE.Group();group.position.copy(memory.position);
  const gem=new THREE.Mesh(new THREE.OctahedronGeometry(.12),new THREE.MeshBasicMaterial({color:'#ffdb99',toneMapped:false}));
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.26,.006,4,36),new THREE.MeshBasicMaterial({color:'#b8a37f',transparent:true,opacity:.6}));
  group.add(gem,ring);scene.add(group);
  const button=document.createElement('button');button.className='memory-marker';button.textContent='◇';button.dataset.label=memory.label;button.setAttribute('aria-label',`拾取回声 ${memory.label}`);button.addEventListener('click',()=>openMemory(index));$('#memory-markers').appendChild(button);
  return {group,gem,ring,button};
});

const shockwaves=[];
const shockGeometry=new THREE.RingGeometry(.94,1,160);
function pulse() {
  if(state.transition)return;
  const material=new THREE.MeshBasicMaterial({color:uniforms.uCore.value,side:THREE.DoubleSide,transparent:true,opacity:.8,blending:THREE.AdditiveBlending,depthWrite:false});
  const mesh=new THREE.Mesh(shockGeometry,material);mesh.rotation.x=-Math.PI/2;system.add(mesh);
  shockwaves.push({mesh,age:0});
  uniforms.uPulse.value=1;
  if(shockwaves.length>5){const old=shockwaves.shift();system.remove(old.mesh);old.mesh.material.dispose();}
  playChime(110,.4);
}

let audioContext, masterGain, droneFilter;
function createAudio() {
  audioContext=new AudioContext();
  masterGain=audioContext.createGain();masterGain.gain.value=0;masterGain.connect(audioContext.destination);
  droneFilter=audioContext.createBiquadFilter();droneFilter.type='lowpass';droneFilter.frequency.value=600;droneFilter.Q.value=.5;droneFilter.connect(masterGain);
  [55,82.41,110.12,164.81,220.2].forEach((frequency,index)=>{
    const oscillator=audioContext.createOscillator();oscillator.type=index<2?'sine':'triangle';oscillator.frequency.value=frequency;
    const gain=audioContext.createGain();gain.gain.value=index<2?.14:.018;
    oscillator.connect(gain);gain.connect(droneFilter);oscillator.start();
    const lfo=audioContext.createOscillator();lfo.frequency.value=.05+index*.017;
    const depth=audioContext.createGain();depth.gain.value=.012;lfo.connect(depth);depth.connect(gain.gain);lfo.start();
  });
  const buffer=audioContext.createBuffer(1,audioContext.sampleRate*4,audioContext.sampleRate);
  const data=buffer.getChannelData(0);let previous=0;
  for(let i=0;i<data.length;i++){previous=(previous+(random()*2-1)*.02)/1.02;data[i]=previous*2;}
  const source=audioContext.createBufferSource();source.buffer=buffer;source.loop=true;
  const gain=audioContext.createGain();gain.gain.value=.12;source.connect(gain);gain.connect(droneFilter);source.start();
}
async function toggleSound() {
  try{
    if(!audioContext)createAudio();
    await audioContext.resume();state.sound=!state.sound;
    masterGain.gain.setTargetAtTime(state.sound?.55:0,audioContext.currentTime,.5);
    $('#sound').setAttribute('aria-pressed',String(state.sound));$('#sound').setAttribute('aria-label',state.sound?'关闭宇宙环境音':'开启宇宙环境音');$('#sound span').textContent=state.sound?'声音开启':'声音关闭';
  }catch{toast('暂时无法开启声音，画面仍可自由探索。');}
}
function playChime(frequency,duration=2) {
  if(!state.sound||!audioContext)return;
  const oscillator=audioContext.createOscillator();const gain=audioContext.createGain();
  oscillator.type='sine';oscillator.frequency.setValueAtTime(frequency,audioContext.currentTime);oscillator.frequency.exponentialRampToValueAtTime(frequency*.5,audioContext.currentTime+duration);
  gain.gain.setValueAtTime(0,audioContext.currentTime);gain.gain.linearRampToValueAtTime(.18,audioContext.currentTime+.03);gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+duration);
  oscillator.connect(gain);gain.connect(masterGain);oscillator.start();oscillator.stop(audioContext.currentTime+duration+.1);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
}

let toastTimer;
function toast(message) { $('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),4000); }
function openMemory(index) {
  const memory=memories[index];state.collected.add(index);
  $('#memory-label').textContent=`ECHO 0${index+1} / 时间的回声`;
  $('#memory-title').textContent=memory.title;$('#memory-text').textContent=memory.text;
  $('#memory-count').textContent=`0${state.collected.size} / 03`;
  memoryObjects[index].button.classList.add('collected');memoryObjects[index].button.textContent='✧';
  $('#memory-dialog').showModal();playChime(440+index*110);
}
function closeMemory() {$('#memory-dialog').close();if(state.collected.size===3)toast('你拾起了所有回声。即使在时间尽头，也有值得珍藏的瞬间。');}
$('#memory-close').addEventListener('click',closeMemory);
$('#memory-dialog .close-dialog').addEventListener('click',closeMemory);
$('#help').addEventListener('click',()=>$('#help-dialog').showModal());
$('#help-close').addEventListener('click',()=>$('#help-dialog').close());
$('#help-dialog .close-dialog').addEventListener('click',()=>$('#help-dialog').close());
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}}));

function updateTimeUI() {
  const stopped=state.paused||state.speed===0;
  $('#pause').textContent=stopped?'▷':'Ⅱ';$('#pause').setAttribute('aria-label',stopped?'继续时间':'暂停时间');
  $('#speed-value').textContent=`${state.direction<0&&!stopped?'−':''}${(state.paused?0:state.speed).toFixed(1)}×`;
  $('#reverse').style.color=state.direction<0?'var(--gold)':'';
  $('#reverse').setAttribute('aria-pressed',String(state.direction<0));
  $('#speed').style.setProperty('--progress',`${state.speed/2*100}%`);
}
function togglePause(){if(state.speed===0){state.speed=1;$('#speed').value='1';state.paused=false;}else state.paused=!state.paused;updateTimeUI();}
function reverse(){state.direction*=-1;updateTimeUI();toast(state.direction<0?'时间开始倒流。让消失的，再次相逢。':'时间继续向前。');}
$('#pause').addEventListener('click',togglePause);$('#reverse').addEventListener('click',reverse);
$('#speed').addEventListener('input',event=>{state.speed=Number(event.target.value);state.paused=false;updateTimeUI();});
$('#sound').addEventListener('click',toggleSound);$('#pulse').addEventListener('click',pulse);
async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('此预览窗口无法全屏，可以在浏览器中打开作品。');}}
$('#fullscreen').addEventListener('click',fullscreen);
$('#home').addEventListener('click',event=>{event.preventDefault();camera.position.copy(homePosition);controls.target.set(0,0,0);controls.update();toast('已返回初始观测位置');});

function applyChapter(index) {
  state.chapter=index;const chapter=chapters[index];
  document.documentElement.style.setProperty('--gold',chapter.accent);document.documentElement.style.setProperty('--accent',chapter.rgb);
  $('#poem').innerHTML=chapter.poem;$('#object-name').textContent=chapter.object;$('#object-sub').textContent=chapter.sub;$('#epoch').textContent=chapter.epoch;$('#enter-label').textContent=chapter.enter;
  document.querySelectorAll('.chapter').forEach((button,i)=>{button.classList.toggle('active',i===index);button.setAttribute('aria-pressed',String(i===index));});
  toast(chapter.message);playChime(index===2?660:220);
}
function switchChapter(index,journey=false) {
  if(state.transition||index===state.chapter)return;
  if(reducedMotion){applyChapter(index);return;}
  state.transition={age:0,index,journey,switched:false,start:camera.position.clone()};controls.enabled=false;
  playChime(70,2.8);
}
document.querySelectorAll('.chapter').forEach(button=>button.addEventListener('click',()=>switchChapter(Number(button.dataset.chapter))));
$('#enter').addEventListener('click',()=>switchChapter((state.chapter+1)%3,true));

let pointerStart=null;
renderer.domElement.addEventListener('pointerdown',event=>{pointerStart={x:event.clientX,y:event.clientY,time:performance.now(),id:event.pointerId};});
renderer.domElement.addEventListener('pointerup',event=>{if(pointerStart&&event.pointerId===pointerStart.id&&Math.hypot(event.clientX-pointerStart.x,event.clientY-pointerStart.y)<6&&performance.now()-pointerStart.time<450)pulse();pointerStart=null;});
renderer.domElement.addEventListener('pointercancel',()=>{pointerStart=null;});
document.addEventListener('keydown',event=>{
  if(event.target instanceof HTMLInputElement||event.target instanceof HTMLTextAreaElement||event.target.isContentEditable||event.ctrlKey||event.metaKey||event.altKey||document.querySelector('dialog[open]'))return;
  if(event.code==='Space'&&event.target instanceof HTMLButtonElement)return;
  if(event.repeat)return;
  const key=event.key.toLowerCase();
  if(event.code==='Space'){event.preventDefault();togglePause();}
  else if(key==='r')reverse();else if(key==='m')toggleSound();else if(key==='f')fullscreen();else if(key==='g')pulse();
  else if(key==='h'){document.body.classList.toggle('ui-hidden');toast(document.body.classList.contains('ui-hidden')?'按 H 恢复观测界面':'观测界面已恢复');}
  else if(['1','2','3'].includes(key))switchChapter(Number(key)-1);
});

function resize() {
  const w=innerWidth,h=innerHeight;camera.aspect=w/h;camera.fov=w<=760?64:48;
  // Shift the vanishing point so the cosmic sculpture and typography share the frame.
  camera.setViewOffset(w,h,-w*(w<=760?.08:.145),-h*(w<=760?.15:0),w,h);
  camera.updateProjectionMatrix();renderer.setSize(w,h);composer.setSize(w,h);
}
addEventListener('resize',resize);resize();updateTimeUI();
renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();$('#error').hidden=false;});
renderer.domElement.addEventListener('webglcontextrestored',()=>location.reload());

const targetCore=new THREE.Color(),targetOuter=new THREE.Color(),targetNebula=new THREE.Color();
const projected=new THREE.Vector3();
const worldPosition=new THREE.Vector3();
let previousTime=performance.now(),elapsed=0,frameCount=0,fpsElapsed=0,lowFrames=0;
let firstFrame=true;
function animate(now) {
  requestAnimationFrame(animate);
  const delta=Math.max(0,Math.min((now-previousTime)/1000,.05));previousTime=now;
  if(document.hidden)return;
  elapsed+=delta;
  const running=state.paused?0:state.speed*state.direction;
  state.time+=delta*running;
  uniforms.uTime.value=state.time;
  uniforms.uPulse.value*=Math.exp(-delta*2.4);
  const chapter=chapters[state.chapter];
  const blend=1-Math.exp(-delta*1.5);
  uniforms.uCore.value.lerp(targetCore.set(chapter.core),blend);
  uniforms.uOuter.value.lerp(targetOuter.set(chapter.outer),blend);
  uniforms.uNebula.value.lerp(targetNebula.set(chapter.nebula),blend);
  uniforms.uBirth.value=THREE.MathUtils.lerp(uniforms.uBirth.value,state.chapter===2?1:0,blend);
  keyLight.color.copy(uniforms.uCore.value);
  controls.autoRotate=!state.paused&&state.speed!==0&&!reducedMotion&&!state.transition;
  controls.autoRotateSpeed=.12*running;
  controls.update(delta);
  astrolabe.rotation.y=state.time*.006;
  for (const planet of planets) {
    const angle = planet.phase + state.time * planet.speed;
    planet.body.position.set(Math.cos(angle) * planet.radius, 0, Math.sin(angle) * planet.radius);
    planet.surface.rotation.y = state.time * planet.spin;
  }
  rocks.rotation.y=state.time*.008;
  for(let i=0;i<rockData.length;i++){
    const rock=rockData[i];dummy.position.set(Math.cos(rock.a)*rock.radius,rock.y+Math.sin(state.time*.08+rock.a)*.15,Math.sin(rock.a)*rock.radius);
    dummy.rotation.set(rock.rx+state.time*.025,rock.a,rock.rz+state.time*.015);dummy.scale.set(rock.size,rock.size*(.7+i%3*.35),rock.size*.7);dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix);
  }
  rocks.instanceMatrix.needsUpdate=true;
  for(let i=shockwaves.length-1;i>=0;i--){const wave=shockwaves[i];wave.age+=delta;wave.mesh.scale.setScalar(2.5+wave.age*13);wave.mesh.material.opacity=Math.max(0,1-wave.age/2.5)*.55;if(wave.age>2.5){system.remove(wave.mesh);wave.mesh.material.dispose();shockwaves.splice(i,1);}}
  memoryObjects.forEach((object,index)=>{
    object.gem.rotation.y=state.time*.4+index;object.ring.rotation.set(state.time*.16,index+state.time*.13,0);
    object.group.position.y=memories[index].position.y+Math.sin(state.time*.25+index)*.22;
    object.group.getWorldPosition(worldPosition);projected.copy(worldPosition).project(camera);
    const x=(projected.x*.5+.5)*innerWidth,y=(-projected.y*.5+.5)*innerHeight;
    const occluded=worldPosition.clone().sub(camera.position).dot(camera.getWorldDirection(new THREE.Vector3()))<0;
    const visible=!occluded&&projected.z<1&&x>30&&x<innerWidth-65&&y>100&&y<innerHeight-160;
    object.button.style.left=`${x}px`;object.button.style.top=`${y}px`;object.button.style.visibility=visible?'visible':'hidden';
  });
  if(state.transition){
    const transition=state.transition;transition.age+=delta;const t=transition.age;const duration=2.8;
    const flash=Math.pow(Math.sin(Math.min(t/duration,1)*Math.PI),6);
    $('#transition').style.opacity=String(flash*.97);
    bloom.strength=.28+flash*.8;
    if(transition.journey){const zoom=Math.sin(Math.min(t/duration,1)*Math.PI);camera.position.copy(transition.start).multiplyScalar(1-zoom*.55);camera.lookAt(controls.target);}
    if(t>duration*.5&&!transition.switched){transition.switched=true;applyChapter(transition.index);}
    if(t>=duration){camera.position.copy(transition.start);state.transition=null;controls.enabled=true;$('#transition').style.opacity='0';bloom.strength=.28;}
  }
  if(frameCount%6===0)$('#clock').textContent=`T ${state.time<0?'−':'+'} ${Math.abs(state.time).toFixed(3).padStart(7,'0')}`;
  if(droneFilter&&state.sound)droneFilter.frequency.setTargetAtTime(state.chapter===1?260:state.chapter===2?950:600,audioContext.currentTime,1);
  camera.updateMatrixWorld();
  blackHolePass.uniforms.uSceneDepth.value = composer.readBuffer.depthTexture;
  composer.render();
  if(firstFrame){firstFrame=false;$('#loading').classList.add('loaded');setTimeout(()=>$('#loading').remove(),1200);}
  frameCount++;fpsElapsed+=delta;
  if(fpsElapsed>4){
    const fps=frameCount/fpsElapsed;
    if(fps<28)lowFrames++;else lowFrames=0;
    if(lowFrames>=2&&renderer.getPixelRatio()>.75){const ratio=Math.max(.75,renderer.getPixelRatio()-.25);renderer.setPixelRatio(ratio);composer.setPixelRatio(ratio);stars.material.uniforms.uPixel.value=ratio;resize();lowFrames=0;}
    frameCount=0;fpsElapsed=0;
  }
}
requestAnimationFrame(animate);
