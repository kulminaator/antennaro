/**
 * In-scene text labels (zone names, compass points).
 *
 * Layer: L4 (render adapter). Text is rasterised with a 2D canvas into a
 * CanvasTexture, which keeps the project free of font loaders and texture files.
 */

import * as THREE from 'three';
import { fromCompass } from '../math/vec3.js';

/**
 * @param {string} text
 * @param {{fontPx?:number, colour?:string, background?:string, worldHeight?:number}} [options]
 * @returns {THREE.Sprite}
 */
export function createTextSprite(text, options = {}) {
  const { fontPx = 72, colour = '#eaf1fb', background = 'rgba(12,17,24,0.55)', worldHeight = 60 } = options;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = `600 ${fontPx}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
  ctx.font = font;
  const metrics = ctx.measureText(text);
  const pad = Math.round(fontPx * 0.45);
  canvas.width = Math.ceil(metrics.width) + pad * 2;
  canvas.height = fontPx + pad * 2;

  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = background;
  roundRect(ctx, 0, 0, canvas.width, canvas.height, Math.round(fontPx * 0.35));
  ctx.fill();
  ctx.fillStyle = colour;
  ctx.fillText(text, pad, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true });
  const sprite = new THREE.Sprite(material);
  const aspect = canvas.width / canvas.height;
  sprite.scale.set(worldHeight * aspect, worldHeight, 1);
  return sprite;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Labels for the four terrain zones plus the compass letters at the map edges.
 * @param {{zones:Array<{id:string,label:string,azimuthDeg:number}>, half:number,
 *   sampleHeight:(x:number, z:number)=>number, exaggeration?:number,
 *   worldHeight?:number, compassWorldHeight?:number}} options
 * @returns {{group:THREE.Group, dispose:()=>void}}
 */
export function createLabels(options) {
  const {
    zones, half, sampleHeight, exaggeration = 1,
    worldHeight = 44, compassWorldHeight = 30,
  } = options;
  const group = new THREE.Group();
  group.name = 'labels';
  const disposables = [];

  const place = (sprite, azimuthDeg, fraction, lift) => {
    const dir = fromCompass(azimuthDeg, 0, fraction * half);
    sprite.position.set(dir.x, sampleHeight(dir.x, dir.z) * exaggeration + lift, dir.z);
    group.add(sprite);
    disposables.push(sprite.material.map, sprite.material);
  };

  for (const zone of zones) {
    place(createTextSprite(zone.label.toUpperCase(), { worldHeight, background: 'rgba(10,14,20,0.42)' }), zone.azimuthDeg, 0.7, 120);
  }
  const compass = [['N', 0], ['E', 90], ['S', 180], ['W', 270]];
  for (const [text, azimuthDeg] of compass) {
    place(createTextSprite(text, { worldHeight: compassWorldHeight, colour: '#9fb6c9', background: 'rgba(10,14,20,0.28)' }), azimuthDeg, 0.99, 80);
  }

  function dispose() {
    for (const item of disposables) {
      if (item && typeof item.dispose === 'function') item.dispose();
    }
    disposables.length = 0;
  }

  return { group, dispose };
}
