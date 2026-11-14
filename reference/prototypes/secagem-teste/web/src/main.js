// Secagem MP1 · Grupo 4 — teste de realismo em tempo real.
// Luz assada no Blender (irradiância em lightmap) + materiais procedurais TSL
// + pós-processamento opcional (TRAA, GTAO, SSR, SSGI). WebGPU com queda para WebGL2.

import * as THREE from 'three/webgpu';
import {
	pass, mrt, output, emissive, normalView, metalness, roughness, velocity, diffuseColor,
	vec2, vec3, vec4, float, color, uniform, texture, uv, positionWorld, normalWorld,
	mix, smoothstep, clamp, abs, sin, cos, fract, max, min, length, time, screenUV, rand,
	packNormalToRGB, unpackRGBToNormal, sample, bumpMap, fog, densityFogFactor, range,
	renderOutput, luminance, PI
} from 'three/tsl';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import { ssr } from 'three/addons/tsl/display/SSRNode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { ssgi } from 'three/addons/tsl/display/SSGINode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';

const $ = ( id ) => document.getElementById( id );
const BASE = new URL( './scene/', document.baseURI ).href;

// ------------------------------------------------------------------ presets
const PRESETS = {
	baixo: { label: 'Baixo', dpr: 1.0, fxaa: true, traa: false, bloom: false, ao: false, ssr: false, ssgi: false, steam: 90 },
	medio: { label: 'Médio', dpr: 1.0, fxaa: false, traa: true, bloom: true, ao: false, ssr: false, ssgi: false, steam: 180 },
	alto: { label: 'Alto', dpr: 1.0, fxaa: false, traa: true, bloom: true, ao: true, ssr: true, ssgi: false, steam: 260 },
	ultra: { label: 'Ultra', dpr: 2.0, fxaa: false, traa: true, bloom: true, ao: false, ssr: true, ssgi: true, steam: 320 }
};
const ORDER = [ 'baixo', 'medio', 'alto', 'ultra' ];

const VIEWS = [
	{ pos: [ - 10.5, 5.2, 14.0 ], tgt: [ 6.5, 3.2, 1.5 ] },   // geral
	{ pos: [ - 3.0, 4.95, 6.4 ], tgt: [ 9.0, 4.0, 3.2 ] },    // passarela superior
	{ pos: [ 2.0, 3.4, 17.5 ], tgt: [ 4.6, 3.4, 0.0 ] }       // frente
];

// --------------------------------------------------------------- renderer
const app = $( 'app' );
const FLAGS = new Set( location.hash.slice( 1 ).split( '-' ) );   // #webgl, #noenv
// Limite de bytes por pixel somando os alvos MRT. O padrão do WebGPU é 32; a maioria das GPUs
// de desktop aceita 64, mas só se o dispositivo pedir. Cada alvo aqui custa 8.
let MAX_BPS = 32;
if ( navigator.gpu && ! FLAGS.has( 'webgl' ) ) {
	try {
		const ad = await navigator.gpu.requestAdapter( { powerPreference: 'high-performance' } );
		if ( ad && ad.limits ) MAX_BPS = ad.limits.maxColorAttachmentBytesPerSample || 32;
	} catch ( e ) { /* sem WebGPU: o renderer cai para WebGL2 */ }
}
const renderer = new THREE.WebGPURenderer( {
	antialias: false, trackTimestamp: true, powerPreference: 'high-performance', forceWebGL: FLAGS.has( 'webgl' ),
	requiredLimits: MAX_BPS > 32 ? { maxColorAttachmentBytesPerSample: MAX_BPS } : {}
} );
let fallbackReason = null;
try { fallbackReason = FLAGS.has( 'auto' ) ? sessionStorage.getItem( 'secagem-webgpu-erro' ) : null; } catch ( e ) { /* sem storage */ }
renderer.setSize( innerWidth, innerHeight );
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 0.82;
app.appendChild( renderer.domElement );

const scene = new THREE.Scene();
scene.background = new THREE.Color( 0x0b0d0f );
const camera = new THREE.PerspectiveCamera( 42, innerWidth / innerHeight, 0.1, 140 );
camera.position.set( ...VIEWS[ 0 ].pos );
const controls = new OrbitControls( camera, renderer.domElement );
controls.target.set( ...VIEWS[ 0 ].tgt );
controls.enableDamping = true;
controls.minDistance = 1.2;
controls.maxDistance = 34;
controls.maxPolarAngle = Math.PI * 0.495;
controls.update();

// ------------------------------------------------- textura de ruído (tileável)
// R fino · G médio · B manchas grandes · A estrias verticais
function makeNoise( N = 256 ) {
	const lattice = ( f, seed ) => {
		const g = new Float32Array( f * f );
		let s = seed;
		for ( let i = 0; i < g.length; i ++ ) {
			s = ( s * 16807 ) % 2147483647;
			g[ i ] = s / 2147483647;
		}
		return g;
	};
	const value = ( g, f, x, y ) => {
		const xi = Math.floor( x ), yi = Math.floor( y );
		const xf = x - xi, yf = y - yi;
		const sx = xf * xf * ( 3 - 2 * xf ), sy = yf * yf * ( 3 - 2 * yf );
		const at = ( a, b ) => g[ ( ( b % f + f ) % f ) * f + ( ( a % f + f ) % f ) ];
		const a = at( xi, yi ), b = at( xi + 1, yi ), c = at( xi, yi + 1 ), d = at( xi + 1, yi + 1 );
		return a + ( b - a ) * sx + ( c - a ) * sy + ( a - b - c + d ) * sx * sy;
	};
	// pré-calcula grades por oitava (rápido o bastante para 256²)
	const data = new Uint8Array( N * N * 4 );
	const chan = [ [ 16, 16, 4, 11 ], [ 6, 6, 4, 23 ], [ 2, 2, 3, 37 ], [ 32, 2, 3, 51 ] ];
	const cache = chan.map( ( [ fx, fy, oct, seed ] ) => {
		const grids = [];
		for ( let o = 0; o < oct; o ++ ) {
			const f = Math.max( fx << o, fy << o );
			grids.push( { g: lattice( f, seed + o * 977 ), f, fx: fx << o, fy: fy << o } );
		}
		return grids;
	} );
	for ( let y = 0; y < N; y ++ ) {
		for ( let x = 0; x < N; x ++ ) {
			const u = x / N, v = y / N;
			for ( let c = 0; c < 4; c ++ ) {
				let sum = 0, amp = 0.5, norm = 0;
				for ( const { g, f, fx, fy } of cache[ c ] ) {
					// grade quadrada f×f; frequências diferentes por eixo dão as estrias
					sum += amp * value( g, f, u * fx, v * fy );
					norm += amp;
					amp *= 0.5;
				}
				let n = sum / norm;
				n = Math.min( 1, Math.max( 0, ( n - 0.5 ) * 1.8 + 0.5 ) );
				data[ ( y * N + x ) * 4 + c ] = Math.round( n * 255 );
			}
		}
	}
	const t = new THREE.DataTexture( data, N, N, THREE.RGBAFormat );
	t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.magFilter = THREE.LinearFilter;
	t.minFilter = THREE.LinearMipmapLinearFilter;
	t.generateMipmaps = true;
	t.needsUpdate = true;
	return t;
}
const NOISE = makeNoise();
const nz = ( uvNode ) => texture( NOISE, uvNode );

