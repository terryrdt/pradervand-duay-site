// Toiture 3D Pradervand & Duay SA
// Modèle : grandes ardoises rectangulaires posées à joints croisés et tenues par crochets,
// sous-couverture claire, lattage, rives et faîtage en métal gris, une ventilation.
// Le scroll dépose les ardoises rang par rang (elles montent et s'écartent en gardant
// leur alignement), montre les couches, puis repose tout du bas du pan jusqu'au faîte.
import * as THREE from 'three';

const DEG = Math.PI / 180;

// ---------------------------------------------------------------- dimensions (mètres)
export const ROOF = {
    L: 7.2,              // longueur couverte (le long du faîte)
    S: 3.0,              // demi-portée horizontale, du faîte au bord de l'avant-toit
    pitch: 34 * DEG,     // pente
    eave: 0.5,           // débord d'avant-toit
    gable: 0.3,          // débord de rive
    slateW: 0.40, slateH: 0.42, exposure: 0.175, slateT: 0.012,
    rafterDepth: 0.16,
    under: 0.03,         // panneau + sous-couverture
    counter: 0.03,       // contre-lattes
    batten: 0.03,        // lattes
};
const R = ROOF;
const COS = Math.cos(R.pitch), TAN = Math.tan(R.pitch);
const RISE = R.S * TAN;                      // hauteur du faîte au-dessus du bord d'avant-toit
const LS = R.S / COS;                        // longueur de rampant
const N_UNDER = R.under;                     // dessus de la sous-couverture
const N_COUNTER = N_UNDER + R.counter;       // dessus des contre-lattes
const N_BATTEN = N_COUNTER + R.batten;       // dessus des lattes : appui des ardoises
const N_SLATE = N_BATTEN + R.slateT * 2;     // dessus approximatif de la couverture
const WALL_X = R.L / 2 - R.gable;            // nu extérieur des pignons
const WALL_Z = R.S - R.eave;                 // nu extérieur des façades longues
const BASE_Y = -3.0;                         // bas de la maquette (fondu dans le fond)

// ---------------------------------------------------------------- timeline (scroll 0..1)
export const TIMELINE = {
    demolishStart: 0.15, demolishSpan: 0.23,
    rebuildStart: 0.66, rebuildSpan: 0.19,
    slateDur: 0.06,
};
const SLATE_LIFT = 1.7;                      // hauteur de la nappe d'ardoises déposées
const SPREAD_U = 0.16, SPREAD_V = 0.26;      // écartement de la grille (en proportion)

const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const clamp01 = t => Math.min(1, Math.max(0, t));
const ramp = (p, a, b) => clamp01((p - a) / (b - a));
// 0 → 1 entre a et b, puis 1 → 0 entre c et d
const pulse = (p, a, b, c, d) => easeInOut(ramp(p, a, b)) * (1 - easeInOut(ramp(p, c, d)));

function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ---------------------------------------------------------------- repère d'un pan
// Coordonnées locales d'un pan : u le long du faîte (x), v en montant le rampant depuis
// le bord d'avant-toit, n normale sortante. side 0 = pan avant (+z), 1 = pan arrière.
function slopeMatrix(side) {
    const inner = new THREE.Matrix4().compose(
        new THREE.Vector3(0, 0, R.S),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), R.pitch - Math.PI / 2),
        new THREE.Vector3(1, 1, 1));
    if (side === 0) return inner;
    return new THREE.Matrix4().makeRotationY(Math.PI).multiply(inner);
}
const SLOPES = [slopeMatrix(0), slopeMatrix(1)];
const SLOPE_Q = SLOPES.map(m => new THREE.Quaternion().setFromRotationMatrix(m));
const SLOPE_N = SLOPE_Q.map(q => new THREE.Vector3(0, 0, 1).applyQuaternion(q));
const SLOPE_UP = SLOPE_Q.map(q => new THREE.Vector3(0, 1, 0).applyQuaternion(q));
const SLOPE_ACROSS = SLOPE_Q.map(q => new THREE.Vector3(1, 0, 0).applyQuaternion(q));
function slopePoint(side, u, v, n, target = new THREE.Vector3()) {
    return target.set(u, v, n).applyMatrix4(SLOPES[side]);
}

