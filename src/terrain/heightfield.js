/**
 * Height field: a square grid of elevations plus the mapping between world
 * metres and grid indices.
 *
 * Layer: L1 (pure domain). Float32Array storage, no renderer, no DOM.
 * World domain is `[-half, +half]` on both axes, sampled bilinearly with
 * clamped edges so queries outside the domain never return NaN.
 */

export class HeightField {
  /**
   * @param {{size:number, worldSize:number, heights?:Float32Array}} opts
   */
  constructor({ size, worldSize, heights }) {
    if (!Number.isInteger(size) || size < 3) throw new RangeError('HeightField size must be an integer >= 3');
    if (!(worldSize > 0)) throw new RangeError('HeightField worldSize must be > 0');
    this.size = size;
    this.worldSize = worldSize;
    this.cellSize = worldSize / (size - 1);
    this.half = worldSize / 2;
    /** @type {Float32Array} row-major, index = iz * size + ix */
    this.heights = heights && heights.length === size * size ? heights : new Float32Array(size * size);
  }

  clone() {
    return new HeightField({
      size: this.size,
      worldSize: this.worldSize,
      heights: Float32Array.from(this.heights),
    });
  }

  index(ix, iz) {
    return iz * this.size + ix;
  }

  inBounds(ix, iz) {
    return ix >= 0 && iz >= 0 && ix < this.size && iz < this.size;
  }

  /** World X -> fractional cell coordinate. */
  cellX(x) {
    return (x + this.half) / this.cellSize;
  }

  cellZ(z) {
    return (z + this.half) / this.cellSize;
  }

  /** Cell coordinate -> world metres. */
  worldX(ix) {
    return -this.half + ix * this.cellSize;
  }

  worldZ(iz) {
    return -this.half + iz * this.cellSize;
  }

  cellCentre(index) {
    const ix = index % this.size;
    const iz = (index - ix) / this.size;
    return { x: this.worldX(ix), z: this.worldZ(iz) };
  }

  heightAtCell(ix, iz) {
    const cx = Math.max(0, Math.min(this.size - 1, Math.round(ix)));
    const cz = Math.max(0, Math.min(this.size - 1, Math.round(iz)));
    return this.heights[this.index(cx, cz)];
  }

  setHeightAtCell(ix, iz, value) {
    if (!this.inBounds(ix, iz)) return false;
    this.heights[this.index(ix, iz)] = value;
    return true;
  }

  /** Bilinear elevation query in world metres. */
  sample(x, z) {
    const fx = Math.max(0, Math.min(this.size - 1.0001, this.cellX(x)));
    const fz = Math.max(0, Math.min(this.size - 1.0001, this.cellZ(z)));
    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    const x1 = Math.min(x0 + 1, this.size - 1);
    const z1 = Math.min(z0 + 1, this.size - 1);
    const tx = fx - x0;
    const tz = fz - z0;
    const h00 = this.heights[this.index(x0, z0)];
    const h10 = this.heights[this.index(x1, z0)];
    const h01 = this.heights[this.index(x0, z1)];
    const h11 = this.heights[this.index(x1, z1)];
    const top = h00 + (h10 - h00) * tx;
    const bottom = h01 + (h11 - h01) * tx;
    return top + (bottom - top) * tz;
  }

  /** Fill the grid from `fn(worldX, worldZ) -> metres`. */
  fillFromFunction(fn) {
    for (let iz = 0; iz < this.size; iz += 1) {
      const z = this.worldZ(iz);
      for (let ix = 0; ix < this.size; ix += 1) {
        this.heights[this.index(ix, iz)] = fn(this.worldX(ix), z);
      }
    }
    return this;
  }

  /** Transform every stored value in place. */
  mapInPlace(fn) {
    for (let i = 0; i < this.heights.length; i += 1) this.heights[i] = fn(this.heights[i], i);
    return this;
  }

  stats() {
    let min = Infinity;
    let max = -Infinity;
    let total = 0;
    for (let i = 0; i < this.heights.length; i += 1) {
      const h = this.heights[i];
      if (h < min) min = h;
      if (h > max) max = h;
      total += h;
    }
    const n = this.heights.length;
    return { cells: n, min, max, mean: n === 0 ? 0 : total / n, relief: max - min };
  }

  /** Surface normal from central differences. */
  normalAt(x, z) {
    const d = this.cellSize;
    const dx = this.sample(x + d, z) - this.sample(x - d, z);
    const dz = this.sample(x, z + d) - this.sample(x, z - d);
    const nx = -dx / (2 * d);
    const nz = -dz / (2 * d);
    const len = Math.hypot(nx, 1, nz) || 1;
    return { x: nx / len, y: 1 / len, z: nz / len };
  }

  /** Slope in degrees between the flat plane and the local surface normal. */
  slopeDegAt(x, z) {
    const n = this.normalAt(x, z);
    return (Math.acos(Math.max(-1, Math.min(1, n.y))) * 180) / Math.PI;
  }

  /** Row-major iteration over every cell centre. */
  forEachCell(cb) {
    for (let iz = 0; iz < this.size; iz += 1) {
      const z = this.worldZ(iz);
      for (let ix = 0; ix < this.size; ix += 1) {
        const index = this.index(ix, iz);
        cb(this.worldX(ix), z, this.heights[index], index, ix, iz);
      }
    }
  }
}
