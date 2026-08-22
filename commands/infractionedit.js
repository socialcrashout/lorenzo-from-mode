const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

const {
    Infraction,
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
        .setName('infraction-edit')
        .setDescription('Edit an existing infraction.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addStringOption(o => o.setName('infraction_id').setDescription('The infraction ID, e.g. INF-1234567').setRequired(true))
        .addStringOption(o => o.setName('action').setDescription('New action.').addChoices(...ACTION_CHOICES))
        .addStringOption(o => o.setName('reason').setDescription('New reason.'))
        .addBooleanOption(o => o.setName('appealable').setDescription('New appealable status.')),

    async execute(interaction, client) {
        if (!isStaff(interaction.member)) return denyNoPermission(interaction);

        await interaction.deferReply();

        const infractionId = interaction.options.getString('infraction_id', true);
        const newAction = interaction.options.getString('action');
        const newReason = interaction.options.getString('reason');
        const newAppealable = interaction.options.getBoolean('appealable');

        const infraction = await Infraction.findOne({ infractionId });
        if (!infraction) {
            return interaction.editReply({ content: `No infraction found with ID \`${infractionId}\`.` });
        }

        if (newAction === null && newReason === null && newAppealable === null) {
            return interaction.editReply({ content: 'You must provide at least one field to edit (action, reason, or appealable).' });
        }

        const editEntries = [];

        if (newAction !== null && newAction !== infraction.action) {
            editEntries.push({
                field: 'action',
                oldValue: infraction.action,
                newValue: newAction,
                editedById: interaction.user.id,
                editedByTag: interaction.user.tag,
            });
            infraction.action = newAction;
        }

        if (newReason !== null && newReason !== infraction.reason) {
            editEntries.push({
                field: 'reason',
                oldValue: infraction.reason,
                newValue: newReason,
                editedById: interaction.user.id,
                editedByTag: interaction.user.tag,
            });
            infraction.reason = newReason;
        }

        if (newAppealable !== null && newAppealable !== infraction.appealable) {
            editEntries.push({
                field: 'appealable',
                oldValue: infraction.appealable ? 'Yes' : 'No',
                newValue: newAppealable ? 'Yes' : 'No',
                editedById: interaction.user.id,
                editedByTag: interaction.user.tag,
            });
            infraction.appealable = newAppealable;
        }

        infraction.editHistory.push(...editEntries);
        await infraction.save();

        const fields = [
            ['User', `<@${infraction.userId}>`],
            ['Infraction ID', `\`${infraction.infractionId}\``],
            ['Action Issued', infraction.action],
            ['Reason', infraction.reason],
            ['Issued by', `<@${infraction.issuedById}>`],
            ['Edited by', `<@${interaction.user.id}>`],
            ['Date', `<t:${Math.floor(infraction.createdAt.getTime() / 1000)}:F>`],
            ['Appealable', infraction.appealable ? 'Yes' : 'No'],
        ];

        const container = buildInfractionContainer({ headerAction: 'Edited', fields });

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
            eventType: 'Edited',
            issuerId: interaction.user.id,
            targetId: infraction.userId,
            action: infraction.action,
            reason: infraction.reason,
            infractionId: infraction.infractionId,
        });
    },
};