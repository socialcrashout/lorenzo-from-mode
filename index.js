require('dotenv').config();

const { Client, GatewayIntentBits, Collection, REST, Routes, Events } = require('discord.js')
const fs = require('fs')
const path = require('path')
const ticketManager = require('./utils/ticketManager')
const { connectDB } = require('./db');

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID, PREFIX } = process.env;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers, 
        GatewayIntentBits.GuildPresences,
    ]
});

client.commands = new Collection();
client.slashCommands = new Collection();

// Simple logger attached to the client so any command/event can use it
client.logs = {
    info: (...args) => console.log('[INFO]', ...args),
    custom: (...args) => console.log('[LOG]', ...args),
    warn: (...args) => console.warn('[WARN]', ...args),
    error: (...args) => console.error('[ERROR]', ...args),
};

function requireCommand(filePath) {
    try {
        if (require.cache[require.resolve(filePath)]) {
            delete require.cache[require.resolve(filePath)]
        }
        return require(filePath);
    } catch (err) {
        console.error(`failed to load file @ ${filePath}`, err)
        return null;
    }
}

function loadPrefixCommands() {
    client.commands.clear();
    const commandPath = path.join(__dirname, "prefix");

    if (!fs.existsSync(commandPath)) return;

    const files = fs.readdirSync(commandPath).filter(f => f.endsWith(".js"));

    for (const file of files) {
        const command = requireCommand(path.join(commandPath, file));
        if (command && command.name && command.execute) {
            client.commands.set(command.name, command);
        }
    }

    console.log(`loaded ${client.commands.size} prefix commands successfully.`)
}

function loadSlashCommands() {
    client.slashCommands.clear();
    const slashPath = path.join(__dirname, "commands");

    if (!fs.existsSync(slashPath)) return [];

    const files = fs.readdirSync(slashPath).filter(f => f.endsWith(".js"));
    const slashData = [];

    for (const file of files) {
        const command = requireCommand(path.join(slashPath, file));
        if (command && command.data && command.execute) {
            client.slashCommands.set(command.data.name, command);
            slashData.push(command.data.toJSON());
        }
    }

    console.log(`Loaded ${client.slashCommands.size} slash commands.`);
    return slashData;
}

function loadEvents() {
    const eventsPath = path.join(__dirname, "events");

    if (!fs.existsSync(eventsPath)) {
        console.log("No events folder found, skipping event loading.");
        return;
    }

    const files = fs.readdirSync(eventsPath).filter(f => f.endsWith(".js"));
    let count = 0;

    for (const file of files) {
        const event = requireCommand(path.join(eventsPath, file));
        if (!event || !event.name || !event.execute) {
            console.warn(`Skipping invalid event file: ${file}`);
            continue;
        }

        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args, client));
        } else {
            client.on(event.name, (...args) => event.execute(...args, client));
        }
        count++;
    }

    console.log(`Loaded ${count} event(s) from /events.`);
}

async function deploySlashCommands() {
    if (!DISCORD_TOKEN || !CLIENT_ID) {
        return console.error("Cannot deploy commands: Missing DISCORD_TOKEN or CLIENT_ID in .env");
    }

    const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
    const commands = loadSlashCommands();

    try {
        console.log("Deploying slash commands...");
        
        const route = GUILD_ID 
            ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
            : Routes.applicationCommands(CLIENT_ID);

        await rest.put(route, { body: commands });
        console.log("Slash commands successfully deployed.");
    } catch (err) {
        console.error("Error deploying slash commands:", err);
    }
}

client.once(Events.ClientReady, c => {
    console.log(`Logged in as ${c.user.tag}`);
});

client.on(Events.MessageCreate, async message => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();
    const command = client.commands.get(commandName);

    if (!command) return;

    try {
        await command.execute(message, args, client);
    } catch (err) {
        console.error(`Error running prefix command ${commandName}:`, err);
        message.reply("There was an error executing that command.").catch(console.error);
    }
});

