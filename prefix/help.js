const fs = require('fs');
const path = require('path');
const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} = require('discord.js');

const COMMANDS_PER_PAGE = 15;
const BTN_PREV = 'help_prev';
const BTN_NEXT = 'help_next';
const COLLECTOR_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes idle before buttons disable

function buildPageContainer(commands, page, totalPages, requester) {
    const start = page * COMMANDS_PER_PAGE;
    const pageCommands = commands.slice(start, start + COMMANDS_PER_PAGE);
    const prefix = '-';

    const commandList = pageCommands
        .map(cmd => `**\`${prefix}${cmd.name}\`** — ${cmd.description}`)
        .join('\n');

    const container = new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `## <:ShieldCheck:1502514212168274061> Command List\n` +
                `-# **<:sig:1502514350014070795> Requested By:** ${requester}\n` +
                `**<:Dot:1502513706347528213> Total Commands:** ${commands.length}\n\n` +
                `${commandList}`
            )
        );

    // Only show the page footer / buttons row if there's more than one page —
    // no point cluttering a short command list with pagination controls.
    if (totalPages > 1) {
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# Page ${page + 1} / ${totalPages}`)
        );
    }

    return container;
}

function buildButtonRow(page, totalPages) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(BTN_PREV)
            .setLabel('◀ Previous')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId(BTN_NEXT)
            .setLabel('Next ▶')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === totalPages - 1)
    );
}

module.exports = {
    name: 'help',
    description: 'Show all available commands',

    // Usage: -help

    async execute(message, args) {

        const commandsPath = __dirname;
        const files = fs.readdirSync(commandsPath).filter(
            file => file.endsWith('.js') && file !== path.basename(__filename)
        );

        const commands = [];

        for (const file of files) {
            try {
                delete require.cache[require.resolve(path.join(commandsPath, file))];
                const cmd = require(path.join(commandsPath, file));
                if (cmd && cmd.name) {
                    commands.push({
                        name: cmd.name,
                        description: cmd.description || 'No description provided'
                    });
                }
            } catch (err) {}
        }

        commands.sort((a, b) => a.name.localeCompare(b.name));

        const totalPages = Math.max(1, Math.ceil(commands.length / COMMANDS_PER_PAGE));
        let page = 0;

        const components = [buildPageContainer(commands, page, totalPages, message.author)];
        if (totalPages > 1) components.push(buildButtonRow(page, totalPages));

        const helpMessage = await message.reply({
            components,
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { repliedUser: false },
        });

        // Nothing to paginate — skip setting up a collector entirely.
        if (totalPages <= 1) return;

        const collector = helpMessage.createMessageComponentCollector({
            filter: (interaction) => interaction.customId === BTN_PREV || interaction.customId === BTN_NEXT,
            time: COLLECTOR_TIMEOUT_MS,
        });

        collector.on('collect', async (interaction) => {
            // Only the person who ran -help can flip pages, so someone
            // else clicking around doesn't hijack their view.
            if (interaction.user.id !== message.author.id) {
                return interaction.reply({
                    content: "This isn't your help menu — run `-help` to get your own.",
                    flags: MessageFlags.Ephemeral,
                });
            }

            if (interaction.customId === BTN_PREV) page = Math.max(0, page - 1);
            if (interaction.customId === BTN_NEXT) page = Math.min(totalPages - 1, page + 1);

            await interaction.update({
                components: [
                    buildPageContainer(commands, page, totalPages, message.author),
                    buildButtonRow(page, totalPages),
                ],
                flags: MessageFlags.IsComponentsV2,
            });
        });

        collector.on('end', async () => {
            // Disable both buttons once the collector times out so people
            // don't click into a dead interaction.
            const disabledRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(BTN_PREV).setLabel('◀ Previous').setStyle(ButtonStyle.Secondary).setDisabled(true),
                new ButtonBuilder().setCustomId(BTN_NEXT).setLabel('Next ▶').setStyle(ButtonStyle.Secondary).setDisabled(true)
            );
            await helpMessage.edit({
                components: [buildPageContainer(commands, page, totalPages, message.author), disabledRow],
                flags: MessageFlags.IsComponentsV2,
            }).catch(() => {});
        });
    },
};