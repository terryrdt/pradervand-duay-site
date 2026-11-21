// Pradervand & Duay SA — orchestration de la page : scroll, caméra, chapitres, étiquettes.
import * as THREE from 'three';
import { createRoof } from './roof.js';

const CONFIG = Object.assign({ logo: 'assets/img/logo-mark.png' }, window.PED_CONFIG || {});
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const COLORS = { ink: '#1B1B1B' };
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp01 = t => Math.min(1, Math.max(0, t));
const ramp = (p, a, b) => clamp01((p - a) / (b - a));
const smooth = t => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

const stage = $('.stage');
const contact = $('#contact');
const header = $('#hd');
const chapters = $$('.chapter');
const windows = chapters.map(c => c.dataset.window.split(',').map(Number));
const rail = $('.rail');
const railDashes = $$('.rail__dash i');
const cue = $('.cue');
const progressBar = $('#progress');
const navLinks = $$('.hd__nav a');

// Le préchargeur est géré par le petit script en ligne de index.html : il ne dépend que
// de la police, pas de Three.js, pour que l'accueil s'affiche sans attendre la 3D.
const isLoading = () => document.documentElement.classList.contains('is-loading');

// ---------------------------------------------------------------- moteur 3D
let renderer, camera, roof;
try {
    const canvas = $('#webgl');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    if (!renderer.getContext()) throw new Error('WebGL indisponible');
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 700 ? 1.5 : 1.75));
    renderer.setSize(window.innerWidth, window.innerHeight);
    // AgX : hautes lumières douces et noirs profonds, rendu plus photographique qu'ACES
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.localClippingEnabled = true;
    camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.5, 120);
    roof = createRoof(renderer);
    document.documentElement.classList.add('has-webgl');
    // si le GPU lâche, la page retrouve ses fonds CSS
    canvas.addEventListener('webglcontextlost', () => document.documentElement.classList.replace('has-webgl', 'no-webgl'));
} catch (err) {
    console.warn('[Pradervand] rendu 3D désactivé :', err);
    document.documentElement.classList.add('no-webgl');
    renderer = null;
}

// ---------------------------------------------------------------- caméra
// [scroll, azimut°, élévation°, distance, hauteur visée, décalage latéral (+ = toit à droite)]
const KEYS = [
    [0.00, 34, 19, 23.6, 0.55, 0.245],
    [0.10, 40, 21, 23.2, 0.6, 0.245],
    [0.21, -24, 28, 24.6, 1.4, -0.24],
    [0.40, -32, 25, 25.2, 1.7, -0.24],
    [0.49, 60, 12, 27.4, 1.35, 0.225],
    [0.60, 68, 14, 27.0, 1.3, 0.225],
    [0.70, -22, 24, 24.6, 0.85, -0.28],
    [0.93, -30, 20, 23.6, 0.6, -0.27],
    [1.00, -33, 19, 23.6, 0.6, -0.27],
];
const CONTACT_POSE = [26, 17, 22.0, 0.55, 0.25];

function poseAt(p) {
    let i = 0;
    while (i < KEYS.length - 2 && p > KEYS[i + 1][0]) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const t = smooth(ramp(p, a[0], b[0]));
    return a.slice(1).map((v, k) => lerp(v, b[k + 1], t));
}

// halo du studio (sRGB 0..1) : chaud sur la toiture, plus froid pour la vue technique,
// teinté du rouge Pradervand au contact
const HALO = { warm: [0.115, 0.095, 0.078], cool: [0.068, 0.082, 0.1], red: [0.15, 0.032, 0.04] };
function haloAt(p) {
    const k = smooth(ramp(p, 0.425, 0.475) * (1 - ramp(p, 0.615, 0.67)));
    return HALO.warm.map((v, i) => lerp(v, HALO.cool[i], k));
}

const view = { w: window.innerWidth, h: window.innerHeight };
// même règle que la feuille de style : en portrait, le toit en haut et le texte en bas
const isPortrait = () => view.h >= view.w;
const target = new THREE.Vector3();
function placeCamera(pose, mouse, time, idle, extraShiftY = 0) {
    let [az, el, dist, ty, sx] = pose;
    const aspect = view.w / view.h;
    const portrait = isPortrait();
    dist *= Math.max(portrait ? 0 : 1, (1.6 / aspect) * (portrait ? 0.6 : 1));
    if (!reduceMotion) {
        az += mouse.x * 3.5 + Math.sin(time * 0.22) * 2.2 * idle;
        el += mouse.y * 2.2;
    }
    const a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el);
    target.set(0, ty, 0);
    camera.position.set(
        target.x + dist * Math.sin(a) * Math.cos(e),
        target.y + dist * Math.sin(e),
        target.z + dist * Math.cos(a) * Math.cos(e));
    camera.lookAt(target);
    // décalage d'image : le toit se range du côté opposé au texte
    const shiftX = portrait ? 0 : sx;
    const shiftY = portrait ? 0.235 : 0;
    camera.setViewOffset(view.w, view.h, -shiftX * view.w, shiftY * view.h + extraShiftY, view.w, view.h);
}

