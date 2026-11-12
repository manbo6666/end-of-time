import * as THREE from 'three';

export function createPlanets(parent, noiseGLSL) {
  const definitions = [
    { name: '霜蓝', kind: 0, size: .72, radius: 12.2, phase: 5.18, tilt: .35, node: .03, speed: .038, spin: .12, dark: '#153a58', light: '#9acdde', atmosphere: '#4bade0' },
    { name: '余烬', kind: 1, size: .57, radius: 11.8, phase: 4.05, tilt: .65, node: .1, speed: .046, spin: .085, dark: '#48261e', light: '#bc7150', atmosphere: '#c97c48' },
    { name: '金砂', kind: 2, size: .46, radius: 14, phase: 1.48, tilt: -.035, node: .08, speed: .027, spin: .18, dark: '#725134', light: '#dfc595', atmosphere: '#d8b675' },
    { name: '碧渊', kind: 3, size: .78, radius: 16.5, phase: 4.65, tilt: .55, node: -.15, speed: .019, spin: .105, dark: '#183f40', light: '#73b4a5', atmosphere: '#55b8b0' }
  ];
  const sphereGeometry = new THREE.SphereGeometry(1, 64, 40);
  const vertexShader = /* glsl */`
    varying vec3 vLocal;
    varying vec3 vWorld;
    varying vec3 vNormal;
    void main() {
      vLocal = position;
      vec4 world = modelMatrix * vec4(position, 1.0);
      vWorld = world.xyz;
      vNormal = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * world;
    }
  `;
  return definitions.map(definition => {
    const orbit = new THREE.Group();
    orbit.rotation.set(definition.tilt, 0, definition.node);
    parent.add(orbit);

    const points = [];
    for (let i = 0; i <= 256; i++) {
      const angle = i / 256 * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(angle) * definition.radius, 0, Math.sin(angle) * definition.radius));
    }
    const track = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({
      color: definition.atmosphere, transparent: true, opacity: .115, depthWrite: false
    }));
    orbit.add(track);

    const body = new THREE.Group();
    body.name = definition.name;
    body.scale.setScalar(definition.size);
    body.rotation.z = .22;
    orbit.add(body);
    const surface = new THREE.Mesh(sphereGeometry, new THREE.ShaderMaterial({
      uniforms: {
        uKind: { value: definition.kind },
        uDark: { value: new THREE.Color(definition.dark) },
        uLight: { value: new THREE.Color(definition.light) }
      },
      vertexShader,
      fragmentShader: /* glsl */`
        varying vec3 vLocal;
        varying vec3 vWorld;
        varying vec3 vNormal;
        uniform float uKind;
        uniform vec3 uDark;
        uniform vec3 uLight;
        ${noiseGLSL}
        void main() {
          vec3 p = normalize(vLocal);
          float continent = fbm(p * 4.5 + vec3(2.1, 0.0, 6.3));
          float detail = fbm(p * 24.0);
          vec3 albedo;
          vec3 emission = vec3(0.0);
          if (uKind < .5) {
            float ice = smoothstep(.43, .64, continent + abs(p.y) * .14);
            float fissure = 1.0 - smoothstep(.008, .035, abs(continent - .48));
            albedo = mix(uDark, uLight, ice) * (.7 + detail * .5);
            albedo = mix(albedo, uDark * .4, fissure * .5);
          } else if (uKind < 1.5) {
            albedo = mix(uDark, uLight, smoothstep(.30, .69, continent)) * (.55 + detail);
            float cracks = (1.0 - smoothstep(.004, .018, abs(continent - .47))) * smoothstep(.42, .7, detail);
            emission = vec3(1.0, .16, .025) * cracks * .55;
          } else {
            float swirl = fbm(p * vec3(5.0, 2.5, 5.0));
            float bands = .5 + .5 * sin(p.y * (uKind < 2.5 ? 34.0 : 21.0) + swirl * 7.0);
            albedo = mix(uDark, uLight, bands * .7 + detail * .3);
            float cloud = smoothstep(.61, .76, fbm(p * 10.0 + swirl));
            albedo = mix(albedo, uLight * 1.3, cloud * .55);
          }
          vec3 normal = normalize(vNormal);
          vec3 view = normalize(cameraPosition - vWorld);
          vec3 toCenter = normalize(-vWorld);
          float sunlight = max(dot(normal, toCenter), 0.0);
          float sky = max(dot(normal, normalize(vec3(-.4, .7, .4))), 0.0);
          float rim = pow(1.0 - max(dot(normal, view), 0.0), 4.0);
          vec3 color = albedo * (.08 + sunlight * 1.6);
          color += albedo * vec3(.35, .55, .8) * sky * .28;
          color += uLight * rim * .12 + emission;
          gl_FragColor = vec4(color, 1.0);
        }
      `
    }));
    body.add(surface);
    const atmosphere = new THREE.Mesh(sphereGeometry, new THREE.ShaderMaterial({
      uniforms: { uTint: { value: new THREE.Color(definition.atmosphere) } },
      vertexShader,
      fragmentShader: /* glsl */`
        varying vec3 vWorld;
        varying vec3 vNormal;
        uniform vec3 uTint;
        void main() {
          float edge = pow(1.0 - abs(dot(normalize(vNormal), normalize(cameraPosition - vWorld))), 3.5);
          float light = .2 + .8 * max(dot(normalize(vNormal), normalize(-vWorld)), 0.0);
          gl_FragColor = vec4(uTint * light, edge * .48);
        }
      `,
      transparent: true, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    atmosphere.scale.setScalar(1.045);
    body.add(atmosphere);

    if (definition.kind === 2) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.35, 2.22, 160, 1), new THREE.ShaderMaterial({
        uniforms: { uTint: { value: new THREE.Color('#d5bc8f') } },
        vertexShader: `varying vec2 vPoint;varying vec3 vWorld;void main(){vPoint=position.xy;vec4 world=modelMatrix*vec4(position,1.);vWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}`,
        fragmentShader: /* glsl */`
          varying vec2 vPoint;
          varying vec3 vWorld;
          uniform vec3 uTint;
          void main() {
            float radius = length(vPoint);
            float bands = .5 + .5 * sin(radius * 138.0);
            float gap = smoothstep(.018, .045, abs(radius - 1.79));
            float edge = smoothstep(1.35, 1.42, radius) * (1.0 - smoothstep(2.1, 2.22, radius));
            float opacity = (.24 + bands * .43) * gap * edge;
            if (opacity < .05) discard;
            gl_FragColor = vec4(uTint * (.7 + bands * .3), opacity);
          }
        `,
        transparent: true, side: THREE.DoubleSide, depthWrite: true
      }));
      ring.rotation.set(Math.PI / 2 - .32, .15, .25);
      body.add(ring);
    }
    return { ...definition, body, surface };
  });
}
