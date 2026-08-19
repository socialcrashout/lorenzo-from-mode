const SERVICES = [
    { key: 'liveries', label: 'Liveries' },
    { key: 'clothing', label: 'Graphics' },
    { key: 'discord', label: 'Discord Server' },
    { key: 'photography', label: 'Photography' },
    { key: 'bot-development', label: 'Bot Development' },
    { key: 'gfx', label: 'GFX' },
]

const STATUS = {
    OPEN: 'open',
    CLOSED: 'closed',
    DELAYED: 'delayed'
}

const EMOJIS = {
    HEADER: '<:emoji:1538247091976151070>',
    [STATUS.OPEN]: '<:L_Open_Status:1502513984949977188>',
    [STATUS.CLOSED]: '<:L_Closed_Status:1502513987777069127>',
    [STATUS.DELAYED]: '<:L_Delayed_Status:1502513989681414194>',
}

//const STATUS_MANAGER_ROLE = 'your role id here'

module.exports = { SERVICES, STATUS, EMOJIS }