// ---------------------------------------------------------------- état du scroll
const S = { target: 0, current: 0, contactTop: Infinity };
const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
function stageRange() {
    const top = stage.offsetTop;
    return { top, len: Math.max(1, stage.offsetHeight - window.innerHeight) };
}
function readScroll() {
    const { top, len } = stageRange();
    S.target = clamp01((window.scrollY - top) / len);
    S.contactTop = contact.getBoundingClientRect().top;
    S.pastStage = window.scrollY > top + stage.offsetHeight - window.innerHeight * 0.35;
}
window.addEventListener('scroll', readScroll, { passive: true });
window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
}, { passive: true });

// ---------------------------------------------------------------- chapitres, rail, en-tête
let activeChapter = -1;
function updateChapters(p) {
    let on = -1;
    windows.forEach(([a, b], i) => { if (p >= a && p <= b) on = i; });
    if (S.pastStage || isLoading()) on = -1;
    if (on !== activeChapter) {
        activeChapter = on;
        chapters.forEach((c, i) => c.classList.toggle('is-on', i === on));
    }
    document.body.classList.toggle('past-stage', !!S.pastStage);
    // rail : remplissage par chapitre
    const bounds = [[0, 0.155], [0.155, 0.44], [0.44, 0.64], [0.64, 1]];
    railDashes.forEach((el, i) => {
        el.style.height = `${ramp(p, bounds[i][0], bounds[i][1]) * 100}%`;
    });
    cue.classList.toggle('is-off', p > 0.02);
}

// clavier : un lien atteint dans un chapitre encore caché amène la scène jusqu'à ce
// chapitre, pour que le focus ne tombe jamais sur un élément invisible
const chapterFocusAt = windows.map(([a, b]) => (Math.max(a, 0) + Math.min(b, 1)) / 2);
chapters.forEach((c, i) => c.addEventListener('focusin', () => {
    if (activeChapter === i) return;
    const { top, len } = stageRange();
    window.scrollTo({ top: top + chapterFocusAt[i] * len, behavior: 'auto' });
    readScroll();
    S.current = S.target;
}));

// en-tête : verre dépoli après l'animation, lien actif selon la section à l'écran
const navSections = navLinks.map(a => (a.hash && a.hash !== '#top') ? $(a.hash) : null);
let navActive = -1;
function updateHeader() {
    header.classList.toggle('is-solid', !!S.pastStage);
    let active = 0;
    if (S.pastStage) {
        // la section la plus basse dont le haut a passé les 40 % de l'écran
        let best = -Infinity;
        navSections.forEach((sec, i) => {
            if (!sec) return;
            const top = sec.getBoundingClientRect().top;
            if (top < view.h * 0.4 && top > best) { best = top; active = i; }
        });
    }
    if (active !== navActive) {
        navActive = active;
        navLinks.forEach((a, i) => a.classList.toggle('is-active', i === active));
    }
    const total = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    progressBar.style.width = `${clamp01(window.scrollY / total) * 100}%`;
}

const v3 = new THREE.Vector3();

// ---------------------------------------------------------------- navigation
function gotoStage(p) {
    const { top, len } = stageRange();
    window.scrollTo({ top: top + p * len, behavior: reduceMotion ? 'auto' : 'smooth' });
}
$$('[data-goto]').forEach(a => a.addEventListener('click', (e) => {
    e.preventDefault();
    closeMenu();
    gotoStage(+a.dataset.goto);
}));
const burger = $('.burger'), menu = $('#menu');
function closeMenu() {
    if (menu.hidden) return;
    menu.hidden = true;
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-label', 'Ouvrir le menu');
    document.body.classList.remove('menu-open');
}
burger.addEventListener('click', () => {
    const open = menu.hidden;
    menu.hidden = !open;
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
    document.body.classList.toggle('menu-open', open);
});
$$('#menu a:not([data-goto])').forEach(a => a.addEventListener('click', closeMenu));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

// apparition des photos et des textes
const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) { entry.target.classList.add('in'); io.unobserve(entry.target); }
    });
}, { rootMargin: '0px 0px -12% 0px' });

