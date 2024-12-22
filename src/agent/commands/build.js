import { Blueprint, BlueprintLibrary } from '../library/blueprints.js';

export const buildCommands = {
    buildFromBlueprint: {
        name: "!buildFromBlueprint",
        description: "Build a structure from a blueprint",
        syntax: "!buildFromBlueprint(name, style?, size?)",
        examples: ["!buildFromBlueprint('house', 'wooden', 'small')"],
        perform: async (agent, name, style = 'default', size = 'small') => {
            const blueprint = BlueprintLibrary.get(name, style, size);
            if (!blueprint) {
                return `Blueprint ${name}_${style}_${size} not found`;
            }
            
            await blueprint.build(agent.bot);
            return `Built ${name} from blueprint!`;
        }
    }
} 