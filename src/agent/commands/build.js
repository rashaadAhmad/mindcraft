import { BlueprintLibrary } from '../library/blueprints.js';

export async function build(bot, args) {
    // Load blueprints if not already loaded
    if (BlueprintLibrary.blueprints.size === 0) {
        await BlueprintLibrary.loadFromDirectory();
    }

    let blueprint;
    
    if (!args || args.length === 0) {
        // List available blueprint categories
        const categories = BlueprintLibrary.listBlueprints();
        const categoryList = Object.keys(categories).join(', ');
        bot.chat(`Available building types: ${categoryList}`);
        return;
    }

    const [type, style, size] = args;

    if (style && size) {
        // Try to get specific blueprint
        blueprint = BlueprintLibrary.get(type, style, size);
    } else {
        // Get random blueprint of requested type
        blueprint = BlueprintLibrary.getRandomBlueprint(type);
    }

    if (!blueprint) {
        bot.chat(`I couldn't find a blueprint for ${args.join(' ')}`);
        return;
    }

    bot.chat(`I'll build a ${blueprint.name} for you!`);
    
    try {
        await blueprint.build(bot, bot.entity.position);
        bot.chat('Building complete!');
    } catch (err) {
        bot.chat('Sorry, I had trouble building that.');
        console.error('Build error:', err);
    }
} 