// amostragem triplanar no espaço do mundo
function tri( scale ) {
	const p = positionWorld.mul( scale );
	const w = abs( normalWorld );
	const ws = w.div( w.x.add( w.y ).add( w.z ) );
	return nz( p.zy ).mul( ws.x ).add( nz( p.xz ).mul( ws.y ) ).add( nz( p.xy ).mul( ws.z ) );
}
// coordenada horizontal ao longo da face (x nas faces viradas para z, z nas viradas para x)
const faceU = () => mix( positionWorld.x, positionWorld.z, smoothstep( 0.6, 0.8, abs( normalWorld.x ) ) );

// ------------------------------------------------------------- materiais
// saídas MRT por material: só valem quando o passe atual tem aquele alvo
const mrtMats = [];
function applyMRT( keys ) {
	for ( const { m, key, node } of mrtMats ) {
		const want = keys.includes( key ) ? mrt( { [ key ]: node } ) : null;
		if ( ( m.mrtNode === null ) !== ( want === null ) ) {
			m.mrtNode = want;
			m.needsUpdate = true;
		}
	}
}

const U = {
	lm: uniform( 1.0 ),          // liga/desliga luz assada
	occRef: uniform( 1.0 )       // irradiância de referência para oclusão especular
};

function painted( hex, { rough = 0.55, metal = 0, grime = 0.35, scale = 0.6, dirtFloor = true } = {} ) {
	return ( m ) => {
		const n = tri( scale );
		const fine = tri( scale * 6.0 );
		let col = color( hex ).mul( mix( float( 1 - grime ), float( 1 ), n.g ) ).mul( mix( 0.88, 1.0, fine.r ) );
		if ( dirtFloor ) col = col.mul( mix( 0.62, 1.0, smoothstep( 0.0, 1.6, positionWorld.y ) ) );
		m.colorNode = col;
		m.roughnessNode = clamp( float( rough ).add( n.b.sub( 0.5 ).mul( 0.25 ) ).add( fine.r.sub( 0.5 ).mul( 0.1 ) ), 0.05, 1 );
		m.metalnessNode = float( metal );
	};
}

function metal( hex, { rough = 0.3, var: v = 0.12, scale = 1.2 } = {} ) {
	return ( m ) => {
		const n = tri( scale );
		const fine = tri( scale * 8 );
		m.colorNode = color( hex ).mul( mix( 0.8, 1.05, n.g ) );
		m.roughnessNode = clamp( float( rough ).add( n.r.sub( 0.5 ).mul( v * 2 ) ).add( fine.a.sub( 0.5 ).mul( v ) ), 0.04, 1 );
		m.metalnessNode = float( 1 );
	};
}

const SPECS = {
	cil_ferro: ( m ) => {
		// ferro fundido polido: riscos circunferenciais e manchas de condensado
		const n = tri( 0.9 );
		const streak = nz( vec2( positionWorld.z.mul( 0.08 ), positionWorld.x.mul( 3.0 ) ) ).a;
		m.colorNode = color( 0x6b6f73 ).mul( mix( 0.7, 1.05, n.g ) ).mul( mix( 0.85, 1.0, streak ) );
		m.roughnessNode = clamp( float( 0.22 ).add( n.b.sub( 0.5 ).mul( 0.3 ) ).add( streak.sub( 0.5 ).mul( 0.12 ) ), 0.08, 0.7 );
		m.metalnessNode = float( 1 );
	},
	cil_cabeca: painted( 0x3a3e43, { rough: 0.6, grime: 0.4 } ),
	munhao: metal( 0x8b8f93, { rough: 0.32 } ),
	estrutura: painted( 0x2b3035, { rough: 0.5, grime: 0.45, scale: 0.8 } ),
	mancal_corpo: painted( 0x2b5a88, { rough: 0.42, grime: 0.4, scale: 1.5 } ),
	mancal_tampa: painted( 0xd5cbae, { rough: 0.48, grime: 0.45, scale: 1.8 } ),
	protecao_amarela: painted( 0xe0ad1a, { rough: 0.5, grime: 0.5, scale: 1.5 } ),
	junta_latao: metal( 0xc29a55, { rough: 0.3, var: 0.18, scale: 3 } ),
	mangueira: painted( 0x161616, { rough: 0.62, grime: 0.2, scale: 2, dirtFloor: false } ),
	caixa_juncao: painted( 0x9aa1a7, { rough: 0.45, grime: 0.3, scale: 2 } ),
	feltro: ( m ) => {
		const weave = nz( positionWorld.xz.mul( 9.0 ) ).r;
		m.colorNode = color( 0x26363f ).mul( mix( 0.8, 1.1, weave ) );
		m.roughnessNode = float( 0.95 );
		m.metalnessNode = float( 0 );
	},
	papel: ( m ) => {
		m.colorNode = color( 0xe8e7e1 ).mul( mix( 0.93, 1.0, tri( 2 ).r ) );
		m.roughnessNode = float( 0.82 );
		m.metalnessNode = float( 0 );
		m.side = THREE.DoubleSide;
	},
	rolo_feltro: metal( 0x7f8489, { rough: 0.34 } ),
	capota_painel: ( m ) => hood( m, 0x9ea3a6 ),
	capota_porta: ( m ) => hood( m, 0xaeb2b4 ),
	capota_moldura: metal( 0x8e9398, { rough: 0.38 } ),
	vidro: ( m ) => {
		m.colorNode = color( 0x0f1418 );
		m.roughnessNode = float( 0.04 );
		m.metalnessNode = float( 0 );
		mrtMats.push( { m, key: 'metalrough', node: vec2( 0.6, 0.04 ) } );
	},
	passarela: ( m ) => {
		// grade de piso: malha 30 × 100 mm sugerida por linhas escuras
		const g1 = smoothstep( 0.32, 0.42, abs( fract( positionWorld.x.mul( 33 ) ).sub( 0.5 ) ) );
		const g2 = smoothstep( 0.4, 0.47, abs( fract( positionWorld.z.mul( 10 ) ).sub( 0.5 ) ) );
		const grid = max( g1, g2 );
		const n = tri( 1.2 );
		m.colorNode = color( 0x80858a ).mul( mix( 1.0, 0.18, grid ) ).mul( mix( 0.75, 1.0, n.g ) );
		m.roughnessNode = mix( float( 0.4 ), float( 0.85 ), grid );
		m.metalnessNode = mix( float( 0.85 ), float( 0.2 ), grid );
	},
	guarda_corpo: painted( 0xe0ad1d, { rough: 0.42, grime: 0.35, scale: 2.5, dirtFloor: false } ),
	tubo_vermelho: painted( 0x8f2820, { rough: 0.48, grime: 0.4, scale: 1.2 } ),
	tubo_isolado: ( m ) => {
		// jaqueta de alumínio: costuras a cada 1 m
		const seam = smoothstep( 0.012, 0.0, abs( fract( positionWorld.x ).sub( 0.5 ) ).sub( 0.49 ).abs() );
		const n = tri( 1.5 );
		m.colorNode = color( 0xc5c9cc ).mul( mix( 0.75, 1.0, n.g ) ).mul( mix( 1.0, 0.6, seam ) );
		m.roughnessNode = clamp( float( 0.32 ).add( n.r.sub( 0.5 ).mul( 0.3 ) ), 0.1, 0.8 );
		m.metalnessNode = float( 1 );
	},
	duto: metal( 0xa0a5a9, { rough: 0.38, var: 0.2, scale: 0.8 } ),
	piso: ( m ) => floor( m ),
	fosso: painted( 0x444440, { rough: 0.75, grime: 0.5, scale: 0.5, dirtFloor: false } ),
	refugo: ( m ) => {
		m.colorNode = color( 0xdcdbd4 ).mul( mix( 0.7, 1.0, tri( 2.5 ).g ) );
		m.roughnessNode = float( 0.9 );
		m.metalnessNode = float( 0 );
	},
	parede: ( m ) => {
		const n = tri( 0.25 );
		const streak = nz( vec2( faceU().mul( 0.5 ), positionWorld.y.mul( 0.04 ) ) ).a;
		const base = color( 0x86837b ).mul( mix( 0.75, 1.0, n.b ) ).mul( mix( 0.8, 1.0, streak ) );
		m.colorNode = base.mul( mix( 0.55, 1.0, smoothstep( 0.0, 2.2, positionWorld.y ) ) );
		m.roughnessNode = float( 0.88 );
		m.metalnessNode = float( 0 );
	},
	telhado: painted( 0x34373a, { rough: 0.6, grime: 0.3, scale: 0.3, dirtFloor: false } ),
	trelica: painted( 0x4f5459, { rough: 0.55, grime: 0.35, scale: 0.6, dirtFloor: false } ),
	pilar: painted( 0xc7b791, { rough: 0.55, grime: 0.45, scale: 0.7 } ),
	faixa_amarela: ( m ) => stripe( m, false ),
	faixa_zebrada: ( m ) => stripe( m, true ),
	lampada: ( m ) => {
		m.colorNode = color( 0xffe7c4 );
		m.emissiveNode = color( 0xffe2b8 ).mul( 24 );
		m.roughnessNode = float( 0.5 );
		m.metalnessNode = float( 0 );
	}
};

