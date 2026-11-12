import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Trace curved light paths through a thin disk. The camera matrices keep the
// lens, shadow, and secondary disk images consistent while orbiting or zooming.
export function createBlackHolePass(camera, sharedUniforms) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      ...sharedUniforms,
      tDiffuse: { value: null },
      uSceneDepth: { value: null },
      uProjectionInverse: { value: camera.projectionMatrixInverse },
      uProjection: { value: camera.projectionMatrix },
      uCameraWorld: { value: camera.matrixWorld },
      uEye: { value: camera.position }
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      varying vec2 vUv;
      uniform sampler2D tDiffuse;
      uniform sampler2D uSceneDepth;
      uniform mat4 uProjectionInverse;
      uniform mat4 uProjection;
      uniform mat4 uCameraWorld;
      uniform vec3 uEye;
      uniform vec3 uCore;
      uniform vec3 uOuter;
      uniform float uTime;
      uniform float uPulse;
      uniform float uBirth;

      const float horizon = 1.10;
      const float innerDisk = 3.45;
      const float outerDisk = 10.0;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 cell = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(cell), hash(cell + vec2(1,0)), f.x),
          mix(hash(cell + vec2(0,1)), hash(cell + vec2(1,1)), f.x), f.y);
      }
      vec3 diskEmission(vec3 point, vec3 ray) {
        float radius = length(point.xz);
        float angle = atan(point.z, point.x);
        float orbit = angle - uTime * 0.8 / pow(radius * .3, 1.5);
        vec2 flowing = vec2(cos(orbit), sin(orbit)) * radius;
        float turbulence = noise(flowing * 3.0) * .55
          + noise(flowing * 8.0) * .28 + noise(flowing * 18.0) * .17;
        float strandPhase = radius * 48.0 + turbulence * 9.0;
        float finePhase = radius * 112.0 + turbulence * 15.0;
        float strands = .5 + .5 * sin(strandPhase) / (1.0 + fwidth(strandPhase));
        float fine = .5 + .5 * sin(finePhase) / (1.0 + fwidth(finePhase));
        float edge = smoothstep(innerDisk, innerDisk + .24, radius)
          * (1.0 - smoothstep(7.0, outerDisk, radius));
        float heat = pow(innerDisk / radius, 2.1);
        float texture = .38 + .42 * strands + .13 * fine + .4 * turbulence;
        vec3 velocity = normalize(vec3(-point.z, 0.0, point.x));
        float beta = .48 * sqrt(innerDisk / radius);
        float doppler = sqrt(1.0 - beta * beta) / (1.0 + beta * dot(velocity, normalize(ray)));
        float beaming = clamp(pow(doppler, 3.0), .30, 2.7);
        vec3 temperature = mix(uOuter * 1.1, uCore, pow(heat, .7));
        temperature = mix(temperature, vec3(1.0, .89, .72), heat * .4);
        return temperature * heat * texture * edge * beaming * 2.4 * (1.0 + uPulse * .4 + uBirth * .15);
      }
      vec3 acceleration(vec3 p, float angularMomentumSquared) {
        float r2 = dot(p, p);
        return -1.5 * horizon * angularMomentumSquared * p / (r2 * r2 * sqrt(r2));
      }
      void main() {
        vec4 background = texture2D(tDiffuse, vUv);
        float sceneDepth = texture2D(uSceneDepth, vUv).r;
        vec4 scenePoint = uProjectionInverse * vec4(vUv * 2.0 - 1.0, sceneDepth * 2.0 - 1.0, 1.0);
        float sceneDistance = length(scenePoint.xyz / scenePoint.w);
        vec4 view = uProjectionInverse * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
        vec3 ray = normalize(mat3(uCameraWorld) * (view.xyz / view.w));
        // Same inclination as the surrounding physical debris system.
        mat3 diskFrame = mat3(.991562, .129634, 0., -.129634, .991562, 0., 0., 0., 1.);
        vec3 origin = diskFrame * uEye;
        ray = diskFrame * ray;
        float along = dot(origin, ray);
        float impactSquared = dot(origin, origin) - along * along;
        if (along > 0.0 || impactSquared > 144.0) {
          gl_FragColor = background;
          return;
        }
        float angularMomentumSquared = dot(cross(origin, ray), cross(origin, ray));
        float start = max(0.0, -along - sqrt(max(324.0 - impactSquared, 0.0)));
        vec3 p = origin + ray * start;
        float distanceTraveled = start;
        vec3 radiance = vec3(0.0);
        float coverage = 0.0;
        float shadow = 0.0;
        bool terminated = false;
        for (int i = 0; i < 144; i++) {
          if (sceneDepth < .99999 && distanceTraveled >= sceneDistance) {
            gl_FragColor = background;
            return;
          }
          float radius = length(p);
          if (radius < horizon) {
            coverage = 1.0;
            shadow = 1.0;
            terminated = true;
            break;
          }
          if (radius > 19.0 && dot(p, ray) > 0.0) break;
          float stepSize = clamp((radius - horizon) * .115, .025, 1.5);
          vec3 previous = p;
          vec3 force = acceleration(p, angularMomentumSquared);
          p += ray * stepSize + .5 * force * stepSize * stepSize;
          ray += .5 * (force + acceleration(p, angularMomentumSquared)) * stepSize;
          distanceTraveled += length(p - previous);
          if (previous.y * p.y < 0.0) {
            vec3 hit = mix(previous, p, previous.y / (previous.y - p.y));
            float distanceToHit = distanceTraveled - length(p - hit);
            if (sceneDepth < .99999 && sceneDistance < distanceToHit) {
              gl_FragColor = background;
              return;
            }
            float diskRadius = length(hit.xz);
            if (diskRadius > innerDisk && diskRadius < outerDisk) {
              radiance = diskEmission(hit, ray);
              coverage = smoothstep(innerDisk, innerDisk + .12, diskRadius)
                * (1.0 - smoothstep(8.5, outerDisk, diskRadius));
              terminated = true;
              break;
            }
          }
        }
        // Light trapped near the photon orbit converges to darkness.
        if (!terminated && length(p) < 3.0) { coverage = 1.0; shadow = 1.0; }
        if (!terminated && coverage < .5) {
          vec3 outgoing = normalize(ray);
          vec3 worldRay = vec3(dot(diskFrame[0], outgoing), dot(diskFrame[1], outgoing), dot(diskFrame[2], outgoing));
          vec3 cameraRay = vec3(dot(uCameraWorld[0].xyz, worldRay), dot(uCameraWorld[1].xyz, worldRay), dot(uCameraWorld[2].xyz, worldRay));
          vec4 bent = uProjection * vec4(cameraRay, 0.0);
          vec2 bentUv = bent.xy / bent.w * .5 + .5;
          if (cameraRay.z < 0.0 && all(greaterThan(bentUv, vec2(0.0))) && all(lessThan(bentUv, vec2(1.0)))) {
            float lensWeight = 1.0 - smoothstep(3.0, 7.0, sqrt(impactSquared));
            // Screen-space lensing only samples the distant sky. Sampling a
            // nearby planet here would create a second, displaced copy of it.
            if (sceneDepth > .99999 && texture2D(uSceneDepth, bentUv).r > .99999) {
              background = mix(background, texture2D(tDiffuse, bentUv), lensWeight);
            }
          }
        }
        float impact = sqrt(angularMomentumSquared);
        float photon = exp(-abs(impact - horizon * 2.598) * 90.0) * .38;
        radiance += uCore * photon;
        vec3 color = mix(background.rgb, radiance, coverage);
        color += uCore * photon * (1.0 - coverage);
        gl_FragColor = vec4(color, 1.0 - shadow);
      }
    `
  });
  return new ShaderPass(material);
}
