const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const ROBLOX_API_KEY = process.env.ROBLOX_GAMEPASS_API_KEY;
const UNIVERSE_ID = process.env.ROBLOX_UNIVERSE_ID;

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

        if (!ROBLOX_API_KEY || !UNIVERSE_ID) {
            return interaction.reply({
                content: 'Missing `ROBLOX_GAMEPASS_API_KEY` or `ROBLOX_UNIVERSE_ID` in .env.',
                ephemeral: true
            });
        }

        await interaction.deferReply();

        const logo = interaction.options.getAttachment('logo');
        const name = interaction.options.getString('name');
        const price = interaction.options.getInteger('price');
        const regionalPrice = interaction.options.getBoolean('regional_price');

        if (!logo.contentType || !logo.contentType.startsWith('image/')) {
            return interaction.editReply('The logo attachment must be an image.');
        }

        try {
            // Download the logo so we can re-upload it to Roblox
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
                return interaction.editReply(
                    `Failed to create gamepass: ${data.errorMessage || data.message || res.status}`
                );
            }

            const gamePassId = data.gamePassId;
            const slug = encodeURIComponent(name.replace(/\s+/g, '-'));
            const link = `https://www.roblox.com/game-pass/${gamePassId}/${slug}`;

            const embed = new EmbedBuilder()
                .setTitle('Gamepass Created')
                .setColor(0x00ff88)
                .addFields(
                    { name: 'Name', value: name, inline: true },
                    { name: 'Price', value: `${price} R$`, inline: true },
                    { name: 'Regional Pricing', value: regionalPrice ? 'Enabled' : 'Disabled', inline: true },
                    { name: 'Gamepass ID', value: `${gamePassId}`, inline: true },
                    { name: 'Link', value: link }
                )
                .setThumbnail(logo.url)
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        } catch (err) {
            console.error('Error creating gamepass:', err);
            return interaction.editReply('Something went wrong creating the gamepass. Check the console logs.');
        }
    }
};