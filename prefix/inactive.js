const { ContainerBuilder, TextDisplayBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags } = require('discord.js');

// ====== EASY CONFIG ======
const LOG_CHANNEL_ID = '1506450870269906944'; // channel where inactive notices get logged
const ALLOWED_ROLE_IDS = [
    '1504320706341502996',
    '1504313264576925757',
    '1504312910862880879',
    '1504311819458580531',
];

const FOOTER_IMAGE_URL = 'https://yumi.onl/api/files/6a6974fa91bbc4fb21f03ab5/raw'; // hardcoded footer image
// ==========================

module.exports = {
    name: 'inactive',
    description: 'Send an inactivity notice to a member',
    // Usage: -inactive @user

    async execute(message, args) {
        const errorReply = (text) => message.reply({
            components: [new ContainerBuilder().addTextDisplayComponents(
                new TextDisplayBuilder().setContent(text)
            )],
            flags: MessageFlags.IsComponentsV2,
        });

        if (!message.member.roles.cache.some(role => ALLOWED_ROLE_IDS.includes(role.id))) {
            return errorReply('<:warning:1531049700520624278> You do not have permission to send inactivity notices.');
        }

        const target = message.mentions.members?.first();

        if (!target) {
            return errorReply('<:WarningIcon:1508245066135765034> Please mention a member. Usage: `-inactive @user`');
        }

        try {
            const timestamp = Math.floor(Date.now() / 1000);

            const logChannel = message.guild.channels.cache.get(LOG_CHANNEL_ID);

            if (logChannel) {
                const logContainer = new ContainerBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `## <:ShieldCheck:1502514212168274061> Inactivity Notice Logged\n` +
                            `-# **<:sig:1502514350014070795> Logged By:** ${message.author}\n` +
                            `**<:person:1502514200705105981> Member:** ${target.user.tag} (${target.id})\n` +
                            `**<:Dot:1502513706347528213> Channel:** ${message.channel}\n` +
                            `**<:Calendar:1502513561866473734> Timestamp:** <t:${timestamp}:F>`
                        )
                    )
                    .addMediaGalleryComponents(
                        new MediaGalleryBuilder().addItems(
                            new MediaGalleryItemBuilder().setURL(FOOTER_IMAGE_URL)
                        )
                    );

                await logChannel.send({
                    components: [logContainer],
                    flags: MessageFlags.IsComponentsV2,
                    allowedMentions: { parse: [] },
                });
            }

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `## <:mode_branding_20260510_032226_00:1506790198917206156> | Ticket Inactive\n` +
                        `<:userquestion:1502514545791471628> Hello <@${target.id}>, this ticket has been inactive, and we have not received a response from you. **Please reply to this ticket as soon as possible so we can proceed with your request**. If we do not receive a response within a reasonable timeframe, this ticket may be closed.\n`
                    )
                )
                .addMediaGalleryComponents(
                    new MediaGalleryBuilder().addItems(
                        new MediaGalleryItemBuilder().setURL(FOOTER_IMAGE_URL)
                    )
                );

            await message.channel.send({
                components: [container],
                flags: MessageFlags.IsComponentsV2
            });

        } catch (error) {
            console.error(error);
            await errorReply('Something went wrong while logging that inactivity notice.');
        }
    },
};