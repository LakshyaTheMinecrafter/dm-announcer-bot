const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, Partials, Collection, ActivityType } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const axios = require('axios');
const cheerio = require('cheerio');
const fetch = require('node-fetch');
require('dotenv').config();

// Initialize client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel]
});

// Bot configuration
const PREFIX = '!';

// Store for user cooldowns
const userCooldowns = new Collection();
const DM_COOLDOWN = 30000; // 30 seconds cooldown per user

// Store for active DM broadcasts
const activeBroadcasts = new Map();

// Ban words list
let BAN_WORDS = new Set([
    'free vps', 'dm me', 'Dm me', 'fuck', 'nigga', 
    'discord.gg', 'freevps', 'discord.gg/', 'discord gg',
    'free vps?', 'freevps?', 'discord.gg/invite'
]);

// YouTube cache
const youtubeCache = new Map();
const CACHE_DURATION = 3600000;

// ==================== UTILITY FUNCTIONS ====================

// Get YouTube video ID from URL
function getYouTubeVideoId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
        /youtube\.com\/shorts\/([^&\n?#]+)/,
        /youtube\.com\/live\/([^&\n?#]+)/
    ];
    
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) {
            return match[1];
        }
    }
    return null;
}

// Get YouTube info with fallbacks
async function getYouTubeInfo(url) {
    try {
        const videoId = getYouTubeVideoId(url);
        if (!videoId) {
            throw new Error('Invalid YouTube URL');
        }
        
        // Check cache
        const cached = youtubeCache.get(videoId);
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
            return cached.data;
        }
        
        // Try oEmbed API
        try {
            const response = await axios.get(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`, {
                timeout: 5000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            if (response.data) {
                const videoInfo = {
                    title: response.data.title,
                    author: response.data.author_name,
                    thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
                    url: `https://youtu.be/${videoId}`,
                    embedUrl: `https://www.youtube.com/embed/${videoId}`,
                    source: 'oEmbed'
                };
                
                youtubeCache.set(videoId, {
                    timestamp: Date.now(),
                    data: videoInfo
                });
                
                return videoInfo;
            }
        } catch (error) {
            console.log('oEmbed failed, using fallback');
        }
        
        // Fallback with basic info
        const fallbackInfo = {
            title: 'YouTube Video',
            author: 'YouTube Creator',
            thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
            url: `https://youtu.be/${videoId}`,
            embedUrl: `https://www.youtube.com/embed/${videoId}`,
            source: 'Fallback'
        };
        
        youtubeCache.set(videoId, {
            timestamp: Date.now(),
            data: fallbackInfo
        });
        
        return fallbackInfo;
        
    } catch (error) {
        console.error('YouTube info error:', error.message);
        throw error;
    }
}

// Validate YouTube URL
function validateYouTubeUrl(url) {
    const patterns = [
        /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/,
        /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+/,
        /^https?:\/\/youtu\.be\/[\w-]+/
    ];
    
    return patterns.some(pattern => pattern.test(url));
}

// Create DM embed
function createDMEmbed(message, youtubeInfo = null, mentionedRole = null) {
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📢 **Important Announcement**')
        .setDescription(message)
        .setTimestamp()
        .setFooter({ text: 'Server Announcement' });

    if (youtubeInfo) {
        embed.addFields(
            { 
                name: '🎬 **YouTube Video**', 
                value: `**[${youtubeInfo.title}](${youtubeInfo.url})**`, 
                inline: false 
            }
        );
        
        if (youtubeInfo.thumbnail) {
            embed.setImage(youtubeInfo.thumbnail);
        }
    }

    if (mentionedRole) {
        embed.addFields(
            { name: '🎯 **Special Mention**', value: `${mentionedRole}`, inline: false }
        );
    }

    return embed;
}

// Check cooldown
function checkCooldown(userId) {
    const now = Date.now();
    const cooldown = userCooldowns.get(userId);
    
    if (cooldown) {
        const remaining = cooldown - now;
        if (remaining > 0) {
            return Math.ceil(remaining / 1000);
        }
    }
    return 0;
}

// Set cooldown
function setCooldown(userId) {
    userCooldowns.set(userId, Date.now() + DM_COOLDOWN);
    setTimeout(() => userCooldowns.delete(userId), DM_COOLDOWN);
}

// Format time
function formatDuration(seconds) {
    if (!seconds) return 'Unknown';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
        return `${hours}h ${minutes}m ${secs}s`;
    }
    if (minutes > 0) {
        return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
}

