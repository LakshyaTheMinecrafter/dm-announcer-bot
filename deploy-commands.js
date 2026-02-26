const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
require('dotenv').config();

const commands = [
    {
        name: 'dm',
        description: 'Send DM to all members with optional YouTube link',
        options: [
            {
                name: 'message',
                type: 3,
                description: 'The message to send',
                required: true
            },
            {
                name: 'youtube_url',
                type: 3,
                description: 'YouTube video URL (optional)',
                required: false
            },
            {
                name: 'role',
                type: 8,
                description: 'Role to mention (optional)',
                required: false
            },
            {
                name: 'batch_size',
                type: 4,
                description: 'Members per batch (1-50, default: 10)',
                required: false,
                min_value: 1,
                max_value: 50
            },
            {
                name: 'delay',
                type: 4,
                description: 'Delay between batches in seconds (5-60, default: 10)',
                required: false,
                min_value: 5,
                max_value: 60
            }
        ]
    },
    {
        name: 'dm-test',
        description: 'Test DM to yourself first',
        options: [
            {
                name: 'message',
                type: 3,
                description: 'The message to test',
                required: true
            },
            {
                name: 'youtube_url',
                type: 3,
                description: 'YouTube video URL (optional)',
                required: false
            }
        ]
    },
    {
        name: 'dm-stop',
        description: 'Stop an ongoing DM broadcast'
    },
    {
        name: 'dm-status',
        description: 'Check status of DM broadcast'
    },
    {
        name: 'banwords',
        description: 'Show banned words list'
    },
    {
        name: 'addbanword',
        description: 'Add a word to ban list',
        options: [
            {
                name: 'word',
                type: 3,
                description: 'Word to ban',
                required: true
            }
        ]
    },
    {
        name: 'removebanword',
        description: 'Remove a word from ban list',
        options: [
            {
                name: 'word',
                type: 3,
                description: 'Word to remove',
                required: true
            }
        ]
    },
    {
        name: 'stats',
        description: 'Show bot statistics'
    },
    {
        name: 'help',
        description: 'Show help menu'
    },
    {
        name: 'ping',
        description: 'Check bot latency'
    }
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

(async () => {
    try {
        console.log('🔄 Refreshing slash commands...');
        
        const app = await rest.get(Routes.currentApplication());
        const clientId = app.id;
        
        console.log(`📝 Registering commands for client ID: ${clientId}`);
        
        await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands }
        );

        console.log('✅ Successfully registered slash commands!');
        
    } catch (error) {
        console.error('❌ Error:', error);
    }
})();