// ---------------------------------------------------------------- textures procédurales
function canvasTexture(size, draw, { srgb = false, repeat = [1, 1] } = {}) {
    const c = document.createElement('canvas');
    c.width = size[0]; c.height = size[1];
    draw(c.getContext('2d'), c.width, c.height);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
    t.anisotropy = 4;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
}

// grain fin de l'ardoise rectangulaire (fibrociment), sans veinage
function slateBumpTexture() {
    const rand = rng(11);
    return canvasTexture([256, 256], (g, w, h) => {
        const img = g.createImageData(w, h);
        for (let i = 0; i < img.data.length; i += 4) {
            const v = 128 + (rand() - 0.5) * 46 + (rand() < 0.02 ? 30 : 0);
            img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
        }
        g.putImageData(img, 0, 0);
    }, { repeat: [3, 3] });
}

function woodTexture(seed, tint) {
    const rand = rng(seed);
    return canvasTexture([256, 64], (g, w, h) => {
        g.fillStyle = tint; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 46; i++) {
            const y = rand() * h;
            g.strokeStyle = `rgba(110,70,30,${0.06 + rand() * 0.14})`;
            g.lineWidth = 0.5 + rand() * 1.6;
            g.beginPath(); g.moveTo(0, y);
            for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + i) * 1.6);
            g.stroke();
        }
    }, { srgb: true });
}

// sous-couverture blanc bleuté, lés posés avec recouvrement
function membraneTexture() {
    const rand = rng(3);
    return canvasTexture([512, 512], (g, w, h) => {
        g.fillStyle = '#dbe3e9'; g.fillRect(0, 0, w, h);
        g.fillStyle = 'rgba(90,110,130,0.10)'; g.fillRect(0, h * 0.88, w, h * 0.05);
        g.strokeStyle = 'rgba(90,110,130,0.28)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(0, h * 0.88); g.lineTo(w, h * 0.88); g.stroke();
        for (let i = 0; i < 9; i++) {
            const x = rand() * w;
            const grad = g.createLinearGradient(x - 30, 0, x + 30, 0);
            grad.addColorStop(0, 'rgba(255,255,255,0)');
            grad.addColorStop(0.5, `rgba(120,140,160,${0.05 + rand() * 0.06})`);
            grad.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = grad; g.fillRect(x - 30, 0, 60, h);
        }
        const img = g.getImageData(0, 0, w, h);
        for (let i = 0; i < img.data.length; i += 4) {
            const n = (rand() - 0.5) * 6;
            img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
        }
        g.putImageData(img, 0, 0);
    }, { srgb: true });
}

function plasterBumpTexture() {
    const rand = rng(21);
    return canvasTexture([256, 256], (g, w, h) => {
        const img = g.createImageData(w, h);
        for (let i = 0; i < img.data.length; i += 4) {
            const v = 128 + (rand() - 0.5) * 70;
            img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
        }
        g.putImageData(img, 0, 0);
    }, { repeat: [3, 3] });
}

// UV à l'échelle réelle (1 unité de texture = `scale` mètres) pour une géométrie de boîte
function worldUV(geometry, scale = 1) {
    const pos = geometry.attributes.position, nor = geometry.attributes.normal;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
        const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
        let a, b;
        if (ax >= ay && ax >= az) { a = pos.getZ(i); b = pos.getY(i); }
        else if (ay >= az) { a = pos.getX(i); b = pos.getZ(i); }
        else { a = pos.getX(i); b = pos.getY(i); }
        uv[i * 2] = a / scale; uv[i * 2 + 1] = b / scale;
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return geometry;
}

