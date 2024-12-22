import * as skills from './skills.js';
import * as world from './world.js';
import Vec3 from 'vec3';
import fs from 'fs';
import path from 'path';
import { parse as parseNBT } from 'prismarine-nbt';
import { promisify } from 'util';
import * as mc from '../../utils/mcdata.js';
import { Buffer } from 'buffer';
import zlib from 'zlib';

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
        try {
            console.log(`Reading file: ${filepath}`);
            let data = await readFile(filepath);
            console.log(`Parsing NBT data from ${filepath}`);
            const { parsed: nbt } = await parseNBT(data);
            //console.log('NBT data structure:', JSON.stringify(nbt, null, 2));
            
            const name = path.basename(filepath, path.extname(filepath));
            const blueprint = new Blueprint(name);

            // Handle modern format (Schematic NBT format)
            if (nbt.value.Schematic) {
                console.log('Parsing Modern Schematic format...');
                const schematic = nbt.value.Schematic.value;
                
                blueprint.metadata.size = {
                    x: schematic.Width.value,
                    y: schematic.Height.value,
                    z: schematic.Length.value
                };

                console.log('Size:', blueprint.metadata.size);
                //console.log('Full Palette:', JSON.stringify(schematic.Palette.value, null, 2));

                // Convert palette to map of id -> block name
                const palette = {};
                for (const [blockName, id] of Object.entries(schematic.Palette.value)) {
                    palette[id.value] = blockName.replace('minecraft:', '');
                }

                const blockData = schematic.BlockData.value;
                console.log(`Processing ${blockData.length} blocks...`);

                for (let i = 0; i < blockData.length; i++) {
                    const blockId = blockData[i];
                    if (blockId === 0) continue; // Skip air

                    const y = Math.floor(i / (blueprint.metadata.size.x * blueprint.metadata.size.z));
                    const z = Math.floor((i % (blueprint.metadata.size.x * blueprint.metadata.size.z)) / blueprint.metadata.size.x);
                    const x = i % blueprint.metadata.size.x;

                    const blockName = palette[blockId];
                    if (blockName) {
                        blueprint.blocks.push({
                            x, y, z,
                            type: blockName.toLowerCase(),
                            data: 0
                        });
                    }
                }
            }
            // Handle structure format (.nbt)
            else if (nbt.value.size) {
                console.log('Parsing structure format...');
                
                // Get size from the size list
                const size = nbt.value.size.value.value;
                blueprint.metadata.size = {
                    x: size[0],
                    y: size[1],
                    z: size[2]
                };

                // The palette is an array of block definitions
                const paletteList = nbt.value.palette.value.value;
                const blocks = nbt.value.blocks.value.value;

                console.log(nbt,nbt.value.palette.value)
                
                console.log('Structure size:', blueprint.metadata.size);
                console.log('Palette size:', paletteList.length);
                console.log('Block count:', blocks.length);

                // Process each block
                for (const block of blocks) {
                    const pos = block.value.pos.value.value;  // Position array
                    const stateId = block.value.state.value;  // Index into palette
                    
                    // Get block definition from palette
                    const blockDef = paletteList[stateId];
                    if (blockDef && blockDef.value && blockDef.value.Name) {
                        const blockName = blockDef.value.Name.value.replace('minecraft:', '');
                        
                        // Get block properties if they exist
                        let data = 0;
                        if (blockDef.value.Properties) {
                            const props = blockDef.value.Properties.value;
                            // Handle special properties like facing direction
                            if (props.facing) {
                                const directions = {'north': 0, 'south': 1, 'west': 2, 'east': 3};
                                data = directions[props.facing.value] || 0;
                            }
                        }

                        blueprint.blocks.push({
                            x: pos[0],
                            y: pos[1],
                            z: pos[2],
                            type: blockName.toLowerCase(),
                            data: data
                        });
                    }
                }

                console.log(`Processed ${blueprint.blocks.length} blocks`);
            }else{
                console.log("none of the above 1")
                console.log(nbt.value)
            }

            console.log(`Loaded ${blueprint.blocks.length} blocks for ${name}`);
            blueprint.calculateMaterials();
            return blueprint;
        } catch (err) {
            console.error(`Error in fromSchematic for ${filepath}:`, err.stack || err);
            throw err;
        }
    }

    static async fromSpongeSchematic(filepath) {
        try {
            const data = await readFile(filepath);
            const { parsed: nbt } = await parseNBT(data);
            //console.log('Sponge NBT data structure:', JSON.stringify(nbt, null, 2));
            
            const name = path.basename(filepath, '.schem');
            const blueprint = new Blueprint(name);
            
            // Sponge format is wrapped in a Schematic compound
            const schematic = nbt.value.Schematic ? nbt.value.Schematic.value : nbt.value;
            
            blueprint.metadata.size = {
                x: schematic.Width.value,
                y: schematic.Height.value,
                z: schematic.Length.value
            };

            console.log('Size:', blueprint.metadata.size);
            console.log(schematic)
            //console.log('Full Palette:', JSON.stringify(schematic.Palette.value, null, 2));

            // Convert palette to map of id -> block name
            const palette = {};
            for (const [blockName, id] of Object.entries(schematic.Blocks.value.Palette.value)) {
                palette[id.value] = blockName.replace('minecraft:', '');
            }

            var blockData = schematic.Blocks.value.Data.value;
            console.log(`Processing ${blockData.length} blocks...`);

            for (let i = 0; i < blockData.length; i++) {
                const blockId = blockData[i];
                //if (blockId === 0) continue; // Skip air

                const y = Math.floor(i / (blueprint.metadata.size.x * blueprint.metadata.size.z));
                const z = Math.floor((i % (blueprint.metadata.size.x * blueprint.metadata.size.z)) / blueprint.metadata.size.x);
                const x = i % blueprint.metadata.size.x;

                const blockName = palette[blockId];
                if (blockName) {
                    blueprint.blocks.push({
                        x, y, z,
                        type: blockName.toLowerCase(),
                        data: 0
                    });
                }
            }

            console.log(`Loaded ${blueprint.blocks.length} blocks for ${name}`);
            blueprint.calculateMaterials();
            return blueprint;
        } catch (err) {
            console.error(`Error in fromSpongeSchematic for ${filepath}:`, err.stack || err);
            throw err;
        }
    }

    static async fromLitematic(filepath) {
        const data = await readFile(filepath);
        const unzipped = zlib.gunzipSync(data);
        const { parsed: nbt } = await parseNBT(Buffer.from(unzipped));
        
        const name = path.basename(filepath, '.litematic');
        const blueprint = new Blueprint(name);
        
        const regions = Object.values(nbt.value.Regions.value)[0].value;
        
        blueprint.metadata.size = {
            x: regions.Size.value.list[0],
            y: regions.Size.value.list[1],
            z: regions.Size.value.list[2]
        };

        const palette = regions.BlockStatePalette.value.list;
        const blockStates = regions.BlockStates.value.list;

        // Convert block states to our format
        for (let i = 0; i < blockStates.length; i++) {
            const state = blockStates[i];
            //if (state === 0) continue; // Skip air

            const y = Math.floor(i / (blueprint.metadata.size.x * blueprint.metadata.size.z));
            const z = Math.floor((i % (blueprint.metadata.size.x * blueprint.metadata.size.z)) / blueprint.metadata.size.x);
            const x = i % blueprint.metadata.size.x;

            const blockName = palette[state].value.Name.value;
            blueprint.blocks.push({
                x, y, z,
                type: blockName,
                data: 0
            });
        }

        blueprint.calculateMaterials();
        return blueprint;
    }

    async build(bot, position) {
        const startPos = position || world.getPosition(bot);
        console.log("Starting build at position:", startPos);
        
        if (!this.blocks || this.blocks.length === 0) {
            console.error("No blocks to build! Blueprint may not have loaded correctly.");
            return;
        }
        
        // Sort blocks from bottom to top for proper placement
        const sortedBlocks = [...this.blocks].sort((a, b) => a.y - b.y);
        console.log(`Building ${sortedBlocks.length} blocks total`);

        // Group blocks by Y level for layer-by-layer building
        const layers = {};
        for (const block of sortedBlocks) {
            if (!layers[block.y]) layers[block.y] = [];
            layers[block.y].push(block);
        }

        // Build layer by layer
        for (const y of Object.keys(layers).sort((a, b) => a - b)) {
            console.log(`Building layer ${y} with ${layers[y].length} blocks`);
            for (const block of layers[y]) {
                try {
                    // Special handling for doors, torches, etc.
                    const face = this.getBlockFace(block);
                    const worldX = startPos.x + block.x;
                    const worldY = startPos.y + block.y;
                    const worldZ = startPos.z + block.z;
                    //console.log(`Placing ${block.type} at (${worldX}, ${worldY}, ${worldZ}) with face ${face}`);
                    
                    // Enable cheat mode temporarily if needed
                    const wasCheatMode = bot.modes.isOn('cheat');
                    if (!wasCheatMode) bot.modes.setOn('cheat', true);
                    bot.modes.setOn('unstuck',false);
                    await skills.placeBlock(
                        bot,
                        block.type,
                        worldX,
                        worldY,
                        worldZ,
                        face
                    );

                    // Restore previous cheat mode state
                    if (!wasCheatMode) bot.modes.setOn('cheat', false);

                    // Small delay between blocks to prevent overwhelming the server
                    await new Promise(resolve => setTimeout(resolve, 0));
                } catch (err) {
                    console.error(`Failed to place ${block.type} at relative position ${block.x},${block.y},${block.z}:`, err);
                }
            }
        }
        //console.log(types)
        console.log("Build complete!");
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
        const directories = ['./schematics', './blueprints'];
        
        for (const dir of directories) {
            try {
                console.log(`Checking directory: ${dir}`);
                const files = fs.readdirSync(dir);
                console.log(`Found files in ${dir}:`, files);
                
                for (const file of files) {
                    try {
                        // Use absolute path
                        const filePath = path.resolve(dir, file);
                        console.log(`Processing file: ${filePath}`);
                        let blueprint = null;
                        const name = path.basename(file, path.extname(file));

                        // Handle different file formats
                        const ext = path.extname(file).toLowerCase();
                        console.log(`File extension: ${ext}`);
                        
                        try {
                            switch (ext) {
                                case '.nbt':
                                    blueprint = await Blueprint.fromSchematic(filePath);
                                    break;
                                case '.schem':
                                    blueprint = await Blueprint.fromSpongeSchematic(filePath);
                                    break;
                                case '.schematic':
                                    blueprint = await Blueprint.fromSchematic(filePath);
                                    break;
                                case '.litematic':
                                    blueprint = await Blueprint.fromLitematic(filePath);
                                    break;
                                case '.json':
                                    const data = JSON.parse(await readFile(filePath));
                                    blueprint = new Blueprint(name, data.metadata);
                                    blueprint.blocks = data.blocks;
                                    break;
                            }
                        } catch (loadErr) {
                            console.error(`Error loading ${file}:`, loadErr.stack || loadErr);
                            continue;
                        }

                        if (blueprint) {
                            console.log(`Successfully loaded blueprint: ${name}`);
                            this.blueprints.set(name, blueprint);
                        } else {
                            console.log(`No handler for file type: ${ext}`);
                        }
                    } catch (err) {
                        console.error(`Failed to process ${file}:`, err.stack || err);
                    }
                }
            } catch (err) {
                console.warn(`Directory ${dir} not found or not accessible:`, err.stack || err);
            }
        }
        
        console.log(`Loaded ${this.blueprints.size} blueprints`);
        if (this.blueprints.size === 0) {
            console.log('No blueprints were loaded. Available formats:', ['.nbt', '.schem', '.schematic', '.litematic', '.json']);
        }
    }

    // Add method to list available blueprints
    static listBlueprints() {
        const blueprints = Array.from(this.blueprints.keys());
        const categorized = {};
        
        for (const name of blueprints) {
            const parts = name.split('_');
            const category = parts[0]; // e.g., 'house' from 'house_wooden_small'
            
            if (!categorized[category]) {
                categorized[category] = [];
            }
            categorized[category].push(name);
        }
        
        return categorized;
    }

    // Add method to choose a random blueprint of a certain type
    static getRandomBlueprint(type) {
        const blueprints = Array.from(this.blueprints.keys())
            .filter(name => name.startsWith(type));
            
        if (blueprints.length === 0) {
            console.warn(`No blueprints found of type: ${type}`);
            return null;
        }
        
        const randomIndex = Math.floor(Math.random() * blueprints.length);
        return this.blueprints.get(blueprints[randomIndex]);
    }

    static get(name, style = 'default', size = 'small') {
        // Try exact match first
        const exactKey = `${name}_${style}_${size}`;
        if (this.blueprints.has(exactKey)) {
            return this.blueprints.get(exactKey);
        }

        // Try partial matches
        const partialKey = `${name}_${style}`;
        const partialMatches = Array.from(this.blueprints.keys())
            .filter(key => key.startsWith(partialKey));
        
        if (partialMatches.length > 0) {
            return this.blueprints.get(partialMatches[0]);
        }

        // Try just the name
        const nameMatches = Array.from(this.blueprints.keys())
            .filter(key => key.startsWith(name));
        
        if (nameMatches.length > 0) {
            return this.blueprints.get(nameMatches[0]);
        }

        console.warn(`No blueprint found for name: ${name}, style: ${style}, size: ${size}`);
        return null;
    }
} 