function hood( m, hex ) {
	// painéis de alumínio: emendas a cada 0,9 m e escorrimento abaixo das emendas
	const u = faceU();
	const d = abs( fract( u.div( 0.9 ).add( 0.5 ) ).sub( 0.5 ) ).mul( 0.9 );
	const dh = abs( fract( positionWorld.y.div( 1.2 ) ).sub( 0.5 ) ).mul( 1.2 );
	const seam = max( smoothstep( 0.012, 0.004, d ), smoothstep( 0.01, 0.003, dh.sub( 0.59 ).abs() ) );
	const n = tri( 0.5 );
	const run = nz( vec2( u.mul( 1.7 ), positionWorld.y.mul( 0.06 ) ) ).a;
	const runMask = smoothstep( 0.12, 0.0, d ).mul( smoothstep( 0.55, 0.85, run ) );
	m.colorNode = color( hex ).mul( mix( 0.78, 1.0, n.g ) ).mul( mix( 1.0, 0.45, seam ) ).mul( mix( 1.0, 0.72, runMask ) )
		.mul( mix( 0.6, 1.0, smoothstep( 0.0, 1.4, positionWorld.y ) ) );
	m.roughnessNode = clamp( float( 0.42 ).add( n.r.sub( 0.5 ).mul( 0.3 ) ).add( runMask.mul( 0.2 ) ), 0.1, 0.9 );
	m.metalnessNode = float( 0.15 );
}

const wetness = () => {
	const p = positionWorld.xz;
	const big = nz( p.mul( 0.045 ) ).b;
	const mid = nz( p.mul( 0.19 ) ).g;
	const puddle = smoothstep( 0.56, 0.64, big.mul( 0.7 ).add( mid.mul( 0.3 ) ) );
	// mais molhado junto à capota e sob a passarela (condensado, lavagem)
	const near = smoothstep( 9.0, 5.0, abs( positionWorld.z ) ).mul( smoothstep( - 9, - 2, positionWorld.x ) ).mul( smoothstep( 16, 10, positionWorld.x ) );
	return clamp( puddle.add( near.mul( smoothstep( 0.35, 0.65, mid ) ).mul( 0.85 ) ), 0, 1 );
};

function floor( m ) {
	const n = tri( 0.35 );
	const fine = nz( positionWorld.xz.mul( 2.3 ) );
	const wet = wetness();
	// juntas de dilatação a cada 6 m
	const jx = smoothstep( 0.012, 0.0, abs( fract( positionWorld.x.div( 6 ) ).sub( 0.5 ) ).sub( 0.498 ).abs() );
	const jz = smoothstep( 0.012, 0.0, abs( fract( positionWorld.z.div( 6 ) ).sub( 0.5 ) ).sub( 0.498 ).abs() );
	const joint = max( jx, jz );
	const base = mix( color( 0x6c6a65 ), color( 0x8b8780 ), n.g ).mul( mix( 0.82, 1.0, fine.r ) ).mul( mix( 0.75, 1.0, n.b ) );
	m.colorNode = base.mul( mix( float( 1 ), float( 0.42 ), wet ) ).mul( mix( 1.0, 0.45, joint ) );
	const rough = mix( float( 0.8 ).add( fine.g.sub( 0.5 ).mul( 0.2 ) ), float( 0.07 ), wet );
	m.roughnessNode = rough;
	m.metalnessNode = float( 0 );
	m.normalNode = bumpMap( fine.r.mul( wet.oneMinus() ), 0.25 );
	mrtMats.push( { m, key: 'metalrough', node: vec2( wet.mul( 0.85 ).add( 0.05 ), rough ) } );
}

function stripe( m, zebra ) {
	const n = tri( 1.0 );
	const wear = smoothstep( 0.12, 0.35, nz( positionWorld.xz.mul( 0.9 ) ).r );
	let col = color( 0xd6a614 );
	if ( zebra ) {
		const s = step01( fract( positionWorld.x.add( positionWorld.z ).mul( 1.25 ) ) );
		col = mix( color( 0x111111 ), color( 0xd6a614 ), s );
	}
	m.colorNode = mix( color( 0x6f6c66 ), col, wear ).mul( mix( 0.8, 1.0, n.g ) );
	m.roughnessNode = float( 0.6 );
	m.metalnessNode = float( 0 );
}
const step01 = ( x ) => smoothstep( 0.48, 0.52, x );

const METALS = new Set( [ 'cil_ferro', 'munhao', 'junta_latao', 'rolo_feltro', 'capota_moldura', 'tubo_isolado', 'duto', 'passarela' ] );

