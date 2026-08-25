const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SectionBuilder,
    ThumbnailBuilder,
    MessageFlags,
} = require('discord.js');

const ROBLOX_API_KEY = process.env.ROBLOX_GAMEPASS_API_KEY;
const UNIVERSE_ID = process.env.ROBLOX_UNIVERSE_ID;

const LOG_CHANNEL_ID = '1506450870269906944';

const ALLOWED_ROLE_IDS = [
    '1504311819458580531',
    '1504312910862880879',
    '1541545207454105660'
]; // replace with the roles that should be allowed to use this specific command

module.exports = {
    data: new SlashCommandBuilder()
        .setName('create')
        .setDescription('Create Roblox assets')
        .addSubcommand(sub =>
            sub.setName('gamepass')
                .setDescription('Create a new gamepass and put it on sale')
                .addAttachmentOption(opt =>
                    opt.setName('logo')
                        .setDescription('Icon image for the gamepass (png/jpg, ideally 512x512)')
                        .setRequired(true))
                .addStringOption(opt =>
                    opt.setName('name')
                        .setDescription('Gamepass name')
                        .setRequired(true))
                .addIntegerOption(opt =>
                    opt.setName('price')
                        .setDescription('Price in Robux')
                        .setRequired(true)
                        .setMinValue(1))
                .addBooleanOption(opt =>
                    opt.setName('regional_price')
                        .setDescription('Enable regional pricing?')
                        .setRequired(true))
        ),

    async execute(interaction, client) {
        if (interaction.options.getSubcommand() !== 'gamepass') return;

        const errorReply = (text) => interaction.reply({
            components: [
                new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(text)
                )
            ],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });

        if (!ALLOWED_ROLE_IDS.some(roleId => interaction.member.roles.cache.has(roleId))) {
            return errorReply('You do not have the required role to use this command.');
        }

        if (!ROBLOX_API_KEY || !UNIVERSE_ID) {
            return errorReply('Missing `ROBLOX_GAMEPASS_API_KEY` or `ROBLOX_UNIVERSE_ID` in .env.');
        }

        const logo = interaction.options.getAttachment('logo');
        const name = interaction.options.getString('name');
        const price = interaction.options.getInteger('price');
        const regionalPrice = interaction.options.getBoolean('regional_price');

        if (!logo.contentType || !logo.contentType.startsWith('image/')) {
            return errorReply('The logo attachment must be an image.');
        }

        await interaction.deferReply();

        try {
            const imgRes = await fetch(logo.url);
            if (!imgRes.ok) throw new Error(`Failed to download logo (${imgRes.status})`);
            const imgBuffer = Buffer.from(await imgRes.arrayBuffer());

            const form = new FormData();
            form.append('name', name);
            form.append('isForSale', 'true');
            form.append('price', String(price));
            form.append('isRegionalPricingEnabled', String(regionalPrice));
            form.append('imageFile', new Blob([imgBuffer], { type: logo.contentType }), logo.name || 'icon.png');

            const res = await fetch(
                `https://apis.roblox.com/game-passes/v1/universes/${UNIVERSE_ID}/game-passes`,
                {
                    method: 'POST',
                    headers: { 'x-api-key': ROBLOX_API_KEY },
                    body: form
                }
            );

            const data = await res.json();

            if (!res.ok) {
                console.error('Roblox gamepass create error:', data);
                return interaction.editReply({
                    components: [
                        new ContainerBuilder().addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                `Failed to create gamepass: ${data.errorMessage || data.message || res.status}`
                            )
                        )
                    ],
                    flags: MessageFlags.IsComponentsV2,
                });
            }

            const gamePassId = data.gamePassId;
            const slug = encodeURIComponent(name.replace(/\s+/g, '-'));
            const link = `https://www.roblox.com/game-pass/${gamePassId}/${slug}`;
            const timestamp = Math.floor(Date.now() / 1000);

            const resultContainer = new ContainerBuilder()
                .addSectionComponents(
                    new SectionBuilder()
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                `## Gamepass Created\n` +
                                `**Name**\n${name}\n\n` +
                                `**Price**\n${price} R$\n\n` +
                                `**Regional Pricing**\n${regionalPrice ? 'Enabled' : 'Disabled'}\n\n` +
                                `**Gamepass ID**\n${gamePassId}\n\n` +
                                `**Link**\n${link}\n\n` +
                                `-# <t:${timestamp}:f>`
                            )
                        )
                        .setThumbnailAccessory(
                            new ThumbnailBuilder().setURL(logo.url)
                        )
                );

            await interaction.editReply({
                components: [resultContainer],
                flags: MessageFlags.IsComponentsV2,
            });

            const logChannel = interaction.guild.channels.cache.get(LOG_CHANNEL_ID);
            if (logChannel) {
                const logContainer = new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `## Gamepass Created\n` +
                        `**Used By:** ${interaction.user}\n` +
                        `**Name:** ${name}\n` +
                        `**Price:** ${price} R$\n` +
                        `**Regional Pricing:** ${regionalPrice ? 'Enabled' : 'Disabled'}\n` +
                        `**Gamepass ID:** ${gamePassId}\n` +
                        `**Link:** ${link}\n` +
                        `**Timestamp:** <t:${timestamp}:F>`
                    )
                );

                await logChannel.send({
                    components: [logContainer],
                    flags: MessageFlags.IsComponentsV2,
                    allowedMentions: { parse: [] },
                });
            }
        } catch (err) {
            console.error('Error creating gamepass:', err);
            await interaction.editReply({
                components: [
                    new ContainerBuilder().addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            'Something went wrong creating the gamepass. Check the console logs.'
                        )
                    )
                ],
                flags: MessageFlags.IsComponentsV2,
            });
        }
    }
};