// ==================== EVENT HANDLERS ====================

client.once('ready', async () => {
    console.log('══════════════════════════════════════');
    console.log(`✅ ${client.user.tag} is online!`);
    console.log(`🆔 Bot ID: ${client.user.id}`);
    console.log(`📊 Servers: ${client.guilds.cache.size}`);
    console.log('══════════════════════════════════════');
    
    client.user.setPresence({
        activities: [{
            name: 'DM System | /help',
            type: ActivityType.Watching
        }],
        status: 'online'
    });

    await registerSlashCommands();
});

// Register slash commands
async function registerSlashCommands() {
    try {
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
        
        console.log('🔄 Registering slash commands...');
        
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        
        console.log('✅ Slash commands registered!');
        
    } catch (error) {
        console.error('❌ Error registering commands:', error);
    }
}

// ==================== SLASH COMMAND HANDLERS ====================

async function handleSlashDM(interaction, options) {
    // Check permissions
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ 
            content: '❌ You need **Administrator** permissions to use this command.', 
            ephemeral: true 
        });
    }

    // Check if user already has active broadcast
    const activeBroadcast = activeBroadcasts.get(interaction.user.id);
    if (activeBroadcast) {
        return interaction.reply({ 
            content: `❌ You already have an active DM broadcast running.\nUse \`/dm-status\` to check progress or \`/dm-stop\` to cancel.`,
            ephemeral: true 
        });
    }

    // Check cooldown
    const cooldownRemaining = checkCooldown(interaction.user.id);
    if (cooldownRemaining > 0) {
        return interaction.reply({ 
            content: `⏰ Please wait **${cooldownRemaining} seconds** before starting a new broadcast.`, 
            ephemeral: true 
        });
    }

    // Get options
    const message = options.getString('message');
    const youtubeUrl = options.getString('youtube_url');
    const role = options.getRole('role');
    const batchSize = options.getInteger('batch_size') || 10;
    const batchDelay = options.getInteger('delay') || 10;

    // Validate message length
    if (message.length > 1500) {
        return interaction.reply({ 
            content: '❌ Message is too long (max 1500 characters).', 
            ephemeral: true 
        });
    }

    // Validate YouTube URL if provided
    let youtubeInfo = null;
    if (youtubeUrl) {
        if (!validateYouTubeUrl(youtubeUrl)) {
            return interaction.reply({ 
                content: '❌ Invalid YouTube URL. Please provide a valid YouTube video link.', 
                ephemeral: true 
            });
        }

        await interaction.deferReply({ ephemeral: true });
        
        try {
            youtubeInfo = await getYouTubeInfo(youtubeUrl);
        } catch (error) {
            // Use fallback even if details can't be fetched
            youtubeInfo = {
                title: 'YouTube Video',
                url: youtubeUrl,
                author: 'YouTube Creator',
                thumbnail: null
            };
        }
    } else {
        await interaction.deferReply({ ephemeral: true });
    }

    // Get all non-bot members
    await interaction.guild.members.fetch();
    const allMembers = Array.from(interaction.guild.members.cache.filter(m => !m.user.bot).values());
    
    if (allMembers.length === 0) {
        return interaction.editReply({ 
            content: '❌ No non-bot members found to DM.', 
            ephemeral: true 
        });
    }

    // Split members into batches
    const batches = [];
    for (let i = 0; i < allMembers.length; i += batchSize) {
        batches.push(allMembers.slice(i, i + batchSize));
    }

    // Calculate estimated time
    const estimatedMinutes = Math.ceil((batches.length * batchDelay) / 60);

    // Create confirmation embed
    const confirmationEmbed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('⚠️ **DM Broadcast Confirmation**')
        .setDescription(`You are about to send a DM to **${allMembers.length.toLocaleString()}** members.`)
        .addFields(
            { name: 'Message Preview', value: message.substring(0, 100) + (message.length > 100 ? '...' : ''), inline: false },
            { name: 'YouTube Video', value: youtubeInfo ? '✅ Included' : '❌ Not included', inline: true },
            { name: 'Role Mention', value: role ? `✅ ${role.name}` : '❌ Not included', inline: true },
            { name: 'Batch Size', value: `${batchSize} members/batch`, inline: true },
            { name: 'Batch Delay', value: `${batchDelay} seconds`, inline: true },
            { name: 'Total Batches', value: batches.length.toString(), inline: true },
            { name: 'Est. Time', value: `${estimatedMinutes} minutes`, inline: true }
        )
        .setFooter({ text: 'Use /dm-status to monitor progress, /dm-stop to cancel' });

    const confirmationMessage = await interaction.editReply({ 
        embeds: [confirmationEmbed],
        components: [{
            type: 1,
            components: [
                {
                    type: 2,
                    label: '✅ Confirm & Start',
                    style: 3,
                    customId: 'confirm_dm'
                },
                {
                    type: 2,
                    label: '❌ Cancel',
                    style: 4,
                    customId: 'cancel_dm'
                }
            ]
        }],
        ephemeral: false  // Changed to non-ephemeral so it doesn't timeout
    });

    // Store broadcast data for this user
    const broadcastData = {
        interaction: interaction,
        message: message,
        youtubeInfo: youtubeInfo,
        role: role,
        batches: batches,
        batchSize: batchSize,
        batchDelay: batchDelay * 1000,
        totalMembers: allMembers.length,
        successful: 0,
        failed: 0,
        currentBatch: 0,
        isRunning: false,
        startTime: null,
        statusMessage: null
    };

    // Create button collector with longer timeout
    const filter = i => i.user.id === interaction.user.id;
    const collector = confirmationMessage.createMessageComponentCollector({ 
        filter, 
        time: 120000  // 2 minutes timeout
    });

    collector.on('collect', async i => {
        if (i.customId === 'cancel_dm') {
            await i.update({ 
                content: '❌ DM broadcast cancelled.', 
                embeds: [], 
                components: [],
                ephemeral: false 
            });
            collector.stop();
            return;
        }

        if (i.customId === 'confirm_dm') {
            await i.update({ 
                content: '📤 **Starting DM broadcast...**\nThis will take several minutes for large servers.',
                embeds: [],
                components: [],
                ephemeral: false 
            });

            // Set cooldown
            setCooldown(interaction.user.id);

            // Store broadcast data
            activeBroadcasts.set(interaction.user.id, broadcastData);

            // Start the broadcast
            startDMBroadcast(broadcastData);

            collector.stop();
        }
    });

    collector.on('end', async (collected, reason) => {
        if (reason === 'time') {
            // Only show timeout if no button was pressed
            if (collected.size === 0) {
                await interaction.editReply({ 
                    content: '⏰ Confirmation timed out. Please use the command again.', 
                    embeds: [], 
                    components: [],
                    ephemeral: false 
                });
            }
        }
    });
}