function buildMaterial( name, lm, lmScale ) {
	const m = new THREE.MeshStandardNodeMaterial();
	m.name = name;
	( SPECS[ name ] || painted( 0x888888 ) )( m );
	if ( lm && name !== 'lampada' ) {
		m.lightMap = lm;
		m.lightMapIntensity = lmScale * Math.PI;
		m.userData.lmBase = lmScale * Math.PI;
		if ( METALS.has( name ) ) {
			// metal não tem difusa: usa a luz assada como oclusão do reflexo do ambiente
			const e = luminance( texture( lm, uv() ).rgb ).mul( lmScale );
			m.aoNode = mix( float( 1 ), clamp( e.div( U.occRef ), 0.03, 1 ).pow( 0.75 ), U.lm );
		}
	}
	return m;
}

// --------------------------------------------------------------- carga
const loading = { bytes: {}, total: {} };
function progress( key, e ) {
	loading.bytes[ key ] = e.loaded;
	loading.total[ key ] = e.total || e.loaded;
	const b = Object.values( loading.bytes ).reduce( ( a, c ) => a + c, 0 );
	const t = Object.values( loading.total ).reduce( ( a, c ) => a + c, 0 );
	$( 'l-bar' ).style.width = ( t ? Math.round( 100 * b / t ) : 5 ) + '%';
	$( 'l-txt' ).textContent = `${( b / 1048576 ).toFixed( 1 )} MB de ${( t / 1048576 ).toFixed( 1 )} MB`;
}
function loadTex( url ) {
	return new Promise( ( res, rej ) => new THREE.TextureLoader().load( BASE + url, ( t ) => {
		t.flipY = false;
		t.colorSpace = THREE.SRGBColorSpace;
		t.channel = 0;
		t.generateMipmaps = true;
		t.minFilter = THREE.LinearMipmapLinearFilter;
		res( t );
	}, ( e ) => progress( url, e ), rej ) );
}

let meta, bearings = [];
const steamMats = [], shaftMeshes = [];

async function load() {
	meta = await ( await fetch( BASE + 'cena.json' ) ).json();
	const [ gltf, lmMaq, lmPred ] = await Promise.all( [
		// o host não serve .glb: os bytes vêm em base64 dentro de um JSON
		new Promise( ( res, rej ) => {
			const fl = new THREE.FileLoader();
			fl.setResponseType( 'json' );
			fl.load( BASE + 'secagem.glb.json', ( j ) => {
				const bin = Uint8Array.fromBase64 ? Uint8Array.fromBase64( j.glb ) : Uint8Array.from( atob( j.glb ), ( c ) => c.charCodeAt( 0 ) );
				new GLTFLoader().parse( bin.buffer, '', res, rej );
			}, ( e ) => progress( 'glb', e ), rej );
		} ),
		loadTex( 'lm_maquina.webp' ),
		loadTex( 'lm_predio.webp' )
	] );
	U.occRef.value = meta.lm.ref;
	const cache = {};
	gltf.scene.traverse( ( o ) => {
		if ( ! o.isMesh ) return;
		let n = o;
		while ( n && ! /^(MAQ|PRED)/.test( n.name ) ) n = n.parent;
		const grp = n && n.name.startsWith( 'PRED' ) ? 'PRED' : 'MAQ';
		const name = ( o.material.name || ( n ? n.name.split( '__' )[ 1 ] : '' ) ).replace( /\.\d+$/, '' );
		const key = grp + name;
		const pred = grp === 'PRED';
		cache[ key ] ||= buildMaterial( name, pred ? lmPred : lmMaq, pred ? meta.lm.predio : meta.lm.maquina );
		o.material = cache[ key ];
		o.frustumCulled = true;
	} );
	scene.add( gltf.scene );
	addSkylights();
	addShafts();
	addSteam();
	addPickers();
	scene.fogNode = fog( color( 0x6e6a63 ), densityFogFactor( 0.0085 ) );
}

// painéis de claraboia (emissivos) e fachos de luz
const sunDir = () => {
	const d = meta.params.sun;   // Blender (x, y, z) → three (x, z, -y)
	return new THREE.Vector3( d[ 0 ], d[ 2 ], - d[ 1 ] ).normalize();
};
function addSkylights() {
	const mat = new THREE.MeshBasicNodeMaterial();
	mat.colorNode = color( 0xe8f0f6 ).mul( 6 );
	mrtMats.push( { m: mat, key: 'emissive', node: color( 0xe8f0f6 ).mul( 1.4 ) } );
	mat.fog = false;
	const L = meta.params.skylight_len;
	for ( const [ a, b ] of meta.params.skylights ) {
		for ( const cx of meta.params.skylights_x ) {
			const g = new THREE.PlaneGeometry( L, b - a );
			g.rotateX( Math.PI / 2 );
			const p = new THREE.Mesh( g, mat );
			p.position.set( cx, meta.params.roof + 0.15, - ( a + b ) / 2 );
			scene.add( p );
		}
	}
}

function addShafts() {
	const d = sunDir();
	const t = meta.params.roof / - d.y;
	const pos = [], uvs = [];
	const L = meta.params.skylight_len;
	for ( const [ a, b ] of meta.params.skylights ) {
		for ( const cx of meta.params.skylights_x ) {
			const y = meta.params.roof;
			const c = [ [ cx - L / 2, - a ], [ cx + L / 2, - a ], [ cx + L / 2, - b ], [ cx - L / 2, - b ] ];
			for ( let i = 0; i < 4; i ++ ) {
				const p0 = c[ i ], p1 = c[ ( i + 1 ) % 4 ];
				const A = [ p0[ 0 ], y, p0[ 1 ] ], B = [ p1[ 0 ], y, p1[ 1 ] ];
				const A2 = [ A[ 0 ] + d.x * t, 0, A[ 2 ] + d.z * t ], B2 = [ B[ 0 ] + d.x * t, 0, B[ 2 ] + d.z * t ];
				pos.push( ...A, ...B, ...B2, ...A, ...B2, ...A2 );
				uvs.push( 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1 );
			}
		}
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'uv', new THREE.Float32BufferAttribute( uvs, 2 ) );
	const m = new THREE.MeshBasicNodeMaterial( { transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending } );
	const u = uv();
	const edge = sin( u.x.mul( PI ) ).pow( 3.0 );
	const along = smoothstep( 0.0, 0.12, u.y ).mul( smoothstep( 1.0, 0.55, u.y ) );
	const dust = nz( vec2( positionWorld.x.mul( 0.15 ).add( time.mul( 0.004 ) ), positionWorld.y.mul( 0.08 ).sub( time.mul( 0.01 ) ) ) ).g;
	const a = edge.mul( along ).mul( mix( 0.3, 1.0, dust ) ).mul( 0.02 );
	m.colorNode = vec4( color( 0xffe9c8 ).mul( a ), 1 );
	m.fog = false;
	const mesh = new THREE.Mesh( g, m );
	mesh.renderOrder = 2;
	scene.add( mesh );
	shaftMeshes.push( mesh );
}

