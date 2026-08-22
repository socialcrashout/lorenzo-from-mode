const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

const {
    Infraction,
    generateInfractionId,
    buildInfractionContainer,
    logAction,
    isStaff,
    denyNoPermission,
    tryDM,
} = require('../utils/infractionManager');

const ACTION_CHOICES = [
    { name: 'Notice', value: 'Notice' },
    { name: 'Warning', value: 'Warning' },
    { name: 'Strike', value: 'Strike' },
    { name: 'Suspension', value: 'Suspension' },
    { name: 'Termination', value: 'Termination' },
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('infraction-issue')
        .setDescription('Issue a new infraction to a user.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(o => o.setName('user').setDescription('The user to infract.').setRequired(true))
        .addStringOption(o => o.setName('action').setDescription('The infraction action.').setRequired(true).addChoices(...ACTION_CHOICES))
        .addStringOption(o => o.setName('reason').setDescription('Reason for the infraction.').setRequired(true))
        .addBooleanOption(o => o.setName('appealable').setDescription('Can this infraction be appealed?').setRequired(true)),

    async execute(interaction, client) {
        if (!isStaff(interaction.member)) return denyNoPermission(interaction);

        await interaction.deferReply();

        const targetUser = interaction.options.getUser('user', true);
        const action = interaction.options.getString('action', true);
        const reason = interaction.options.getString('reason', true);
        const appealable = interaction.options.getBoolean('appealable', true);

        const infractionId = generateInfractionId();

        const infraction = await Infraction.create({
            guildId: interaction.guildId,
            userId: targetUser.id,
            userTag: targetUser.tag,
            infractionId,
            action,
            reason,
            appealable,
            issuedById: interaction.user.id,
            issuedByTag: interaction.user.tag,
        });

        const fields = [
            ['User', `<@${targetUser.id}>`],
            ['Infraction ID', `\`${infraction.infractionId}\``],
            ['Action Issued', action],
            ['Reason', reason],
            ['Issued by', `<@${interaction.user.id}>`],
            ['Date', `<t:${Math.floor(infraction.createdAt.getTime() / 1000)}:F>`],
            ['Appealable', appealable ? 'Yes' : 'No'],
        ];

        const container = buildInfractionContainer({ headerAction: action, fields });

        const dmSent = await tryDM(client, targetUser.id, container);

        await interaction.editReply({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
        });

        if (!dmSent) {
            await interaction.followUp({ content: `Note: I couldn't DM <@${targetUser.id}> (their DMs may be closed).`, ephemeral: true });
        }

        await logAction(client, {
            fullContainer: container,
            eventType: 'Issued',
            issuerId: interaction.user.id,
            targetId: targetUser.id,
            action,
            reason,
            infractionId: infraction.infractionId,
        });
    },
};