// Start DM broadcast with batch processing
async function startDMBroadcast(broadcastData) {
    const { interaction, batches, batchDelay } = broadcastData;
    
    broadcastData.isRunning = true;
    broadcastData.startTime = Date.now();
    
    // Create initial status message
    const statusEmbed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle('📤 **DM Broadcast in Progress**')
        .setDescription(`Sending DMs to ${broadcastData.totalMembers.toLocaleString()} members...`)
        .addFields(
            { name: 'Progress', value: `Batch 0/${batches.length} (0%)`, inline: true },
            { name: 'Successful', value: '0', inline: true },
            { name: 'Failed', value: '0', inline: true },
            { name: 'Status', value: '🟡 Starting...', inline: false }
        )
        .setFooter({ text: 'This process may take several minutes' });
    
    const statusMessage = await interaction.followUp({ 
        embeds: [statusEmbed],
        ephemeral: false 
    });
    
    broadcastData.statusMessage = statusMessage;
    
    // Process batches
    for (let i = 0; i < batches.length; i++) {
        if (!broadcastData.isRunning) {
            break; // Stop if broadcast was cancelled
        }
        
        broadcastData.currentBatch = i;
        const batch = batches[i];
        
        // Update status
        await updateBroadcastStatus(broadcastData);
        
        // Process current batch
        await processBatch(batch, broadcastData);
        
        // Wait between batches (except for last batch)
        if (i < batches.length - 1 && broadcastData.isRunning) {
            await sleep(batchDelay);
        }
    }
    
    // Broadcast complete
    await finishBroadcast(broadcastData);
}

