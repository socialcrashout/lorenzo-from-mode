const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

const {
    Infraction,
    buildHistoryContainer,
    isStaff,
    denyNoPermission,
} = require('../utils/infractionManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('infraction-history')
        .setDescription("View a user's infraction history.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(o => o.setName('user').setDescription('The user to look up.').setRequired(true)),

    async execute(interaction, client) {
        if (!isStaff(interaction.member)) return denyNoPermission(interaction);

        await interaction.deferReply();

        const targetUser = interaction.options.getUser('user', true);

        const infractions = await Infraction.find({ userId: targetUser.id, guildId: interaction.guildId })
            .sort({ createdAt: -1 })
            .lean();

        const container = buildHistoryContainer({ user: targetUser, infractions });

        await interaction.editReply({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
        });
    },
};