// parallaxe douce : chaque photo glisse de quelques pour cent dans son cadre (l'image
// est agrandie de 10 %, la marge suffit). Seules les photos à l'écran sont suivies.
const parallaxEls = new Set();
if (!reduceMotion) {
    const pio = new IntersectionObserver((entries) => {
        entries.forEach(e => e.isIntersecting ? parallaxEls.add(e.target) : parallaxEls.delete(e.target));
    }, { rootMargin: '15% 0px' });
    document.querySelectorAll('.curtain').forEach(el => pio.observe(el));
}
function updateParallax() {
    for (const fig of parallaxEls) {
        const r = fig.getBoundingClientRect();
        const k = Math.max(-1, Math.min(1, (r.top + r.height / 2 - view.h / 2) / (view.h / 2 + r.height / 2)));
        fig.firstElementChild.style.translate = `0 ${(-k * r.height * 0.042).toFixed(1)}px`;
    }
}
$$('.curtain, .reveal').forEach(el => io.observe(el));

// ---------------------------------------------------------------- boucle
const clock = new THREE.Clock();
let lastInput = performance.now(), lastFrame = 0;
for (const ev of ['scroll', 'pointermove', 'resize', 'keydown']) {
    window.addEventListener(ev, () => { lastInput = performance.now(); }, { passive: true });
}
function frame(now = performance.now()) {
    requestAnimationFrame(frame);
    // au repos, 30 images par seconde suffisent
    const settled = Math.abs(S.target - S.current) < 0.0002 && now - lastInput > 1800;
    if (settled && now - lastFrame < 31) return;
    lastFrame = now;
    const dt = Math.min(clock.getDelta(), 0.1);
    const time = clock.elapsedTime;
    const k = reduceMotion ? 1 : 1 - Math.pow(1 - 0.085, dt * 60);
    S.current += (S.target - S.current) * k;
    if (Math.abs(S.target - S.current) < 0.00005) S.current = S.target;
    mouse.x += (mouse.tx - mouse.x) * (1 - Math.pow(1 - 0.05, dt * 60));
    mouse.y += (mouse.ty - mouse.y) * (1 - Math.pow(1 - 0.05, dt * 60));
    const p = S.current;

    updateChapters(p);
    updateHeader();
    updateParallax();
    if (!renderer) return;

    // mode contact : la toiture neuve, accrochée à la section contact
    const contactVisible = S.contactTop < view.h && S.contactTop > -contact.offsetHeight;
    const stageVisible = !S.pastStage || window.scrollY < stage.offsetTop + stage.offsetHeight;
    if (!contactVisible && !stageVisible) return;

    let halo;
    if (contactVisible && S.pastStage) {
        roof.update(1, time, dt, true);
        const portrait = isPortrait();
        // le toit suit la section : centré dans son premier écran (en haut sur téléphone)
        const anchorY = portrait ? S.contactTop - view.h * 0.02 : S.contactTop;
        placeCamera(CONTACT_POSE, mouse, time, 1, -anchorY);
        halo = HALO.red;
    } else {
        roof.update(p, time, dt, p < 0.1);
        placeCamera(poseAt(p), mouse, time, 1 - ramp(p, 0, 0.1));
        halo = haloAt(p);
    }
    // le halo suit la toiture à l'écran
    v3.set(0, 1.0, 0).project(camera);
    glow.x += ((v3.x + 1) / 2 - glow.x) * 0.12;
    glow.y += ((v3.y + 1) / 2 - glow.y) * 0.12;
    roof.setStudio({ glow: halo, pos: [glow.x, glow.y] });
    renderer.render(roof.scene, camera);
}
const glow = { x: 0.7, y: 0.5 };

function onResize() {
    view.w = window.innerWidth;
    view.h = window.innerHeight;
    if (renderer) {
        renderer.setSize(view.w, view.h);
        camera.aspect = view.w / view.h;
        camera.updateProjectionMatrix();
        const size = renderer.getDrawingBufferSize(new THREE.Vector2());
        roof.setResolution(size.x, size.y);
    }
    readScroll();
}
window.addEventListener('resize', onResize);

readScroll();
S.current = S.target;
if (renderer) {
    // premier rendu (compile les shaders), puis la scène apparaît en fondu
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    roof.setResolution(size.x, size.y);
    roof.update(S.current, 0);
    placeCamera(poseAt(S.current), mouse, 0, 1);
    renderer.setClearColor(COLORS.ink);
    renderer.compile(roof.scene, camera);
    renderer.render(roof.scene, camera);
    requestAnimationFrame(() => document.documentElement.classList.add('is-3d'));
}
frame();

// crochets de contrôle (captures automatisées)
window.__ped = {
    snap(p) {
        const { top, len } = stageRange();
        window.scrollTo(0, top + p * len);
        readScroll();
        S.current = S.target;
    },
    get state() { return { p: S.current, removed: roof && roof.state.removed, total: roof && roof.state.total }; },
};