// Process a batch of members
async function processBatch(batch, broadcastData) {
    const { message, youtubeInfo, role } = broadcastData;
    
    const promises = batch.map(async (member) => {
        try {
            const dmEmbed = createDMEmbed(message, youtubeInfo, role);
            await member.send({ embeds: [dmEmbed] });
            broadcastData.successful++;
            return { success: true, member: member.user.tag };
        } catch (error) {
            broadcastData.failed++;
            return { success: false, member: member.user.tag, error: error.message };
        }
    });
    
    // Process batch with concurrency limit
    const concurrencyLimit = 5; // Send 5 DMs at a time
    for (let i = 0; i < promises.length; i += concurrencyLimit) {
        const chunk = promises.slice(i, i + concurrencyLimit);
        await Promise.allSettled(chunk);
        await sleep(1000); // Small delay between chunks
    }
}

// Update broadcast status
async function updateBroadcastStatus(broadcastData) {
    const { batches, currentBatch, successful, failed, totalMembers, statusMessage, startTime } = broadcastData;
    
    const progress = Math.round(((currentBatch + 1) / batches.length) * 100);
    const elapsed = Date.now() - startTime;
    const elapsedFormatted = formatDuration(Math.floor(elapsed / 1000));
    
    const statusEmbed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle('📤 **DM Broadcast in Progress**')
        .setDescription(`Sending DMs to ${totalMembers.toLocaleString()} members...`)
        .addFields(
            { name: 'Progress', value: `Batch ${currentBatch + 1}/${batches.length} (${progress}%)`, inline: true },
            { name: 'Successful', value: successful.toLocaleString(), inline: true },
            { name: 'Failed', value: failed.toLocaleString(), inline: true },
            { name: 'Time Elapsed', value: elapsedFormatted, inline: true },
            { name: 'Status', value: '🟡 Running...', inline: false }
        )
        .setFooter({ text: 'Use /dm-stop to cancel the broadcast' });
    
    await statusMessage.edit({ embeds: [statusEmbed] });
}

// Finish broadcast
async function finishBroadcast(broadcastData) {
    const { interaction, successful, failed, totalMembers, statusMessage, startTime, isRunning } = broadcastData;
    
    const elapsed = Date.now() - startTime;
    const elapsedFormatted = formatDuration(Math.floor(elapsed / 1000));
    
    const completionEmbed = new EmbedBuilder()
        .setColor(isRunning ? 0x2ECC71 : 0xE74C3C)
        .setTitle(isRunning ? '✅ **DM Broadcast Complete**' : '⏹️ **DM Broadcast Stopped**')
        .addFields(
            { name: '✅ Successful', value: successful.toLocaleString(), inline: true },
            { name: '❌ Failed', value: failed.toLocaleString(), inline: true },
            { name: '📊 Total Members', value: totalMembers.toLocaleString(), inline: true },
            { name: '⏱️ Time Taken', value: elapsedFormatted, inline: true },
            { name: 'Success Rate', value: `${Math.round((successful / totalMembers) * 100)}%`, inline: true }
        );
    
    await statusMessage.edit({ 
        embeds: [completionEmbed],
        components: []
    });
    
    // Clean up
    activeBroadcasts.delete(interaction.user.id);
}

// Stop DM broadcast
async function handleDMStop(interaction) {
    const broadcastData = activeBroadcasts.get(interaction.user.id);
    
    if (!broadcastData) {
        return interaction.reply({ 
            content: '❌ You don\'t have any active DM broadcast.', 
            ephemeral: true 
        });
    }
    
    broadcastData.isRunning = false;
    
    await interaction.reply({ 
        content: '⏹️ **Stopping DM broadcast...**\nThe broadcast will finish the current batch and stop.',
        ephemeral: false 
    });
}

// Check DM status
async function handleDMStatus(interaction) {
    const broadcastData = activeBroadcasts.get(interaction.user.id);
    
    if (!broadcastData) {
        return interaction.reply({ 
            content: '❌ You don\'t have any active DM broadcast.', 
            ephemeral: true 
        });
    }
    
    const { batches, currentBatch, successful, failed, totalMembers, startTime, isRunning } = broadcastData;
    const progress = Math.round(((currentBatch + 1) / batches.length) * 100);
    const elapsed = Date.now() - startTime;
    const elapsedFormatted = formatDuration(Math.floor(elapsed / 1000));
    
    const statusEmbed = new EmbedBuilder()
        .setColor(isRunning ? 0x3498DB : 0xFFA500)
        .setTitle(isRunning ? '📤 **DM Broadcast Status**' : '⏹️ **DM Broadcast Stopping**')
        .addFields(
            { name: 'Progress', value: `Batch ${currentBatch + 1}/${batches.length} (${progress}%)`, inline: true },
            { name: 'Successful', value: successful.toLocaleString(), inline: true },
            { name: 'Failed', value: failed.toLocaleString(), inline: true },
            { name: 'Remaining', value: (totalMembers - successful - failed).toLocaleString(), inline: true },
            { name: 'Time Elapsed', value: elapsedFormatted, inline: true },
            { name: 'Status', value: isRunning ? '🟡 Running' : '🟠 Stopping', inline: false }
        )
        .setFooter({ text: isRunning ? 'Use /dm-stop to cancel' : 'Broadcast is being stopped' });
    
    await interaction.reply({ 
        embeds: [statusEmbed],
        ephemeral: false 
    });
}

