const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SectionBuilder,
    ThumbnailBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    MessageFlags,
} = require('discord.js');

const ROBLOX_API_KEY = process.env.ROBLOX_GAMEPASS_API_KEY;
const UNIVERSE_ID = process.env.ROBLOX_UNIVERSE_ID;
const LOG_CHANNEL_ID = '1506450870269906944';

const ALLOWED_ROLE_IDS = [
    '1504311819458580531',
    '1541545207454105660',
    '1504312910862880879'
];

const SELECT_ID = 'find_gamepass_select';

function container(text) {
    return new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(text)
    );
}

async function fetchAllGamePasses() {
    let all = [];
    let pageToken;

    do {
        const url = new URL(`https://apis.roblox.com/game-passes/v1/universes/${UNIVERSE_ID}/game-passes/creator`);
        url.searchParams.set('pageSize', '100');
        if (pageToken) url.searchParams.set('pageToken', pageToken);

        const res = await fetch(url, { headers: { 'x-api-key': ROBLOX_API_KEY } });
        if (!res.ok) break;

        const data = await res.json();
        all = all.concat(data.gamePasses || []);
        pageToken = data.nextPageToken;
    } while (pageToken);

    return all;
}

async function fetchGamePass(gamePassId) {
    const res = await fetch(
        `https://apis.roblox.com/game-passes/v1/universes/${UNIVERSE_ID}/game-passes/${gamePassId}/creator`,
        { headers: { 'x-api-key': ROBLOX_API_KEY } }
    );
    if (!res.ok) return null;
    return res.json();
}

async function fetchThumbnail(gamePassId) {
    try {
        const res = await fetch(
            `https://thumbnails.roblox.com/v1/game-passes?gamePassIds=${gamePassId}&size=150x150&format=Png&isCircular=false`
        );
        const data = await res.json();
        return data?.data?.[0]?.imageUrl || null;
    } catch {
        return null;
    }
}

function extractPrice(pass) {
    const p = pass.priceInformation;
    if (p == null) return pass.isForSale ? 'Unknown' : 'Off Sale';
    if (typeof p === 'number') return `${p} R$`;
    if (typeof p === 'object') {
        const val = p.defaultPrice ?? p.price ?? p.robuxPrice;
        if (val != null) return `${val} R$`;
    }
    return pass.isForSale ? 'Unknown' : 'Off Sale';
}

async function logEvent(guild, text) {
    const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) return;
    await logChannel.send({
        components: [container(text)],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
    }).catch(() => {});
}

module.exports = {
    SELECT_ID,

    data: new SlashCommandBuilder()
        .setName('find')
        .setDescription('Look up Roblox assets')
        .addSubcommand(sub =>
            sub.setName('gamepass')
                .setDescription('List all gamepasses linked to the game')
        ),

    async execute(interaction, client) {
        if (interaction.options.getSubcommand() !== 'gamepass') return;

        const errorReply = (text) => interaction.reply({
            components: [container(text)],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });

        if (!ALLOWED_ROLE_IDS.some(roleId => interaction.member.roles.cache.has(roleId))) {
            return errorReply('You do not have the required role to use this command.');
        }

        if (!ROBLOX_API_KEY || !UNIVERSE_ID) {
            return errorReply('Missing `ROBLOX_GAMEPASS_API_KEY` or `ROBLOX_UNIVERSE_ID` in .env.');
        }

        await interaction.deferReply();

        try {
            const passes = await fetchAllGamePasses();

            if (passes.length === 0) {
                return interaction.editReply({
                    components: [container('No gamepasses found for this game.')],
                    flags: MessageFlags.IsComponentsV2,
                });
            }

            const shown = passes.slice(0, 25);

            const menu = new StringSelectMenuBuilder()
                .setCustomId(SELECT_ID)
                .setPlaceholder('Select a gamepass to view details')
                .addOptions(shown.map(p => ({
                    label: p.name.slice(0, 100),
                    value: String(p.gamePassId),
                    description: `ID: ${p.gamePassId}`.slice(0, 100),
                })));

            const row = new ActionRowBuilder().addComponents(menu);

            let content = `## Gamepasses (${passes.length})\nSelect one below to view its price and link.`;
            if (passes.length > 25) {
                content += `\n-# Only the first 25 of ${passes.length} are shown due to Discord's limit.`;
            }

            await interaction.editReply({
                components: [container(content), row],
                flags: MessageFlags.IsComponentsV2,
            });

            await logEvent(interaction.guild,
                `## Find Gamepass Used\n**Used By:** ${interaction.user}\n**Total Found:** ${passes.length}\n**Timestamp:** <t:${Math.floor(Date.now() / 1000)}:F>`
            );
        } catch (err) {
            console.error('Error listing gamepasses:', err);
            await interaction.editReply({
                components: [container('Something went wrong fetching gamepasses. Check the console logs.')],
                flags: MessageFlags.IsComponentsV2,
            });
        }
    },

    async handleComponent(interaction, client) {
        if (!interaction.isStringSelectMenu() || interaction.customId !== SELECT_ID) return false;

        if (!ALLOWED_ROLE_IDS.some(roleId => interaction.member.roles.cache.has(roleId))) {
            await interaction.reply({
                components: [container('You do not have the required role to use this.')],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });
            return true;
        }

        await interaction.deferUpdate();

        const gamePassId = interaction.values[0];

        try {
            const pass = await fetchGamePass(gamePassId);

            if (!pass) {
                await interaction.editReply({
                    components: [container(`Could not fetch details for gamepass \`${gamePassId}\`.`)],
                    flags: MessageFlags.IsComponentsV2,
                });
                return true;
            }

            const thumbUrl = await fetchThumbnail(gamePassId);
            const link = `https://www.roblox.com/game-pass/${pass.gamePassId}/${encodeURIComponent(pass.name.replace(/\s+/g, '-'))}`;
            const price = extractPrice(pass);
            const timestamp = Math.floor(Date.now() / 1000);

            const content =
                `## Gamepass Details\n` +
                `**Name**\n${pass.name}\n\n` +
                `**Price**\n${price}\n\n` +
                `**For Sale**\n${pass.isForSale ? 'Yes' : 'No'}\n\n` +
                `**Gamepass ID**\n${pass.gamePassId}\n\n` +
                `**Link**\n${link}\n\n` +
                `-# <t:${timestamp}:f>`;

            const resultContainer = thumbUrl
                ? new ContainerBuilder().addSectionComponents(
                    new SectionBuilder()
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
                        .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbUrl))
                )
                : container(content);

            await interaction.editReply({
                components: [resultContainer],
                flags: MessageFlags.IsComponentsV2,
            });

            await logEvent(interaction.guild,
                `## Gamepass Selected\n**Used By:** ${interaction.user}\n**Name:** ${pass.name}\n**Price:** ${price}\n**Link:** ${link}\n**Timestamp:** <t:${timestamp}:F>`
            );
        } catch (err) {
            console.error('Error fetching selected gamepass:', err);
            await interaction.editReply({
                components: [container('Something went wrong loading that gamepass. Check the console logs.')],
                flags: MessageFlags.IsComponentsV2,
            });
        }

        return true;
    },
};