// vapor saindo pelas portas abertas da capota e pelas frestas das portas inferiores
function addSteam() {
	const p = meta.params;
	const zw = 4.45;
	const doorsOpen = [ 1, 3 ].map( ( i ) => i * p.P + p.P / 2 );
	const emit = [ ...doorsOpen.map( ( x ) => [ x, 7.1, zw, 1.0 ] ), ...[ 0, 1, 2, 3 ].map( ( i ) => [ i * p.P, 3.25, zw, 0.35 ] ) ];
	for ( const [ ex, ey, ez, power ] of emit ) {
		const m = new THREE.SpriteNodeMaterial( { transparent: true, depthWrite: false } );
		const seed = range( 0, 1 );
		const life = fract( time.mul( 0.06 ).add( seed ) );
		const sx = range( - 0.85, 0.85 );
		const drift = range( 0.6, 1.6 );
		const off = vec3(
			sx.add( sin( seed.mul( 40 ).add( time.mul( 0.35 ) ) ).mul( life ).mul( 0.6 ) ),
			life.mul( life ).mul( 5.5 ).add( life.mul( 1.2 ) ),
			life.mul( drift ).add( cos( seed.mul( 23 ).add( time.mul( 0.25 ) ) ).mul( life ).mul( 0.5 ) )
		);
		m.positionNode = vec3( ex, ey, ez ).add( off );
		m.scaleNode = mix( float( 0.7 ), float( 4.2 ), life ).mul( power > 0.5 ? 1 : 0.6 );
		const c = uv().sub( 0.5 );
		const soft = smoothstep( 0.5, 0.05, length( c ) );
		const wisps = nz( uv().mul( 0.7 ).add( vec2( seed.mul( 7.3 ), seed.mul( 3.1 ).add( time.mul( 0.02 ) ) ) ) ).g;
		const fade = sin( life.mul( PI ) ).pow( 1.4 );
		const alpha = soft.mul( smoothstep( 0.25, 0.8, wisps ) ).mul( fade ).mul( 0.16 * power );
		m.colorNode = vec4( color( 0xcfccc6 ).mul( 0.9 ), alpha );
		const mesh = new THREE.Mesh( new THREE.PlaneGeometry( 1, 1 ), m );
		mesh.count = 60;
		mesh.frustumCulled = false;
		mesh.renderOrder = 3;
		mesh.userData.base = 60;
		mesh.userData.power = power;
		scene.add( mesh );
		steamMats.push( mesh );
	}
}
function setSteamDensity( total ) {
	const sum = steamMats.reduce( ( a, m ) => a + m.userData.power, 0 );
	for ( const m of steamMats ) m.count = Math.max( 4, Math.round( total * m.userData.power / sum ) );
}

// --------------------------------------------------------- mancais clicáveis
const pickGroup = new THREE.Group();
const hoverBox = new THREE.LineSegments(
	new THREE.EdgesGeometry( new THREE.BoxGeometry( 0.9, 0.95, 1.55 ) ),
	new THREE.LineBasicNodeMaterial( { color: 0xe2b21c, transparent: true, opacity: 0.95, depthTest: false } )
);
hoverBox.visible = false;
hoverBox.renderOrder = 10;
function addPickers() {
	const geo = new THREE.BoxGeometry( 0.9, 0.95, 1.55 );
	const mat = new THREE.MeshBasicNodeMaterial( { visible: false } );
	for ( const b of meta.bearings ) {
		const m = new THREE.Mesh( geo, mat );
		m.position.set( b.pos[ 0 ], b.pos[ 1 ], b.pos[ 2 ] + 0.55 );
		m.userData = b;
		pickGroup.add( m );
	}
	scene.add( pickGroup, hoverBox );
}
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let downAt = null;
renderer.domElement.addEventListener( 'pointerdown', ( e ) => { downAt = [ e.clientX, e.clientY ]; } );
renderer.domElement.addEventListener( 'pointermove', ( e ) => {
	if ( bench.active || e.pointerType !== 'mouse' ) return;
	const hit = pick( e );
	renderer.domElement.style.cursor = hit ? 'pointer' : '';
	if ( ! selected ) showBox( hit );
} );
renderer.domElement.addEventListener( 'pointerup', ( e ) => {
	if ( ! downAt || bench.active ) return;
	if ( Math.hypot( e.clientX - downAt[ 0 ], e.clientY - downAt[ 1 ] ) > 5 ) return;
	const hit = pick( e );
	if ( hit ) select( hit.object );
} );
function pick( e ) {
	const r = renderer.domElement.getBoundingClientRect();
	ndc.set( ( ( e.clientX - r.left ) / r.width ) * 2 - 1, - ( ( e.clientY - r.top ) / r.height ) * 2 + 1 );
	ray.setFromCamera( ndc, camera );
	return ray.intersectObjects( pickGroup.children, false )[ 0 ] || null;
}
function showBox( hit ) {
	hoverBox.visible = !! hit;
	if ( hit ) hoverBox.position.copy( hit.object.position );
}
let selected = null;
function hash( s ) {
	let h = 2166136261;
	for ( const ch of s ) h = Math.imul( h ^ ch.charCodeAt( 0 ), 16777619 );
	return ( h >>> 0 ) / 4294967295;
}
function select( obj ) {
	selected = obj;
	showBox( { object: obj } );
	const b = obj.userData;
	const cs = b.tag.slice( 2 );
	const vib = cs === '23' ? 4.9 : 0.9 + hash( b.vi ) * 2.4;     // um mancal em zona C, para o teste ter contraste
	const temp = 58 + hash( b.ti ) * 14 + ( cs === '23' ? 9 : 0 );
	const zone = vib <= 2.3 ? [ 'A', '#5bbf7a' ] : vib <= 4.5 ? [ 'B', '#9fc85a' ] : vib <= 7.1 ? [ 'C', '#e2b21c' ] : [ 'D', '#e0593f' ];
	$( 'a-tag' ).textContent = b.tag;
	$( 'a-where' ).textContent = `Mancal LC · nível ${b.tier}`;
	$( 'a-vi' ).textContent = `${b.vi} · mm/s RMS`;
	$( 'a-viv' ).textContent = vib.toFixed( 1 ).replace( '.', ',' );
	$( 'a-zone' ).textContent = zone[ 0 ];
	$( 'a-zone' ).style.background = zone[ 1 ];
	$( 'a-ti' ).textContent = `${b.ti} · °C`;
	$( 'a-tiv' ).textContent = Math.round( temp );
	$( 'asset' ).hidden = false;
}
$( 'a-close' ).onclick = () => { selected = null; $( 'asset' ).hidden = true; showBox( null ); };