// Test DM command
async function handleDMTest(interaction, options) {
    const message = options.getString('message');
    const youtubeUrl = options.getString('youtube_url');
    
    let youtubeInfo = null;
    
    if (youtubeUrl) {
        if (!validateYouTubeUrl(youtubeUrl)) {
            return interaction.reply({ 
                content: '❌ Invalid YouTube URL.', 
                ephemeral: true 
            });
        }
        
        await interaction.deferReply({ ephemeral: true });
        
        try {
            youtubeInfo = await getYouTubeInfo(youtubeUrl);
        } catch (error) {
            youtubeInfo = {
                title: 'YouTube Video',
                url: youtubeUrl,
                author: 'YouTube Creator'
            };
        }
    } else {
        await interaction.deferReply({ ephemeral: true });
    }

    const dmEmbed = createDMEmbed(message, youtubeInfo);
    
    try {
        await interaction.user.send({ embeds: [dmEmbed] });
        
        const successEmbed = new EmbedBuilder()
            .setColor(0x2ECC71)
            .setTitle('✅ **Test DM Sent Successfully!**')
            .setDescription('Check your DMs to see the preview.')
            .addFields(
                { name: 'Message Length', value: `${message.length} characters`, inline: true },
                { name: 'YouTube Included', value: youtubeInfo ? '✅ Yes' : '❌ No', inline: true }
            );
        
        await interaction.editReply({ 
            embeds: [successEmbed],
            ephemeral: true 
        });
        
    } catch (error) {
        await interaction.editReply({ 
            content: '❌ Could not send you a DM. Please check your privacy settings and try again.',
            ephemeral: true 
        });
    }
}

