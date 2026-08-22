const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    FileBuilder,
    AttachmentBuilder,
    MessageFlags,
} = require('discord.js');

// Hardcoded banner shown at the top of every free release post
const BANNER_URL = 'https://yumi.onl/api/files/6a89ee96f83791efda3e51ef/raw';

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
        const designer = interaction.options.getUser('designer');
        const file = interaction.options.getAttachment('file');
        const previewImage = interaction.options.getAttachment('image');

        await interaction.deferReply();

        const container = new ContainerBuilder();
        // No .setAccentColor() call -> no accent color on the container

        // Banner
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL(BANNER_URL)
            )
        );

        // Header
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '## <:mode_branding_20260510_032226_00:1506790198917206156> Free Release'
            )
        );

        // Body
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `Hello ${interaction.user},\n\n` +
                `Check out our latest free release! Feel free to use it in your server, project, or community. All we ask is that you provide credit if someone asks who created or provided it.\n\n` +
                `**Provided by:** ${designer}`
            )
        );

        // Optional preview image
        if (previewImage) {
            container.addSeparatorComponents(new SeparatorBuilder());
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent('**Preview:**')
            );
            container.addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL(previewImage.url)
                )
            );
        }

        container.addSeparatorComponents(new SeparatorBuilder());

        // The actual release file, attached to the message and referenced in the container
        const attachment = new AttachmentBuilder(file.url, { name: file.name });
        container.addFileComponents(
            new FileBuilder().setURL(`attachment://${file.name}`)
        );

        await interaction.editReply({
            components: [container],
            files: [attachment],
            flags: MessageFlags.IsComponentsV2,
        });
    },
};