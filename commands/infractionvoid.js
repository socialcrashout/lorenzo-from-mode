const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

const {
    Infraction,
    buildInfractionContainer,
    logAction,
    isStaff,
    denyNoPermission,
    tryDM,
} = require('../utils/infractionManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('infraction-void')
        .setDescription('Void an existing infraction.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addStringOption(o => o.setName('infraction_id').setDescription('The infraction ID, e.g. INF-1234567').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason for voiding.').setRequired(false)),

    async execute(interaction, client) {
        if (!isStaff(interaction.member)) return denyNoPermission(interaction);

        await interaction.deferReply();

        const infractionId = interaction.options.getString('infraction_id', true);
        const voidReason = interaction.options.getString('reason') || 'No reason provided.';

        const infraction = await Infraction.findOne({ infractionId });
        if (!infraction) {
            return interaction.editReply({ content: `No infraction found with ID \`${infractionId}\`.` });
        }

        if (infraction.status === 'Voided') {
            return interaction.editReply({ content: `Infraction \`${infractionId}\` is already voided.` });
        }

        infraction.status = 'Voided';
        infraction.voidReason = voidReason;
        infraction.voidedById = interaction.user.id;
        infraction.voidedByTag = interaction.user.tag;
        infraction.voidedAt = new Date();
        await infraction.save();

        const fields = [
            ['User', `<@${infraction.userId}>`],
            ['Infraction ID', `\`${infraction.infractionId}\``],
            ['Original Action', infraction.action],
            ['Void Reason', voidReason],
            ['Voided by', `<@${interaction.user.id}>`],
            ['Date', `<t:${Math.floor(infraction.voidedAt.getTime() / 1000)}:F>`],
            ['Appealable', 'N/A'],
        ];

        const container = buildInfractionContainer({ headerAction: 'Voided', fields });

        const dmSent = await tryDM(client, infraction.userId, container);

        await interaction.editReply({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
        });

        if (!dmSent) {
            await interaction.followUp({ content: `Note: I couldn't DM <@${infraction.userId}> (their DMs may be closed).`, ephemeral: true });
        }

        await logAction(client, {
            fullContainer: container,
            eventType: 'Voided',
            issuerId: interaction.user.id,
            targetId: infraction.userId,
            action: infraction.action,
            reason: voidReason,
            infractionId: infraction.infractionId,
        });
    },
};