// ------------------------------------------------- ambiente (reflexos da própria cena)
async function captureEnvironment() {
	try {
		const rt = new THREE.CubeRenderTarget( 256, { type: THREE.HalfFloatType } );
		const cube = new THREE.CubeCamera( 0.1, 120, rt );
		cube.position.set( 4.5, 2.6, 9.5 );
		applyMRT( [] );
		const fogNode = scene.fogNode;
		scene.fogNode = null;
		for ( const m of [ ...shaftMeshes, ...steamMats ] ) m.visible = false;
		cube.update( renderer, scene );
		for ( const m of [ ...shaftMeshes, ...steamMats ] ) m.visible = true;
		scene.fogNode = fogNode;
		const pm = new THREE.PMREMGenerator( renderer );
		scene.environment = pm.fromCubemap( rt.texture ).texture;
		scene.environmentIntensity = 0.42;
		pm.dispose();
		rt.dispose();
	} catch ( err ) {
		console.warn( 'captura do ambiente falhou', err );
	}
}

// --------------------------------------------------------- pós-processamento
const pipeline = new THREE.RenderPipeline( renderer );
let current = 'alto';
let pipelineInfo = { bytes: 0, limit: 0, adjust: [] };
const grain = uniform( 0.018 );

function buildPipeline( key ) {
	const q = { ...PRESETS[ key ] };
	const scenePass = pass( scene, camera );
	const plan = () => {
		const o = { output };
		if ( q.bloom && ! q.bloomLuma ) o.emissive = emissive;
		if ( q.traa ) o.velocity = velocity;
		if ( q.ssr || q.ao || q.ssgi ) o.normal = packNormalToRGB( normalView );
		if ( q.ssr ) o.metalrough = vec2( metalness, roughness );
		if ( q.ssgi ) o.diffuseColor = diffuseColor;
		return o;
	};
	// WebGPU recusa o passe inteiro se os alvos passarem do limite: corta o que menos aparece
	const limit = FLAGS.has( 'bps32' ) ? 32 : renderer.backend.isWebGPUBackend ? MAX_BPS : Infinity;   // #bps32 simula GPU com limite padrão
	const adjust = [];
	let outputs = plan();
	while ( Object.keys( outputs ).length * 8 > limit ) {
		if ( q.bloom && ! q.bloomLuma ) { q.bloomLuma = true; adjust.push( 'bloom por limiar' ); }
		else if ( q.ssgi ) { q.ssgi = false; q.ao = true; adjust.push( 'SSGI→GTAO' ); }
		else if ( q.ssr ) { q.ssr = false; adjust.push( 'sem SSR' ); }
		else if ( q.traa ) { q.traa = false; q.fxaa = true; adjust.push( 'TRAA→FXAA' ); }
		else break;
		outputs = plan();
	}
	pipelineInfo = { bytes: Object.keys( outputs ).length * 8, limit, adjust };
	scenePass.setMRT( mrt( outputs ) );
	applyMRT( Object.keys( outputs ) );
	for ( const k of [ 'normal', 'metalrough', 'diffuseColor', 'emissive' ] ) {
		if ( outputs[ k ] && k !== 'emissive' ) scenePass.getTexture( k ).type = THREE.UnsignedByteType;
	}
	const sceneColor = scenePass.getTextureNode( 'output' );
	const depth = scenePass.getTextureNode( 'depth' );
	let col = sceneColor;
	let normal = null;
	if ( outputs.normal ) {
		const nTex = scenePass.getTextureNode( 'normal' );
		normal = sample( ( u ) => unpackRGBToNormal( nTex.sample( u ) ) );
	}
	if ( q.ssgi ) {
		const gi = ssgi( sceneColor, depth, normal, camera );
		gi.sliceCount.value = 2;
		gi.stepCount.value = 8;
		const diff = scenePass.getTextureNode( 'diffuseColor' );
		col = vec4( col.rgb.mul( gi.getAONode() ).add( diff.rgb.mul( gi.getGINode().rgb ).mul( 0.6 ) ), col.a );
	} else if ( q.ao ) {
		const aoPass = ao( depth, normal, camera );
		aoPass.resolutionScale = 0.5;
		col = vec4( col.rgb.mul( mix( float( 1 ), aoPass.getTextureNode().sample( screenUV ).r, 0.85 ) ), col.a );
	}
	if ( q.ssr ) {
		const mr = scenePass.getTextureNode( 'metalrough' );
		const s = ssr( sceneColor, depth, normal, { metalnessNode: mr.r, roughnessNode: mr.g, camera } );
		s.resolutionScale = 0.5;
		col = col.add( vec4( s.rgb, 0 ) );
	}
	if ( q.bloom ) col = col.add( q.bloomLuma ? bloom( sceneColor, 0.35, 0.4, 2.5 ) : bloom( scenePass.getTextureNode( 'emissive' ), 0.55, 0.45, 0.0 ) );
	if ( q.traa ) col = traa( col, depth, scenePass.getTextureNode( 'velocity' ), camera );
	// saída de vídeo: tone mapping → vinheta e grão leves
	let out = renderOutput( col );
	if ( q.fxaa ) out = fxaa( out );
	const c = screenUV.sub( 0.5 );
	const vig = smoothstep( 0.95, 0.25, length( c.mul( vec2( 1.0, 0.8 ) ) ) ).mul( 0.28 ).add( 0.72 );
	const n = rand( screenUV.add( fract( time.mul( 13.7 ) ) ) ).sub( 0.5 ).mul( grain );
	pipeline.outputColorTransform = false;
	pipeline.outputNode = vec4( out.rgb.mul( vig ).add( n ), 1 );
	pipeline.needsUpdate = true;
	renderer.setPixelRatio( Math.min( devicePixelRatio || 1, q.dpr ) );
	renderer.setSize( innerWidth, innerHeight );
	setSteamDensity( q.steam );
}

function setPreset( key ) {
	current = key;
	for ( const b of document.querySelectorAll( '[data-q]' ) ) b.setAttribute( 'aria-pressed', String( b.dataset.q === key ) );
	buildPipeline( key );
}
for ( const b of document.querySelectorAll( '[data-q]' ) ) b.onclick = () => { if ( ! bench.active ) setPreset( b.dataset.q ); };

$( 't-lm' ).onchange = ( e ) => {
	const on = e.target.checked;
	U.lm.value = on ? 1 : 0;
	scene.traverse( ( o ) => {
		if ( o.isMesh && o.material && o.material.userData && o.material.userData.lmBase ) o.material.lightMapIntensity = on ? o.material.userData.lmBase : 0;
	} );
};
$( 't-fx' ).onchange = ( e ) => {
	for ( const m of [ ...steamMats, ...shaftMeshes ] ) m.visible = e.target.checked;
};

// ---------------------------------------------------------------- câmera
let tween = null;
function goTo( i ) {
	const v = VIEWS[ i ];
	tween = { t: 0, from: [ camera.position.clone(), controls.target.clone() ], to: [ new THREE.Vector3( ...v.pos ), new THREE.Vector3( ...v.tgt ) ] };
}
for ( const b of document.querySelectorAll( '[data-v]' ) ) b.onclick = () => { if ( ! bench.active ) goTo( + b.dataset.v ); };