// assemble plusieurs boîtes en une seule géométrie (petites pièces : crochets)
function mergeBoxes(boxes) {
    const pos = [], nor = [], idx = [];
    for (const [w, h, d, x, y, z] of boxes) {
        const b = new THREE.BoxGeometry(w, h, d);
        b.translate(x, y, z);
        const base = pos.length / 3;
        pos.push(...b.attributes.position.array);
        nor.push(...b.attributes.normal.array);
        idx.push(...Array.from(b.index.array, i => i + base));
        b.dispose();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    return g;
}

// ---------------------------------------------------------------- fond studio
// Fond anthracite avec un halo chaud qui suit le toit et un vignettage doux. Le même
// calcul sert au fond et au fondu du bas de la maquette : la jonction est invisible.
const STUDIO = {
    uBase: { value: new THREE.Vector3(0.105, 0.105, 0.108) },   // sRGB
    uGlow: { value: new THREE.Vector3(0.11, 0.09, 0.075) },
    uGlowPos: { value: new THREE.Vector2(0.7, 0.5) },
    uRes: { value: new THREE.Vector2(1, 1) },
    uFade: { value: new THREE.Vector2(BASE_Y + 0.2, -0.9) },
};
const STUDIO_GLSL = `
uniform vec3 uBase;
uniform vec3 uGlow;
uniform vec2 uGlowPos;
uniform vec2 uRes;
vec3 studioBg(vec2 fc) {
    vec2 uv = fc / uRes;
    float aspect = uRes.x / uRes.y;
    vec2 d = (uv - uGlowPos) * vec2(aspect, 1.0);
    float halo = exp(-dot(d, d) * 2.2);
    vec2 v = (uv - 0.5) * vec2(aspect, 1.0);
    float vignette = 1.0 - smoothstep(0.35, 1.3, length(v)) * 0.38;
    float grain = fract(sin(dot(fc, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
    return (uBase + uGlow * halo) * vignette + grain / 255.0;
}`;
function studioBackground() {
    const material = new THREE.ShaderMaterial({
        uniforms: { uBase: STUDIO.uBase, uGlow: STUDIO.uGlow, uGlowPos: STUDIO.uGlowPos, uRes: STUDIO.uRes },
        vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.9999, 1.0); }',
        fragmentShader: STUDIO_GLSL + '\nvoid main() { gl_FragColor = vec4(studioBg(gl_FragCoord.xy), 1.0); }',
        depthTest: false, depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    mesh.frustumCulled = false;
    mesh.renderOrder = -1000;
    return mesh;
}

function withFade(material) {
    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, STUDIO);
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying float vFadeY;')
            .replace('#include <project_vertex>', `#include <project_vertex>
                vec4 fadeWP = vec4(transformed, 1.0);
                #ifdef USE_INSTANCING
                fadeWP = instanceMatrix * fadeWP;
                #endif
                vFadeY = (modelMatrix * fadeWP).y;`);
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nuniform vec2 uFade;\nvarying float vFadeY;\n' + STUDIO_GLSL)
            .replace('#include <dithering_fragment>', `
                gl_FragColor.rgb = mix(studioBg(gl_FragCoord.xy), gl_FragColor.rgb, smoothstep(uFade.x, uFade.y, vFadeY));
                #include <dithering_fragment>`);
    };
    material.customProgramCacheKey = () => 'ped-fade';
    return material;
}

// ---------------------------------------------------------------- environnement
function studioEnvironment(renderer) {
    const studio = new THREE.Scene();
    studio.background = new THREE.Color('#1d1c1b');
    // studio photo : boîtes à lumière franches sur fond sombre, reflets nets
    const panels = [
        // w, h, x, y, z, couleur, intensité
        [9, 9, 0, 9, 0, '#fff6ea', 2.4],       // plafond lumineux
        [5, 2.4, -7, 3, 5, '#ffe2c4', 3.2],    // boîte chaude, avant gauche
        [1.2, 7, 7, 2, -3, '#d6e4ff', 3.0],    // bande froide, arrière droite
        [8, 0.8, 0, 2, -8, '#ffffff', 2.6],    // liseré arrière
        [2.4, 1.6, 6, 0.8, 6, '#ffcfa6', 1.6],
        [12, 4, 0, -6, 0, '#0e0d0c', 1.0],     // sol noir
    ];
    for (const [w, h, x, y, z, color, k] of panels) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
            new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
        m.position.set(x, y, z); m.lookAt(0, 0, 0);
        studio.add(m);
    }
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(studio, 0.035);
    studio.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    pmrem.dispose();
    return env.texture;
}

