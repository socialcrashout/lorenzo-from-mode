const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    FileBuilder,
    AttachmentBuilder,
    MessageFlags,
} = require('discord.js');

// Hardcoded footer image shown at the bottom of every free release post
const FOOTER_URL = 'https://yumi.onl/api/files/6a6974fa91bbc4fb21f03ab5/raw';
// Role to ping in the greeting line
const FREE_RELEASE_ROLE_ID = '1504311819458580531';

// Channel the release always gets posted in, regardless of where the command is run
const TARGET_CHANNEL_ID = '1502526424505123008';

// Only users with at least one of these role IDs can run the command
const ALLOWED_ROLE_IDS = [
    '1504312910862880879',
    '1504313264576925757',
    // add more role IDs as needed
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('freerelease')
        .setDescription('Post a free release')
        .addUserOption(opt =>
            opt.setName('designer')
                .setDescription('Who created/provided this release')
                .setRequired(true)
        )
        .addAttachmentOption(opt =>
            opt.setName('file')
                .setDescription('The release file')
                .setRequired(true)
        )
        .addAttachmentOption(opt =>
            opt.setName('image')
                .setDescription('Preview image (optional showcase)')
                .setRequired(false)
        ),

    async execute(interaction, client) {
        // Role gate — works no matter which channel the command is run in
        const member = interaction.member;
        const hasAllowedRole = member?.roles?.cache?.some(role =>
            ALLOWED_ROLE_IDS.includes(role.id)
        );

        if (!hasAllowedRole) {
            return interaction.reply({
                content: "You don't have permission to use this command.",
                flags: MessageFlags.Ephemeral,
            });
        }

        const designer = interaction.options.getUser('designer');
        const file = interaction.options.getAttachment('file');
        const previewImage = interaction.options.getAttachment('image');

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const targetChannel = await client.channels.fetch(TARGET_CHANNEL_ID);
        if (!targetChannel || !targetChannel.isTextBased()) {
            return interaction.editReply({
                content: 'Could not find the target channel to post in.',
            });
        }

        const container = new ContainerBuilder();
        // No .setAccentColor() call -> no accent color on the container

        // Header
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '## <:mode_branding_20260510_032226_00:1506790198917206156> Free Release'
            )
        );

        // Body
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `Hello <@&${FREE_RELEASE_ROLE_ID}>,\n\n` +
                `Check out our latest free release! Feel free to use it in your server, project, or community. All we ask is that you provide credit if someone asks who created or provided it.\n\n` +
                `**Provided by:** ${designer}`
            )
        );

        // Optional preview image
        if (previewImage) {
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent('**Preview:**')
            );
            container.addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL(previewImage.url)
                )
            );
        }

        // The actual release file, attached to the message and referenced in the container
        const attachment = new AttachmentBuilder(file.url, { name: file.name });
        container.addFileComponents(
            new FileBuilder().setURL(`attachment://${file.name}`)
        );

        // Footer image
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL(FOOTER_URL)
            )
        );

        // Post to the fixed target channel, not wherever the command was run
        await targetChannel.send({
            components: [container],
            files: [attachment],
            flags: MessageFlags.IsComponentsV2,
        });

        // Ephemeral confirmation back to whoever ran the command
        await interaction.editReply({
            content: `Posted to <#${TARGET_CHANNEL_ID}>.`,
        });
    },
};