// ------------------------------------------------------------- benchmark
const bench = { active: false, results: [] };
const PATH = [ 0, 2, 1, 0 ];
const WARM = 2.0, MEASURE = 7.5;
function pathPose( t ) {   // t ∈ [0, 1]
	const seg = Math.min( PATH.length - 2, Math.floor( t * ( PATH.length - 1 ) ) );
	const f = t * ( PATH.length - 1 ) - seg;
	const s = f * f * ( 3 - 2 * f );
	const a = VIEWS[ PATH[ seg ] ], b = VIEWS[ PATH[ seg + 1 ] ];
	const lerp = ( x, y ) => x.map( ( v, i ) => v + ( y[ i ] - v ) * s );
	return [ lerp( a.pos, b.pos ), lerp( a.tgt, b.tgt ) ];
}

let gpuMs = null, gpuPending = false, framesSince = 0, gpuOK = null, gpuLost = null, gpuErrors = 0, gpuFirstError = null;
const bootAt = performance.now();
function sampleGPU() {
	framesSince ++;
	if ( gpuPending || gpuOK === false ) return;
	const n = framesSince;
	framesSince = 0;
	gpuPending = true;
	Promise.resolve( renderer.resolveTimestampsAsync( 'render' ) ).then( ( d ) => {
		gpuPending = false;
		if ( typeof d === 'number' && d > 0 && n > 0 ) {
			gpuMs = d / n;
			gpuOK = true;
			if ( bench.active && bench.phase === 'measure' ) bench.gpu.push( gpuMs );
		} else if ( gpuOK === null && d === undefined ) gpuOK = false;
	} ).catch( () => { gpuPending = false; gpuOK = false; } );
}

async function runBenchmark() {
	if ( bench.active ) return;
	bench.active = true;
	bench.results = [];
	controls.enabled = false;
	tween = null;
	$( 'bench' ).hidden = false;
	$( 'b-title' ).textContent = 'Benchmark';
	$( 'b-sub' ).textContent = 'Câmera em percurso fixo, 4 presets. Não mexa na janela até terminar.';
	$( 'b-tablewrap' ).hidden = true;
	$( 'b-actions' ).hidden = true;
	$( 'report' ).hidden = true;
	$( 'b-verdict' ).textContent = '';
	const prev = current;
	for ( const key of ORDER ) {
		setPreset( key );
		bench.frames = [];
		bench.err0 = gpuErrors;
		bench.gpu = [];
		bench.phase = 'warm';
		bench.t0 = performance.now();
		bench.key = key;
		await new Promise( ( res ) => { bench.done = res; } );
		const fr = bench.frames.slice().sort( ( a, b ) => a - b );
		const total = bench.frames.reduce( ( a, b ) => a + b, 0 );
		const avg = 1000 * bench.frames.length / total;
		const p99 = fr[ Math.floor( fr.length * 0.99 ) ] || fr[ fr.length - 1 ];
		const p95 = fr[ Math.floor( fr.length * 0.95 ) ] || fr[ fr.length - 1 ];
		const gpu = bench.gpu.length ? bench.gpu.slice().sort( ( a, b ) => a - b )[ Math.floor( bench.gpu.length / 2 ) ] : null;
		bench.results.push( { key, avg, low: 1000 / p99, p95, gpu, adjust: pipelineInfo.adjust.slice(), bytes: pipelineInfo.bytes, errs: gpuErrors - bench.err0 } );
	}
	bench.active = false;
	bench.phase = null;
	controls.enabled = true;
	setPreset( prev );
	showResults();
}

const backendLabel = () => renderer.backend.isWebGPUBackend ? 'WebGPU' : ( FLAGS.has( 'auto' ) ? 'WebGL2 (WebGPU falhou nesta máquina)' : 'WebGL2' );

function gpuName() {
	const info = renderer.backend.isWebGPUBackend ? ( renderer.backend.adapter && renderer.backend.adapter.info ) : null;
	if ( info ) return [ info.vendor, info.architecture, info.description ].filter( Boolean ).join( ' / ' ) || 'não informado pelo navegador';
	try {
		const gl = renderer.backend.gl;
		const ext = gl && gl.getExtension( 'WEBGL_debug_renderer_info' );
		if ( ext ) return gl.getParameter( ext.UNMASKED_RENDERER_WEBGL );
	} catch ( e ) { /* sem acesso */ }
	return 'não informado pelo navegador';
}

let refreshHz = 60;
function showResults() {
	const rows = bench.results.map( ( r ) => `<tr><td>${PRESETS[ r.key ].label}${r.errs ? ' *' : ''}</td><td>${r.avg.toFixed( 0 )}</td><td>${r.low.toFixed( 0 )}</td><td>${r.p95.toFixed( 1 )}</td><td>${r.gpu != null ? r.gpu.toFixed( 1 ) : '–'}</td></tr>` );
	$( 'b-rows' ).innerHTML = rows.join( '' );
	$( 'b-tablewrap' ).hidden = false;
	const fluid = bench.results.filter( ( r ) => r.avg >= Math.min( 55, refreshHz * 0.9 ) && r.low >= 40 ).map( ( r ) => r.key );
	const ok = bench.results.filter( ( r ) => r.avg >= 30 && r.low >= 22 ).map( ( r ) => r.key );
	const best = ORDER.filter( ( k ) => fluid.includes( k ) ).pop();
	const bestOk = ORDER.filter( ( k ) => ok.includes( k ) ).pop();
	let v;
	if ( best ) v = `Fluido até o preset ${PRESETS[ best ].label}.`;
	else if ( bestOk ) v = `Nenhum preset fica fluido; ${PRESETS[ bestOk ].label} é utilizável (≥ 30 fps).`;
	else v = 'Pesado em todos os presets nesta máquina.';
	const capped = bench.results.some( ( r ) => r.avg > refreshHz * 0.92 );
	if ( capped ) v += ` Os presets que batem ${refreshHz} fps estão limitados pela taxa da tela; a coluna GPU ms mostra a folga real.`;
	if ( bench.results.some( ( r ) => r.errs ) ) v += ' Linhas com * tiveram erro de GPU e não valem como medida.';
	if ( gpuLost ) v = `Resultado inválido: a GPU perdeu o contexto durante o teste (${gpuLost}).`;
	$( 'b-verdict' ).textContent = v;
	const size = `${innerWidth}×${innerHeight} CSS px, DPR ${devicePixelRatio || 1}`;
	const lines = [
		'Teste de realismo · Secagem MP1 G4',
		new Date().toLocaleString( 'pt-BR' ),
		`Backend: ${backendLabel()}`,
		`GPU: ${gpuName()}`,
		`Janela: ${size} · tela ~${refreshHz} Hz`,
		...( renderer.backend.isWebGPUBackend ? [ `Limite MRT do WebGPU: ${MAX_BPS} bytes/pixel` ] : [] ),
		...( fallbackReason ? [ `Motivo da queda do WebGPU: ${fallbackReason}` ] : [] ),
		`Navegador: ${navigator.userAgent}`,
		'',
		'Preset   FPS  1%low  p95ms  GPUms',
		...bench.results.map( ( r ) => `${( PRESETS[ r.key ].label + ( r.errs ? '*' : '' ) ).padEnd( 7 )} ${r.avg.toFixed( 0 ).padStart( 4 )} ${r.low.toFixed( 0 ).padStart( 6 )} ${r.p95.toFixed( 1 ).padStart( 6 )} ${( r.gpu != null ? r.gpu.toFixed( 1 ) : '-' ).padStart( 6 )}` ),
		...bench.results.filter( ( r ) => r.adjust.length ).map( ( r ) => `${PRESETS[ r.key ].label}: ${r.adjust.join( ', ' )} (alvos ${r.bytes}/${r.limit ?? MAX_BPS} bytes)` ),
		...bench.results.filter( ( r ) => r.errs ).map( ( r ) => `${PRESETS[ r.key ].label}*: ${r.errs} erro(s) de GPU na medição (${gpuFirstError || 'sem mensagem'})` ),
		'',
		v
	];
	$( 'report' ).textContent = lines.join( '\n' );
	$( 'report' ).hidden = false;
	$( 'b-title' ).textContent = 'Resultado';
	$( 'b-sub' ).textContent = 'Copie o relatório e mande na conversa.';
	$( 'b-actions' ).hidden = false;
	$( 'b-prog' ).textContent = '';
}
$( 'run' ).onclick = runBenchmark;
$( 'b-close' ).onclick = () => { $( 'bench' ).hidden = true; };
$( 'b-copy' ).onclick = async () => {
	const txt = $( 'report' ).textContent;
	try {
		await navigator.clipboard.writeText( txt );
		$( 'b-copy' ).textContent = 'Copiado';
	} catch ( e ) {
		const r = document.createRange();
		r.selectNodeContents( $( 'report' ) );
		const s = getSelection();
		s.removeAllRanges();
		s.addRange( r );
		$( 'b-copy' ).textContent = 'Selecionado: Ctrl+C';
	}
	setTimeout( () => { $( 'b-copy' ).textContent = 'Copiar relatório'; }, 2500 );
};