// ---------------------------------------------------------------- construction
export function createRoof(renderer) {
    const scene = new THREE.Scene();
    scene.environment = studioEnvironment(renderer);
    scene.add(studioBackground());
    const root = new THREE.Group();
    scene.add(root);
    const rand = rng(1984);

    // lumières de studio : principale chaude, deux contre-jours pour détacher la silhouette
    scene.add(new THREE.HemisphereLight('#e9e4da', '#241d18', 0.5));
    const sun = new THREE.DirectionalLight('#ffeedc', 3.0);
    sun.position.set(-6.5, 11, 8);
    sun.castShadow = true;
    const small = Math.min(window.innerWidth, window.innerHeight) < 700;
    sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
    Object.assign(sun.shadow.camera, { left: -7.5, right: 7.5, top: 7.5, bottom: -7.5, near: 2, far: 32 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.018;
    scene.add(sun);
    const rim = new THREE.DirectionalLight('#d4e2ff', 2.6);
    rim.position.set(7, 6, -8);
    scene.add(rim);
    const rimWarm = new THREE.DirectionalLight('#ffd2b0', 1.3);
    rimWarm.position.set(-8, 4, -6);
    scene.add(rimWarm);

    // matériaux
    const M = {
        slate: withFade(new THREE.MeshPhysicalMaterial({
            color: '#2c3035', roughness: 0.62, metalness: 0, clearcoat: 0.2, clearcoatRoughness: 0.45,
            bumpMap: slateBumpTexture(), bumpScale: 0.8, envMapIntensity: 1.0 })),
        hook: withFade(new THREE.MeshStandardMaterial({ color: '#141516', roughness: 0.4, metalness: 0.6 })),
        metal: withFade(new THREE.MeshStandardMaterial({
            color: '#c4c8cb', metalness: 0.85, roughness: 0.32, envMapIntensity: 1.1 })),
        membrane: withFade(new THREE.MeshStandardMaterial({ map: membraneTexture(), roughness: 0.6, envMapIntensity: 0.7 })),
        batten: withFade(new THREE.MeshStandardMaterial({ map: woodTexture(7, '#d9b27a'), roughness: 0.82 })),
        counter: withFade(new THREE.MeshStandardMaterial({ map: woodTexture(8, '#cfa36a'), roughness: 0.82 })),
        rafter: withFade(new THREE.MeshStandardMaterial({ map: woodTexture(9, '#b98a57'), roughness: 0.8 })),
        plaster: withFade(new THREE.MeshStandardMaterial({
            color: '#d3cfc8', roughness: 0.95, bumpMap: plasterBumpTexture(), bumpScale: 0.6 })),
    };
    const shadowed = (mesh, cast = true, receive = true) => { mesh.castShadow = cast; mesh.receiveShadow = receive; return mesh; };
    const inSlope = (side, mesh) => {
        const g = new THREE.Group(); g.matrixAutoUpdate = false; g.matrix.copy(SLOPES[side]);
        g.add(mesh);
        return g;
    };

    // ---------- groupes animés
    const G = {
        ridge: new THREE.Group(), verges: [new THREE.Group(), new THREE.Group()], vent: new THREE.Group(),
        battens: [new THREE.Group(), new THREE.Group()], counters: [new THREE.Group(), new THREE.Group()],
    };
    Object.values(G).flat().forEach(g => root.add(g));

    // ---------- bâtiment : un volume en pentagone (murs + pignons), crépi clair
    {
        const shape = new THREE.Shape([
            new THREE.Vector2(-WALL_Z, BASE_Y), new THREE.Vector2(WALL_Z, BASE_Y),
            new THREE.Vector2(WALL_Z, 0.18), new THREE.Vector2(0, 0.18 + WALL_Z * TAN), new THREE.Vector2(-WALL_Z, 0.18)]);
        const geo = new THREE.ExtrudeGeometry(shape, { depth: WALL_X * 2, bevelEnabled: false });
        geo.rotateY(Math.PI / 2);
        geo.translate(-WALL_X, 0, 0);
        worldUV(geo, 1);
        root.add(shadowed(new THREE.Mesh(geo, M.plaster)));
    }

    // ---------- structure : chevrons, sous-couverture, contre-lattes, lattes
    for (const side of [0, 1]) {
        const rafterGeo = worldUV(new THREE.BoxGeometry(0.08, LS + 0.05, R.rafterDepth), 1.2);
        for (let u = -R.L / 2 + 0.1; u <= R.L / 2 - 0.05; u += 0.62) {
            const m = shadowed(new THREE.Mesh(rafterGeo, M.rafter));
            m.position.set(u, LS / 2 - 0.025, -R.rafterDepth / 2);
            root.add(inSlope(side, m));
        }
        const mem = shadowed(new THREE.Mesh(worldUV(new THREE.BoxGeometry(R.L + 0.04, LS, R.under), 1.5), M.membrane));
        mem.position.set(0, LS / 2, R.under / 2);
        root.add(inSlope(side, mem));
        const cGeo = worldUV(new THREE.BoxGeometry(0.05, LS - 0.02, R.counter), 1.2);
        const cGroup = new THREE.Group(); cGroup.matrixAutoUpdate = false; cGroup.matrix.copy(SLOPES[side]);
        for (let u = -R.L / 2 + 0.1; u <= R.L / 2 - 0.05; u += 0.62) {
            const m = shadowed(new THREE.Mesh(cGeo, M.counter));
            m.position.set(u, LS / 2, N_UNDER + R.counter / 2);
            cGroup.add(m);
        }
        G.counters[side].add(cGroup);
        const bGeo = worldUV(new THREE.BoxGeometry(R.L, 0.05, R.batten), 1.2);
        const bGroup = new THREE.Group(); bGroup.matrixAutoUpdate = false; bGroup.matrix.copy(SLOPES[side]);
        for (let v = 0.12; v < LS - 0.04; v += R.exposure) {
            const m = shadowed(new THREE.Mesh(bGeo, M.batten));
            m.position.set(0, v, N_COUNTER + R.batten / 2);
            bGroup.add(m);
        }
        G.battens[side].add(bGroup);
    }

    // ---------- ardoises rectangulaires et leurs crochets (deux InstancedMesh, mêmes matrices)
    const slateGeo = (() => {
        const w = R.slateW / 2 - 0.003, h = R.slateH;
        const shape = new THREE.Shape();
        shape.moveTo(-w, 0); shape.lineTo(w, 0); shape.lineTo(w, h); shape.lineTo(-w, h); shape.closePath();
        const g = new THREE.ExtrudeGeometry(shape, {
            depth: R.slateT - 0.004, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1 });
        g.translate(0, 0, 0.002);
        return g;
    })();
    // crochet : tige posée sur l'ardoise du dessous, qui remonte et coiffe le pied de l'ardoise
    const hookGeo = mergeBoxes([
        [0.02, 0.05, 0.004, 0, -0.024, 0.009],
        [0.02, 0.004, 0.012, 0, -0.002, 0.012],
        [0.02, 0.016, 0.004, 0, 0.007, R.slateT + 0.004],
    ]);
    const slates = [];
    const rows = Math.ceil((LS - 0.05 + 0.04) / R.exposure);
    for (const side of [0, 1]) {
        for (let r = 0; r < rows; r++) {
            const vb = -0.04 + r * R.exposure;
            const edges = [-R.L / 2];
            let x = -R.L / 2 + (r % 2 ? R.slateW / 2 : R.slateW);
            while (x < R.L / 2 - 0.02) { edges.push(x); x += R.slateW; }
            edges.push(R.L / 2);
            for (let k = 0; k < edges.length - 1; k++) {
                const a = edges[k], b = edges[k + 1];
                slates.push({
                    side, row: r, u: (a + b) / 2, vb,
                    sx: (b - a) / R.slateW, sy: Math.min(1, (LS + 0.02 - vb) / R.slateH),
                    seed: rand(), seed2: rand(),
                });
            }
        }
    }
    const slateMesh = shadowed(new THREE.InstancedMesh(slateGeo, M.slate, slates.length));
    const hookMesh = shadowed(new THREE.InstancedMesh(hookGeo, M.hook, slates.length), true, false);
    for (const mesh of [slateMesh, hookMesh]) {
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false;
        root.add(mesh);
    }
    {
        const col = new THREE.Color();
        const tiltAxis = new THREE.Vector3(1, 0, 0);
        slates.forEach((s, i) => {
            const l = 0.9 + s.seed * 0.2;
            slateMesh.setColorAt(i, col.setRGB(l, l, l * (1.0 + s.seed2 * 0.04)));
            // pose : pied appuyé sur l'ardoise du rang inférieur, tête sur la latte
            const lift = R.slateT * 0.9;
            const tilt = -Math.atan2(lift, R.slateH * s.sy);
            s.baseQ = SLOPE_Q[s.side].clone().multiply(new THREE.Quaternion().setFromAxisAngle(tiltAxis, tilt));
            s.basePos = slopePoint(s.side, s.u, s.vb, N_BATTEN + lift);
            // place dans la nappe déposée : même grille, élargie autour du centre du pan
            s.spread = new THREE.Vector3()
                .addScaledVector(SLOPE_ACROSS[s.side], s.u * SPREAD_U)
                .addScaledVector(SLOPE_UP[s.side], (s.vb + R.exposure - LS / 2) * SPREAD_V)
                .addScaledVector(SLOPE_N[s.side], SLATE_LIFT);
            // ordre de dépose : rang par rang depuis le faîte, chaque rang de gauche à droite ;
            // la repose suit l'ordre du couvreur, du bas du pan vers le faîte
            const fromTop = (rows - 1 - s.row) / (rows - 1);
            const uN = (s.u + R.L / 2) / R.L;
            const wave = s.side === 0 ? uN : 1 - uN;
            s.dStart = TIMELINE.demolishStart + fromTop * TIMELINE.demolishSpan + wave * 0.03;
            s.rStart = TIMELINE.rebuildStart + (s.row / (rows - 1)) * TIMELINE.rebuildSpan + (1 - wave) * 0.03;
        });
        slateMesh.instanceColor.needsUpdate = true;
    }

    // ---------- ferblanterie en métal gris : faîtage, rives, ventilation
    {
        const len = R.L + 0.1;
        const plateGeo = new THREE.BoxGeometry(len, 0.24, 0.006);
        for (const side of [0, 1]) {
            const p = shadowed(new THREE.Mesh(plateGeo, M.metal));
            p.position.set(0, LS - 0.1, N_SLATE + 0.005);
            G.ridge.add(inSlope(side, p));
        }
        const roll = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, len, 16), M.metal));
        roll.rotation.z = Math.PI / 2;
        roll.position.set(0, RISE + N_SLATE / COS - 0.015, 0);
        G.ridge.add(roll);
        var vergeParts = [];
        const topGeo = new THREE.BoxGeometry(0.13, LS + 0.06, 0.006);
        const faceGeo = new THREE.BoxGeometry(0.006, LS + 0.06, N_SLATE + R.rafterDepth + 0.1);
        for (const side of [0, 1]) {
            for (const end of [-1, 1]) {
                const top = shadowed(new THREE.Mesh(topGeo, M.metal));
                top.position.set(end * (R.L / 2 - 0.045), LS / 2 - 0.01, N_SLATE + 0.006);
                const face = shadowed(new THREE.Mesh(faceGeo, M.metal));
                face.position.set(end * (R.L / 2 + 0.02), LS / 2 - 0.01, (N_SLATE - R.rafterDepth - 0.1) / 2 + 0.004);
                G.verges[side].add(inSlope(side, top), inSlope(side, face));
                for (const mesh of [top, face]) vergeParts.push({ side, mesh, x: mesh.position.x, end });
            }
            // bord d'avant-toit : même tôle grise, qui masque les abouts de chevrons
            const eave = shadowed(new THREE.Mesh(new THREE.BoxGeometry(R.L + 0.05, 0.006, N_SLATE + R.rafterDepth + 0.08), M.metal));
            eave.position.set(0, -0.045, (N_SLATE - R.rafterDepth - 0.08) / 2);
            G.verges[side].add(inSlope(side, eave));
        }
        // ventilation : tube rond et sa platine, comme sur le chantier de référence
        const u = -1.1, v = 3.05;
        const plate = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 0.006), M.metal));
        plate.position.set(u, v, N_SLATE + 0.004);
        G.vent.add(inSlope(0, plate));
        const base = slopePoint(0, u, v, N_SLATE);
        const pipe = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.62, 24), M.metal));
        pipe.position.set(base.x, base.y + 0.24, base.z);
        const cap = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.05, 24), M.metal));
        cap.position.set(base.x, base.y + 0.58, base.z);
        G.vent.add(pipe, cap);
    }

    // ---------------------------------------------------------------- animation
    const tmpM = new THREE.Matrix4(), tmpP = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3();
    const kickAxis = new THREE.Vector3(1, 0, 0), kickQ = new THREE.Quaternion();
    let lastKey = '';
    const state = { removed: 0, total: slates.length };

    function setSlates(p, time) {
        const floating = p > TIMELINE.demolishStart && p < TIMELINE.rebuildStart + TIMELINE.rebuildSpan + 0.1;
        const key = floating ? '' : p.toFixed(5);
        if (key && key === lastKey) return;
        lastKey = key;
        let removed = 0;
        for (let i = 0; i < slates.length; i++) {
            const s = slates[i];
            const d = clamp01((p - s.dStart) / TIMELINE.slateDur);
            const r = clamp01((p - s.rStart) / TIMELINE.slateDur);
            const o = easeInOut(d) * (1 - easeInOut(r));
            if (o > 0.5) removed++;
            tmpS.set(s.sx, s.sy, 1);
            if (o <= 0) {
                tmpM.compose(s.basePos, s.baseQ, tmpS);
            } else {
                // l'ardoise monte et s'écarte de ses voisines en gardant sa place dans la grille ;
                // une légère bascule pendant le trajet, nulle au départ et à l'arrivée
                tmpP.copy(s.basePos).addScaledVector(s.spread, o);
                tmpP.addScaledVector(SLOPE_N[s.side], Math.sin(time * 0.6) * 0.025 * o * o);
                kickQ.setFromAxisAngle(kickAxis, Math.sin(Math.PI * o) * 0.14);
                tmpQ.copy(s.baseQ).multiply(kickQ);
                tmpM.compose(tmpP, tmpQ, tmpS);
            }
            slateMesh.setMatrixAt(i, tmpM);
            hookMesh.setMatrixAt(i, tmpM);
        }
        slateMesh.instanceMatrix.needsUpdate = true;
        hookMesh.instanceMatrix.needsUpdate = true;
        state.removed = removed;
    }

    // décalages des couches : retrait / vue éclatée / repose
    function setLayers(p) {
        // ferblanterie déposée avant les ardoises, reposée après
        const ridge = pulse(p, 0.115, 0.165, 0.94, 0.98);
        G.ridge.position.set(0, ridge * 1.3, 0);
        const vent = pulse(p, 0.12, 0.17, 0.9, 0.94);
        G.vent.position.copy(SLOPE_N[0]).multiplyScalar(vent * 1.05);
        const verge = pulse(p, 0.13, 0.18, 0.92, 0.96);
        for (const side of [0, 1]) {
            G.verges[side].position.copy(SLOPE_N[side]).multiplyScalar(verge * 1.0);
            // vue éclatée : lattes et contre-lattes se détachent de la sous-couverture
            const ex = pulse(p, 0.42, 0.50, 0.60, 0.655);
            G.battens[side].position.copy(SLOPE_N[side]).multiplyScalar(ex * 0.5);
            G.counters[side].position.copy(SLOPE_N[side]).multiplyScalar(ex * 0.24);
        }
        // les rives s'écartent vers l'extérieur, comme les ardoises
        for (const part of vergeParts) part.mesh.position.x = part.x + part.end * verge * (R.L / 2) * SPREAD_U;
    }

    // fond studio : halo (couleur sRGB 0..1, position 0..1 depuis le bas gauche), taille du tampon
    function setStudio({ glow, pos } = {}) {
        if (glow) STUDIO.uGlow.value.set(glow[0], glow[1], glow[2]);
        if (pos) STUDIO.uGlowPos.value.set(pos[0], pos[1]);
    }
    function setResolution(w, h) { STUDIO.uRes.value.set(w, h); }

    function update(p, time) {
        setSlates(p, time);
        setLayers(p);
    }

    update(0, 0);
    return { scene, root, update, setStudio, setResolution, state };
}
