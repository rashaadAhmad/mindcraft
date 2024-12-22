import * as skills from './skills.js';
import * as world from './world.js';
import Vec3 from 'vec3';
import fs from 'fs';
import path from 'path';
import { parse as parseNBT } from 'prismarine-nbt';
import { promisify } from 'util';
import * as mc from '../../utils/mcdata.js';

const readFile = promisify(fs.readFile);

export class Blueprint {
    constructor(name, metadata = {}) {
        this.name = name;
        this.blocks = [];
        this.metadata = {
            size: { x: 0, y: 0, z: 0 },
            materials: {},
            tags: [],
            ...metadata
        };
    }

    static async fromSchematic(filepath) {
        let data = await readFile(filepath);
        const { parsed: nbt } = await parseNBT(data);
        
        // Create blueprint from filename
        const name = path.basename(filepath, '.nbt');
        const blueprint = new Blueprint(name);

        // Parse schematic dimensions
        blueprint.metadata.size = {
            x: nbt.value.Width.value,
            y: nbt.value.Height.value,
            z: nbt.value.Length.value
        };

        // Get block data arrays
        const blocks = nbt.value.Blocks.value;
        data = nbt.value.Data.value;
        
        // Parse block palette (for newer formats)
        const palette = {};
        if (nbt.value.Palette) {
            for (const [name, id] of Object.entries(nbt.value.Palette.value)) {
                palette[id.value] = name;
            }
        }

        // Convert schematic data to block list
        for (let y = 0; y < blueprint.metadata.size.y; y++) {
            for (let z = 0; z < blueprint.metadata.size.z; z++) {
                for (let x = 0; x < blueprint.metadata.size.x; x++) {
                    const index = y * blueprint.metadata.size.x * blueprint.metadata.size.z + z * blueprint.metadata.size.x + x;
                    const blockId = blocks[index];
                    const blockData = data[index];

                    // Skip air blocks
                    if (blockId === 0) continue;

                    // Get block name from palette or legacy ID
                    let blockName;
                    if (palette[blockId]) {
                        blockName = palette[blockId];
                    } else {
                        blockName = mc.getBlockName(blockId, blockData);
                    }

                    if (blockName) {
                        blueprint.blocks.push({
                            x, y, z,
                            type: blockName,
                            data: blockData
                        });
                    }
                }
            }
        }

        blueprint.calculateMaterials();
        return blueprint;
    }

    async build(bot, position) {
        const startPos = position || world.getPosition(bot);
        
        // Sort blocks from bottom to top for proper placement
        const sortedBlocks = [...this.blocks].sort((a, b) => a.y - b.y);

        // Group blocks by Y level for layer-by-layer building
        const layers = {};
        for (const block of sortedBlocks) {
            if (!layers[block.y]) layers[block.y] = [];
            layers[block.y].push(block);
        }

        // Build layer by layer
        for (const y of Object.keys(layers).sort((a, b) => a - b)) {
            for (const block of layers[y]) {
                try {
                    // Special handling for doors, torches, etc.
                    const face = this.getBlockFace(block);
                    
                    await skills.placeBlock(
                        bot,
                        block.type,
                        startPos.x + block.x,
                        startPos.y + block.y,
                        startPos.z + block.z,
                        face
                    );
                } catch (err) {
                    console.log(`Failed to place ${block.type} at relative position ${block.x},${block.y},${block.z}`);
                }
            }
        }
    }

    getBlockFace(block) {
        // Determine block face based on block type and data value
        if (block.type.includes('door')) {
            return ['north', 'south', 'west', 'east'][block.data & 0x03];
        }
        if (block.type.includes('torch')) {
            return block.data === 5 ? 'bottom' : ['east', 'west', 'south', 'north', 'top'][block.data - 1];
        }
        if (block.type.includes('stairs')) {
            return ['east', 'west', 'south', 'north'][block.data & 0x03];
        }
        return 'bottom';
    }

    calculateMaterials() {
        const materials = {};
        for (const block of this.blocks) {
            materials[block.type] = (materials[block.type] || 0) + 1;
        }
        this.metadata.materials = materials;
        return materials;
    }
}

export class BlueprintLibrary {
    static blueprints = new Map();
    
    static async loadFromDirectory(dirPath = './schematics') {
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
            if (file.endsWith('.nbt')) {
                try {
                    const blueprint = await Blueprint.fromSchematic(path.join(dirPath, file));
                    // Store with name pattern: house_wooden_small.nbt -> house_wooden_small
                    const name = path.basename(file, '.nbt');
                    this.blueprints.set(name, blueprint);
                } catch (err) {
                    console.error(`Failed to load schematic ${file}:`, err);
                }
            }
        }
    }

    static get(name, style = 'default', size = 'small') {
        // Try exact match first
        const exactKey = `${name}_${style}_${size}`;
        if (this.blueprints.has(exactKey)) {
            return this.blueprints.get(exactKey);
        }

        // Try partial matches
        const partialKey = `${name}_${style}`;
        for (const [key, blueprint] of this.blueprints) {
            if (key.startsWith(partialKey)) {
                return blueprint;
            }
        }

        // Try just the name
        for (const [key, blueprint] of this.blueprints) {
            if (key.startsWith(name)) {
                return blueprint;
            }
        }

        return null;
    }
} 