client.on(Events.InteractionCreate, async interaction => {
    // Ticket system: category select menu on the panel
    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === ticketManager.SELECT_ID) {
            try {
                await ticketManager.handleCategorySelect(interaction, client);
            } catch (err) {
                console.error("Error handling ticket category select:", err);
            }
            return;
        }
        // not a ticket select — fall through to generic dispatch below
    }

    if (interaction.isButton()) {
        // Ticket system: claim / close / close-confirm / close-cancel / escalate
        const ticketButtonIds = [
            ticketManager.BTN_CLAIM,
            ticketManager.BTN_CLOSE,
            ticketManager.BTN_CLOSE_CONFIRM,
            ticketManager.BTN_CLOSE_CANCEL,
            ticketManager.BTN_ESCALATE,
        ];

        if (ticketButtonIds.includes(interaction.customId)) {
            try {
                await ticketManager.handleButton(interaction, client);
            } catch (err) {
                console.error("Error handling ticket button:", err);
            }
            return;
        }

        const verification = client.slashCommands.get("setup-verification");

        if (verification && interaction.customId === verification.VERIFY_BUTTON_ID) {
            try {
                await verification.handleVerifyButton(interaction);
            } catch (err) {
                console.error("Error handling verify button:", err);
            }
            return;
        }

        if (verification && interaction.customId === verification.CONTINUE_BUTTON_ID) {
            try {
                await verification.handleContinueButton(interaction);
            } catch (err) {
                console.error("Error handling continue button:", err);
            }
            return;
        }
        // not a recognized ticket/verification button — fall through to generic dispatch below
    }

    if (
        interaction.isStringSelectMenu() ||
        interaction.isButton() ||
        interaction.isModalSubmit() ||
        (interaction.isUserSelectMenu && interaction.isUserSelectMenu()) ||
        (interaction.isRoleSelectMenu && interaction.isRoleSelectMenu())
    ) {
        for (const command of client.slashCommands.values()) {
            if (typeof command.handleComponent !== "function") continue;
            try {
                const handled = await command.handleComponent(interaction, client);
                if (handled) return;
            } catch (err) {
                console.error(`Error in ${command.data?.name}'s handleComponent:`, err);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: "Something went wrong handling that.",
                        ephemeral: true,
                    }).catch(() => {});
                }
                return;
            }
        }

        // Prefix commands can also export handleComponent (e.g. -supportapp)
        for (const command of client.commands.values()) {
            if (typeof command.handleComponent !== "function") continue;
            try {
                const handled = await command.handleComponent(interaction, client);
                if (handled) return;
            } catch (err) {
                console.error(`Error in prefix command ${command.name}'s handleComponent:`, err);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: "Something went wrong handling that.",
                        ephemeral: true,
                    }).catch(() => {});
                }
                return;
            }
        }

        return; // nobody claimed it
    }

    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === "sync") {
        loadPrefixCommands();
        return interaction.reply({
            content: `Reloaded ${client.commands.size} prefix commands.`,
            ephemeral: true
        });
    }

    if (commandName === "deploy") {
        await interaction.deferReply({ ephemeral: true });
        await deploySlashCommands();
        return interaction.editReply("Slash commands deployed.");
    }

    const command = client.slashCommands.get(commandName);
    if (!command) return;

    try {
        await command.execute(interaction, client);
    } catch (err) {
        console.error(`Error running slash command ${commandName}:`, err);
        
        const errorMessage = "An error occurred while executing this command.";
        if (interaction.replied || interaction.deferred) {
            await interaction.editReply({ content: errorMessage }).catch(console.error);
        } else {
            await interaction.reply({ content: errorMessage, ephemeral: true }).catch(console.error);
        }
    }
});

const MEMBER_COUNT_CHANNEL_ID = "u can change this if u want";

async function updateMemberCount(guild) {
    try {
        const channel = await guild.channels.fetch(MEMBER_COUNT_CHANNEL_ID).catch(() => null);
        if (!channel) return;

        await channel.setName(`👥 Members: ${guild.memberCount}`);
    } catch (err) {
        console.error("Failed to update member count channel:", err);
    }
}

client.on(Events.GuildMemberAdd, async member => {
    await updateMemberCount(member.guild);
});

client.on(Events.GuildMemberRemove, async member => {
    await updateMemberCount(member.guild);
});

async function start() {
    await connectDB(); // connect to MongoDB before anything else runs

    loadPrefixCommands();
    loadSlashCommands();
    loadEvents();

    await deploySlashCommands();

    client.login(DISCORD_TOKEN);
}

start();