// ------------------------------------------------------------------ loop
let last = performance.now(), fpsAcc = 0, fpsN = 0, fpsT = 0;
const hzSamples = [];
function frame() {
	const now = performance.now();
	const dt = now - last;
	last = now;
	if ( hzSamples.length < 90 && dt > 2 && dt < 60 ) hzSamples.push( dt );
	if ( hzSamples.length === 90 && refreshHz === 60 ) {
		const s = hzSamples.slice().sort( ( a, b ) => a - b );
		refreshHz = Math.round( 1000 / s[ 20 ] );
	}

	if ( bench.active ) {
		const el = ( now - bench.t0 ) / 1000;
		const total = WARM + MEASURE;
		const [ p, t ] = pathPose( Math.min( 1, el / total ) );
		camera.position.set( ...p );
		controls.target.set( ...t );
		camera.lookAt( controls.target );
		if ( bench.phase === 'warm' && el >= WARM ) bench.phase = 'measure';
		else if ( bench.phase === 'measure' ) bench.frames.push( dt );
		const i = ORDER.indexOf( bench.key ) + 1;
		$( 'b-prog' ).textContent = `${i}/4 · ${PRESETS[ bench.key ].label} · ${bench.phase === 'warm' ? 'compilando' : 'medindo'} ${Math.max( 0, total - el ).toFixed( 0 )} s`;
		if ( el >= total && bench.done ) { const d = bench.done; bench.done = null; d(); }
	} else if ( tween ) {
		tween.t = Math.min( 1, tween.t + dt / 1400 );
		const s = tween.t * tween.t * ( 3 - 2 * tween.t );
		camera.position.lerpVectors( tween.from[ 0 ], tween.to[ 0 ], s );
		controls.target.lerpVectors( tween.from[ 1 ], tween.to[ 1 ], s );
		if ( tween.t >= 1 ) tween = null;
		controls.update();
	} else {
		controls.update();
	}

	pipeline.render();
	if ( window.__grabNext ) { window.__grabNext = false; window.__grab = renderer.domElement.toDataURL( 'image/png' ); }
	sampleGPU();

	fpsAcc += dt; fpsN ++; fpsT += dt;
	if ( fpsT > 500 ) {
		$( 'fps' ).textContent = ( 1000 * fpsN / fpsAcc ).toFixed( 0 );
		const g = gpuMs != null ? ` · GPU ${gpuMs.toFixed( 1 )} ms` : '';
		if ( gpuLost ) return;
		$( 'tech' ).innerHTML = `${renderer.backend.isWebGPUBackend ? 'WebGPU' : ( FLAGS.has( 'auto' ) ? 'WebGL2*' : 'WebGL2' )} · ${PRESETS[ current ].label}<br>${renderer.domElement.width}×${renderer.domElement.height}${g}`;
		fpsAcc = 0; fpsN = 0; fpsT = 0;
	}
}

addEventListener( 'resize', () => {
	camera.aspect = innerWidth / innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize( innerWidth, innerHeight );
} );

// ---------------------------------------------------------------- início
( async () => {
	try {
		await renderer.init();
		const dev = renderer.backend.device;
		// WebGPU que cai ou falha nos primeiros segundos: recarrega uma vez em WebGL2
		const fallback = () => {
			if ( FLAGS.has( 'webgl' ) || FLAGS.has( 'nofallback' ) ) return false;
			try { sessionStorage.setItem( 'secagem-webgpu-erro', gpuFirstError || gpuLost || 'desconhecido' ); } catch ( e ) { /* sem storage */ }
			location.hash = 'webgl-auto';
			location.reload();
			return true;
		};
		if ( dev && dev.lost ) dev.lost.then( ( info ) => {
			window.__lost = info.message || info.reason || 'perdido';
			gpuLost = window.__lost;
			console.error( 'GPU device lost:', window.__lost );
			if ( performance.now() - bootAt < 15000 && fallback() ) return;
			$( 'tech' ).textContent = 'A GPU perdeu o contexto WebGPU. Recarregue a página.';
		} );
		if ( dev && dev.addEventListener ) dev.addEventListener( 'uncapturederror', ( e ) => {
			gpuErrors ++;
			if ( ! gpuFirstError ) gpuFirstError = String( e.error && e.error.message || 'erro sem mensagem' ).split( '\n' )[ 0 ].slice( 0, 220 );
			console.error( 'GPU error:', e.error && e.error.message );
		} );
		setTimeout( () => { if ( gpuErrors > 0 ) fallback(); }, 9000 );
		await load();
		$( 'l-txt' ).textContent = 'compilando shaders…';
		if ( ! FLAGS.has( 'noenv' ) ) await captureEnvironment();
		setPreset( 'alto' );
		renderer.setAnimationLoop( frame );
		setTimeout( () => { $( 'load' ).hidden = true; }, 400 );
		window.__r = renderer; window.__ready = true;
	} catch ( err ) {
		console.error( err );
		$( 'l-txt' ).textContent = 'Falhou ao iniciar: ' + ( err && err.message ? err.message : err );
		window.__error = String( err && err.stack || err );
	}
} )();