// Other command handlers (keep as before)
async function handleSlashBanWords(interaction) {
    const embed = new EmbedBuilder()
        .setColor(0xE74C3C)
        .setTitle('🚫 **Banned Words List**')
        .setDescription('Messages containing these words will be automatically deleted:')
        .addFields(
            { name: 'Total Words', value: BAN_WORDS.size.toString(), inline: true },
            { name: 'Words', value: Array.from(BAN_WORDS).slice(0, 20).map(w => `• \`${w}\``).join('\n'), inline: false }
        );

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleSlashAddBanWord(interaction, options) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ 
            content: '❌ Administrator permission required.', 
            ephemeral: true 
        });
    }

    const word = options.getString('word').toLowerCase();
    
    if (BAN_WORDS.has(word)) {
        return interaction.reply({ 
            content: `❌ \`${word}\` is already banned.`, 
            ephemeral: true 
        });
    }

    BAN_WORDS.add(word);
    
    const embed = new EmbedBuilder()
        .setColor(0x2ECC71)
        .setTitle('✅ **Word Added to Ban List**')
        .addFields(
            { name: 'Word Added', value: `\`${word}\``, inline: true },
            { name: 'Total Words', value: BAN_WORDS.size.toString(), inline: true }
        );

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleSlashRemoveBanWord(interaction, options) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ 
            content: '❌ Administrator permission required.', 
            ephemeral: true 
        });
    }

    const word = options.getString('word').toLowerCase();
    
    if (!BAN_WORDS.has(word)) {
        return interaction.reply({ 
            content: `❌ \`${word}\` is not in the ban list.`, 
            ephemeral: true 
        });
    }

    BAN_WORDS.delete(word);
    
    const embed = new EmbedBuilder()
        .setColor(0x2ECC71)
        .setTitle('✅ **Word Removed from Ban List**')
        .addFields(
            { name: 'Word Removed', value: `\`${word}\``, inline: true },
            { name: 'Total Words', value: BAN_WORDS.size.toString(), inline: true }
        );

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleSlashStats(interaction) {
    const embed = new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle('📊 **Bot Statistics**')
        .addFields(
            { name: '🏠 Servers', value: client.guilds.cache.size.toString(), inline: true },
            { name: '👥 Cached Users', value: client.users.cache.size.toString(), inline: true },
            { name: '🚫 Banned Words', value: BAN_WORDS.size.toString(), inline: true },
            { name: '📈 Uptime', value: formatDuration(Math.floor(client.uptime / 1000)), inline: true },
            { name: '🏓 Ping', value: `${client.ws.ping}ms`, inline: true }
        );

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleSlashHelp(interaction) {
    const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle('🤖 **Bot Commands Help**')
        .setDescription('Here are all available slash commands:')
        .addFields(
            { name: '`/dm`', value: 'Send DM to all members with YouTube link and batch options', inline: false },
            { name: '`/dm-test`', value: 'Test DM to yourself first', inline: false },
            { name: '`/dm-stop`', value: 'Stop an ongoing DM broadcast', inline: false },
            { name: '`/dm-status`', value: 'Check status of DM broadcast', inline: false },
            { name: '`/banwords`', value: 'Show banned words list', inline: false },
            { name: '`/addbanword <word>`', value: 'Add word to ban list (Admin)', inline: false },
            { name: '`/removebanword <word>`', value: 'Remove word from ban list (Admin)', inline: false },
            { name: '`/stats`', value: 'Show bot statistics', inline: false },
            { name: '`/ping`', value: 'Check bot latency', inline: false },
            { name: '`/help`', value: 'Show this help menu', inline: false }
        );

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleSlashPing(interaction) {
    const sent = await interaction.reply({ 
        content: '🏓 Pinging...', 
        fetchReply: true,
        ephemeral: true 
    });
    
    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    
    const embed = new EmbedBuilder()
        .setColor(0x2ECC71)
        .setTitle('🏓 **Pong!**')
        .addFields(
            { name: 'Bot Latency', value: `${latency}ms`, inline: true },
            { name: 'API Latency', value: `${Math.round(client.ws.ping)}ms`, inline: true }
        );

    await interaction.editReply({ 
        content: '',
        embeds: [embed],
        ephemeral: true 
    });
}

// ==================== MESSAGE HANDLER ====================

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    const content = message.content.toLowerCase();
    for (const word of BAN_WORDS) {
        if (content.includes(word)) {
            try {
                await message.delete();
                
                const warning = await message.channel.send({
                    content: `${message.author}, your message contained banned content and was deleted.`,
                });
                
                setTimeout(() => warning.delete().catch(() => {}), 5000);
                
                return;
            } catch (error) {
                console.error('Error deleting message:', error.message);
            }
        }
    }
});

// Handle slash commands
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName, options } = interaction;

    try {
        switch (commandName) {
            case 'dm':
                await handleSlashDM(interaction, options);
                break;
            case 'dm-test':
                await handleDMTest(interaction, options);
                break;
            case 'dm-stop':
                await handleDMStop(interaction);
                break;
            case 'dm-status':
                await handleDMStatus(interaction);
                break;
            case 'banwords':
                await handleSlashBanWords(interaction);
                break;
            case 'addbanword':
                await handleSlashAddBanWord(interaction, options);
                break;
            case 'removebanword':
                await handleSlashRemoveBanWord(interaction, options);
                break;
            case 'stats':
                await handleSlashStats(interaction);
                break;
            case 'help':
                await handleSlashHelp(interaction);
                break;
            case 'ping':
                await handleSlashPing(interaction);
                break;
        }
    } catch (error) {
        console.error('Command error:', error);
        await interaction.reply({ 
            content: '❌ An error occurred while processing the command.', 
            ephemeral: true 
        });
    }
});

// ==================== HELPER FUNCTIONS ====================

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== ERROR HANDLING ====================

client.on('error', error => {
    console.error('Discord client error:', error);
});

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

// ==================== LOGIN ====================

const TOKEN = process.env.DISCORD_BOT_TOKEN;
if (!TOKEN) {
    console.error('========================================');
    console.error('❌ ERROR: DISCORD_BOT_TOKEN not found!');
    console.error('Create .env file with: DISCORD_BOT_TOKEN=your_token');
    console.error('========================================');
    process.exit(1);
}

client.login(TOKEN).catch(error => {
    console.error('❌ Login failed:', error.message);
    process.exit(1);
});
